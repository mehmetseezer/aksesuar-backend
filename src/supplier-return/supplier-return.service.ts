// Forced re-scan of Prisma types
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierReturnDto } from './dto/create-supplier-return.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  MovementType,
  DeviceStatus,
  CashTransactionType,
  TransactionStatus,
} from '@prisma/client';

@Injectable()
export class SupplierReturnService {
  constructor(private prisma: PrismaService) {}

  async create(
    companyId: number,
    employeeId: number,
    dto: CreateSupplierReturnDto,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplier_id, company_id: companyId },
    });
    if (!supplier) throw new NotFoundException('Tedarikçi bulunamadı');

    if (dto.purchase_id) {
      const purchase = await this.prisma.purchase.findUnique({
        where: { id: dto.purchase_id },
      });
      if (
        purchase &&
        (purchase as any).status === TransactionStatus.CANCELLED
      ) {
        throw new BadRequestException(
          'İptal edilmiş bir alım için iade oluşturulamaz',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 0. Güncel Kur Bilgisini Al
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { usd_rate: true },
      });

      // 1. İade kaydı oluştur
      const receivedCurrency = dto.received_currency || 'TL';
      const usdRate = dto.usd_rate || company?.usd_rate || 0;
      const receivedAmountTl =
        receivedCurrency === 'USD'
          ? Number(dto.received_amount) * Number(usdRate)
          : Number(dto.received_amount);

      const supplierReturn = await (tx.supplierReturn as any).create({
        data: {
          company_id: companyId,
          supplier_id: dto.supplier_id,
          employee_id: employeeId,
          purchase_id: dto.purchase_id,
          total_amount: dto.total_amount,
          received_amount: receivedAmountTl,
          received_currency: receivedCurrency,
          reason: dto.reason,
          description: dto.description,
          usd_rate: usdRate,
        },
      });

      // 2. Kalemleri ekle ve stokları güncelle
      for (const item of dto.items) {
        // 2a. Stok Kontrolü (Satılmış ürünü iade edemez)
        if (item.single_device_id) {
          const device = await tx.singleDevice.findUnique({
            where: { id: item.single_device_id },
          });
          if (!device || device.status !== DeviceStatus.IN_STOCK) {
            throw new BadRequestException(
              `Cihaz (${device?.name || item.single_device_id}) stokta değil (Durum: ${device?.status || 'Bilinmiyor'}). Tedarikçiye iade edilemez. Satılan ürünler önce müşteriden iade alınmalıdır.`,
            );
          }
        }

        if (item.bulk_product_id) {
          const product = await tx.bulkProduct.findUnique({
            where: { id: item.bulk_product_id },
          });
          if (!product || product.quantity < item.quantity) {
            throw new BadRequestException(
              `${product?.brand} ${product?.model} için stokta sadece ${product?.quantity || 0} adet var. Satılmış ürünler tedarikçiye iade edilemez.`,
            );
          }
        }

        await tx.supplierReturnItem.create({
          data: {
            supplier_return_id: supplierReturn.id,
            purchase_item_id: item.purchase_item_id,
            bulk_product_id: item.bulk_product_id,
            single_device_id: item.single_device_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          },
        });

        // Alım kalemi durumunu güncelle
        if (item.purchase_item_id) {
          const purchaseItem = await tx.purchaseItem.findUnique({
            where: { id: item.purchase_item_id },
          });
          if (purchaseItem) {
            const newReturnedQty =
              Number((purchaseItem as any).returned_quantity) + item.quantity;
            const status =
              newReturnedQty >= Number(purchaseItem.quantity)
                ? 'RETURNED'
                : 'PARTIALLY_RETURNED';
            await tx.purchaseItem.update({
              where: { id: item.purchase_item_id },
              data: {
                returned_quantity: newReturnedQty,
                status: status,
              } as any,
            });
          }
        }

        if (item.bulk_product_id) {
          await tx.bulkProduct.update({
            where: { id: item.bulk_product_id },
            data: { quantity: { decrement: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              bulk_product_id: item.bulk_product_id,
              type: MovementType.OUT,
              quantity: item.quantity,
              reason: `Tedarikçi İadesi #${supplierReturn.id}: ${supplier.name} tarafına iade edildi`,
            },
          });
        } else if (item.single_device_id) {
          await tx.singleDevice.update({
            where: { id: item.single_device_id },
            data: { status: DeviceStatus.RETURNED },
          });
          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              single_device_id: item.single_device_id,
              type: MovementType.OUT,
              quantity: 1,
              reason: `Tedarikçi İadesi #${supplierReturn.id}: ${supplier.name} tarafına iade edildi`,
            },
          });
        }
      }

      // 3. Borçtan düşme mantığı
      const debtAdjustment = Number(dto.total_amount) - receivedAmountTl;
      if (debtAdjustment > 0) {
        await tx.supplier.update({
          where: { id: dto.supplier_id },
          data: { total_debt: { decrement: debtAdjustment } },
        });
      }

      // 4. Nakit girişi varsa kasaya ekle
      if (receivedAmountTl > 0) {
        const cashRegister = await tx.cashRegister.findUnique({
          where: { company_id: companyId },
        });
        if (!cashRegister) throw new BadRequestException('Kasa bulunamadı');

        await tx.cashRegister.update({
          where: { id: cashRegister.id },
          data: { balance: { increment: receivedAmountTl } },
        });

        await tx.cashTransaction.create({
          data: {
            company_id: companyId,
            cash_register_id: cashRegister.id,
            type: CashTransactionType.OTHER_INCOME,
            amount: receivedAmountTl,
            reference_id: supplierReturn.id,
            description: `Tedarikçi İadesi #${supplierReturn.id} Nakit Girişi${receivedCurrency === 'USD' ? ` (${dto.received_amount} USD @ ${usdRate})` : ''}`,
          },
        });

        // Gelir Kaydı Oluştur
        await tx.income.create({
          data: {
            company_id: companyId,
            employee_id: employeeId,
            title: `Tedarikçi İadesi #${supplierReturn.id}`,
            amount: receivedAmountTl,
            category: 'ALIM İADESİ',
            description: `Tedarikçi ID: ${dto.supplier_id}${receivedCurrency === 'USD' ? ` (${dto.received_amount} USD)` : ''}`,
          },
        });
      }

      // 5. Alım durumunu güncelle
      const allItems = await tx.purchaseItem.findMany({
        where: { purchase_id: dto.purchase_id },
      });
      if (allItems.length > 0) {
        const allItemsReturned = allItems.every(
          (i) => (i as any).status === 'RETURNED',
        );
        const anyItemReturned = allItems.some(
          (i) =>
            (i as any).status === 'RETURNED' ||
            (i as any).status === 'PARTIALLY_RETURNED',
        );
        const purchaseStatus = allItemsReturned
          ? 'RETURNED'
          : anyItemReturned
            ? 'PARTIALLY_RETURNED'
            : 'COMPLETED';
        await tx.purchase.update({
          where: { id: dto.purchase_id },
          data: { status: purchaseStatus } as any,
        });
      }

      return supplierReturn;
    });
  }

  async findAll(companyId: number, pagination: PaginationDto) {
    const {
      page,
      limit,
      search,
      imei,
      supplierId,
      employeeId,
      startDate,
      endDate,
      minAmount,
      maxAmount,
    } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { company_id: companyId };

    if (supplierId) where.supplier_id = supplierId;
    if (employeeId) where.employee_id = employeeId;

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.created_at.lte = end;
      }
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.total_amount = {};
      if (minAmount !== undefined) where.total_amount.gte = minAmount;
      if (maxAmount !== undefined) where.total_amount.lte = maxAmount;
    }

    if (search) {
      where.OR = [
        { reason: { contains: search } },
        { supplier: { name: { contains: search } } },
        { employee: { name: { contains: search } } },
      ];
    }

    if (imei) {
      where.items = {
        some: {
          singleDevice: {
            imei: { contains: imei },
          },
        },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.supplierReturn.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          supplier: { select: { name: true, id: true } },
          employee: { select: { name: true, id: true } },
          items: {
            include: {
              bulkProduct: {
                select: { id: true, brand: true, model: true, barcode: true },
              },
              singleDevice: { select: { id: true, name: true, imei: true } },
              purchaseItem: {
                include: {
                  purchase: { select: { id: true, created_at: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.supplierReturn.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(companyId: number, id: number) {
    const res = await this.prisma.supplierReturn.findFirst({
      where: { id, company_id: companyId },
      include: {
        supplier: true,
        employee: { select: { name: true } },
        items: {
          include: {
            bulkProduct: true,
            singleDevice: true,
            purchaseItem: {
              include: { purchase: { select: { id: true, created_at: true } } },
            },
          },
        },
      },
    });
    if (!res) throw new NotFoundException('İade kaydı bulunamadı');
    return res;
  }

  async cancel(companyId: number, id: number, employeeId: number) {
    const supplierReturn = await this.prisma.supplierReturn.findFirst({
      where: { id, company_id: companyId },
      include: {
        items: true,
        supplier: true,
      },
    });

    if (!supplierReturn) throw new NotFoundException('İade bulunamadı');
    if ((supplierReturn as any).status === TransactionStatus.CANCELLED)
      throw new BadRequestException('Bu iade zaten iptal edilmiş');

    return this.prisma.$transaction(async (tx) => {
      // 1. Stokları ve PurchaseItem'ları Geri Al
      for (const item of supplierReturn.items) {
        if (item.purchase_item_id) {
          const pi = await tx.purchaseItem.findUnique({
            where: { id: item.purchase_item_id },
          });
          if (pi) {
            const newReturnedQty =
              Number((pi as any).returned_quantity) - item.quantity;
            const status =
              newReturnedQty === 0 ? 'NORMAL' : 'PARTIALLY_RETURNED';
            await tx.purchaseItem.update({
              where: { id: item.purchase_item_id },
              data: {
                returned_quantity: newReturnedQty,
                status: status,
              } as any,
            });
          }
        }

        if (item.bulk_product_id) {
          await tx.bulkProduct.update({
            where: { id: item.bulk_product_id },
            data: { quantity: { increment: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              bulk_product_id: item.bulk_product_id,
              type: MovementType.IN,
              quantity: item.quantity,
              reason: `Tedarikçi İade İptali #${supplierReturn.id}`,
            },
          });
        } else if (item.single_device_id) {
          await tx.singleDevice.update({
            where: { id: item.single_device_id },
            data: { status: DeviceStatus.IN_STOCK },
          });
          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              single_device_id: item.single_device_id,
              type: MovementType.IN,
              quantity: 1,
              reason: `Tedarikçi İade İptali #${supplierReturn.id}`,
            },
          });
        }
      }

      // 2. Borç Düzeltmesini Geri Al
      const debtAdjustment =
        Number(supplierReturn.total_amount) -
        Number(supplierReturn.received_amount);
      if (debtAdjustment > 0) {
        await tx.supplier.update({
          where: { id: supplierReturn.supplier_id },
          data: { total_debt: { increment: debtAdjustment } },
        });
      }

      // 3. Kasa ve Nakit İşlemlerini Geri Al
      if (Number(supplierReturn.received_amount) > 0) {
        const cashRegister = await tx.cashRegister.findUnique({
          where: { company_id: companyId },
        });
        if (cashRegister) {
          await tx.cashRegister.update({
            where: { id: cashRegister.id },
            data: { balance: { decrement: supplierReturn.received_amount } },
          });

          await tx.cashTransaction.create({
            data: {
              company_id: companyId,
              cash_register_id: cashRegister.id,
              type: CashTransactionType.REFUND_OUT,
              amount: supplierReturn.received_amount,
              reference_id: supplierReturn.id,
              description: `Tedarikçi İade İptali #${supplierReturn.id} (Geri Ödeme)`,
            },
          });
        }

        // Gelir kaydını sil
        await tx.income.deleteMany({
          where: {
            company_id: companyId,
            title: `Tedarikçi İadesi #${supplierReturn.id}`,
          },
        });
      }

      // 4. Alım Durumunu Güncelle
      if (supplierReturn.purchase_id) {
        const allItems = await tx.purchaseItem.findMany({
          where: { purchase_id: supplierReturn.purchase_id },
        });
        const allReturned = allItems.every(
          (i) => (i as any).status === 'RETURNED',
        );
        const anyReturned = allItems.some(
          (i) =>
            (i as any).status === 'RETURNED' ||
            (i as any).status === 'PARTIALLY_RETURNED',
        );
        const purchaseStatus = allReturned
          ? 'RETURNED'
          : anyReturned
            ? 'PARTIALLY_RETURNED'
            : 'COMPLETED';

        await tx.purchase.update({
          where: { id: supplierReturn.purchase_id },
          data: { status: purchaseStatus } as any,
        });
      }

      // 5. İade Durumunu Güncelle
      const updatedReturn = await tx.supplierReturn.update({
        where: { id },
        data: { status: TransactionStatus.CANCELLED },
      });

      return updatedReturn;
    });
  }
}
