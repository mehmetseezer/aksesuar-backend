import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/pagination.interface';
import {
  DeviceStatus,
  MovementType,
  ItemStatus,
  TransactionStatus,
  CashTransactionType,
  LedgerType,
} from '@prisma/client';

@Injectable()
export class ReturnService {
  constructor(private prisma: PrismaService) { }

  async create(companyId: number, employeeId: number, dto: CreateReturnDto) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: dto.sale_id, company_id: companyId },
      include: { items: true },
    });

    if (!sale) throw new NotFoundException('Satış bulunamadı');
    if (sale.status === TransactionStatus.CANCELLED) {
      throw new BadRequestException(
        'İptal edilmiş bir satış için iade oluşturulamaz',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let totalReturnAmount = 0;
      const returnItemsData = [];

      for (const item of dto.items) {
        const saleItem = sale.items.find((si) => si.id === item.sale_item_id);
        if (!saleItem) throw new BadRequestException('Geçersiz satış kalemi');

        if (saleItem.quantity - saleItem.returned_quantity < item.quantity) {
          throw new BadRequestException(
            'İade miktarı kalan miktardan fazla olamaz',
          );
        }

        // SaleItem durumunu güncelle
        const newReturnedQuantity = saleItem.returned_quantity + item.quantity;
        const isFullyReturned = newReturnedQuantity === saleItem.quantity;

        await tx.saleItem.update({
          where: { id: saleItem.id },
          data: {
            returned_quantity: newReturnedQuantity,
            status: isFullyReturned
              ? ItemStatus.RETURNED
              : ItemStatus.PARTIALLY_RETURNED,
          },
        });

        // Kaynak bilgisini al
        let customerName = 'Anonim';
        if (sale.customer_id) {
          const customer = await tx.customer.findUnique({
            where: { id: sale.customer_id },
          });
          if (customer) customerName = customer.name;
        }

        // Stok Geri Al
        if (saleItem.bulk_product_id) {
          await tx.bulkProduct.update({
            where: { id: saleItem.bulk_product_id },
            data: { quantity: { increment: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              bulk_product_id: saleItem.bulk_product_id,
              type: MovementType.IN,
              quantity: item.quantity,
              reason: `Satış İadesi #${dto.sale_id}: ${customerName} tarafından iade edildi`,
            },
          });
        } else if (saleItem.single_device_id) {
          await tx.singleDevice.update({
            where: { id: saleItem.single_device_id },
            data: { status: DeviceStatus.IN_STOCK },
          });
          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              single_device_id: saleItem.single_device_id,
              type: MovementType.IN,
              quantity: 1,
              reason: `Satış İadesi #${dto.sale_id}: ${customerName} tarafından iade edildi`,
            },
          });
        }

        totalReturnAmount += Number(saleItem.unit_price) * item.quantity;
        returnItemsData.push({
          sale_item_id: saleItem.id,
          bulkProductId: saleItem.bulk_product_id,
          singleDeviceId: saleItem.single_device_id,
          quantity: item.quantity,
          unit_price: saleItem.unit_price,
        });
      }

      // b. Kâr Güncelleme
      let returnedItemsCost = 0;
      for (const data of returnItemsData) {
        if (data.bulkProductId) {
          const product = await tx.bulkProduct.findUnique({
            where: { id: data.bulkProductId },
          });
          if (product)
            returnedItemsCost += Number(product.purchase_price) * data.quantity;
        } else if (data.singleDeviceId) {
          const device = await tx.singleDevice.findUnique({
            where: { id: data.singleDeviceId },
          });
          if (device) returnedItemsCost += Number(device.purchase_price);
        }
      }
      const profitAdjustment = returnedItemsCost - dto.refund_amount;
      await tx.sale.update({
        where: { id: sale.id },
        data: { profit: { increment: profitAdjustment } },
      });

      // c. İade kaydı oluştur
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { usd_rate: true },
      });

      const returnRecord = await tx.return.create({
        data: {
          company_id: companyId,
          sale_id: sale.id,
          employee_id: employeeId,
          customer_id: sale.customer_id,
          total_amount: totalReturnAmount,
          refund_amount: dto.refund_amount,
          reason: dto.reason,
          description: dto.description,
          usd_rate: company?.usd_rate || 0,
          items: {
            create: returnItemsData.map((item) => ({
              sale_item_id: item.sale_item_id,
              bulk_product_id: item.bulkProductId,
              single_device_id: item.singleDeviceId,
              quantity: item.quantity,
              unit_price: item.unit_price,
            })),
          },
        },
      });

      // d. Komisyon Güncelleme / İptali (Ledger Kaydı Dahil)
      const refundRatio = dto.refund_amount / totalReturnAmount;
      const originalCommission = await tx.commission.findFirst({
        where: { sale_id: sale.id },
      });

      if (originalCommission) {
        const newCommissionAmount =
          Number(originalCommission.amount) * (1 - refundRatio);
        const commissionDiff =
          Number(originalCommission.amount) - newCommissionAmount;

        if (newCommissionAmount > 0) {
          await tx.commission.update({
            where: { id: originalCommission.id },
            data: { amount: newCommissionAmount },
          });
        } else {
          await tx.commission.delete({ where: { id: originalCommission.id } });
        }

        if (commissionDiff !== 0) {
          await tx.employee.update({
            where: { id: sale.employee_id },
            data: { commission_balance: { decrement: commissionDiff } },
          });

          await tx.employeeLedger.create({
            data: {
              company_id: companyId,
              employee_id: sale.employee_id,
              type: LedgerType.ADJUSTMENT,
              amount: -commissionDiff,
              reference_id: returnRecord.id,
              description: `İade #${returnRecord.id} kaynaklı komisyon düzeltmesi (Satış #${sale.id})`,
            },
          });
        }
      }

      // e. Customer Ledger Kaydı
      if (sale.customer_id) {
        // İade Tutarı (Borç Azalır)
        await tx.customerLedger.create({
          data: {
            company_id: companyId,
            customer_id: sale.customer_id,
            type: LedgerType.RETURN,
            amount: -totalReturnAmount,
            reference_id: returnRecord.id,
            description: `İade #${returnRecord.id} (Satış #${sale.id})`,
          },
        });

        // Nakit İade (Borç Geri Artar - Müşteri nakit aldı)
        if (dto.refund_amount > 0) {
          await tx.customerLedger.create({
            data: {
              company_id: companyId,
              customer_id: sale.customer_id,
              type: LedgerType.CUSTOMER_PAYMENT,
              amount: dto.refund_amount,
              reference_id: returnRecord.id,
              description: `İade #${returnRecord.id} Nakit İade`,
            },
          });
        }
      }

      // d. Satış durumunu güncelle
      const allItems = await tx.saleItem.findMany({
        where: { sale_id: sale.id },
      });
      const allReturned = allItems.every(
        (i) => i.status === ItemStatus.RETURNED,
      );
      const anyReturned = allItems.some(
        (i) =>
          i.status === ItemStatus.RETURNED ||
          i.status === ItemStatus.PARTIALLY_RETURNED,
      );

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: allReturned
            ? TransactionStatus.RETURNED
            : anyReturned
              ? TransactionStatus.PARTIALLY_RETURNED
              : TransactionStatus.COMPLETED,
        },
      });

      // e. Nakit iade işlemleri
      if (dto.refund_amount > 0) {
        const cashRegister = await tx.cashRegister.findUnique({
          where: { company_id: companyId },
        });
        if (!cashRegister) throw new BadRequestException('Kasa bulunamadı');

        await tx.cashRegister.update({
          where: { id: cashRegister.id },
          data: { balance: { decrement: dto.refund_amount } },
        });

        await tx.cashTransaction.create({
          data: {
            company_id: companyId,
            cash_register_id: cashRegister.id,
            type: CashTransactionType.REFUND_OUT,
            amount: dto.refund_amount,
            reference_id: returnRecord.id,
            description: `Satış İadesi #${returnRecord.id} (Satış #${sale.id})`,
          },
        });

        // Gider Kaydı Oluştur
        await tx.expense.create({
          data: {
            company_id: companyId,
            employee_id: employeeId,
            title: `Müşteri İade Ödemesi #${returnRecord.id}`,
            amount: dto.refund_amount,
            category: 'SATIŞ İADESİ',
            description: `Müşteri ID: ${sale.customer_id} için #${sale.id} numaralı satışın iadesi`,
          },
        });
      }

      return returnRecord;
    });
  }

  async findAll(
    companyId: number,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<any>> {
    const {
      page,
      limit,
      search,
      imei,
      customerId,
      employeeId,
      startDate,
      endDate,
      minAmount,
      maxAmount,
    } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { company_id: companyId };

    if (customerId) where.customer_id = customerId;
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
      where.refund_amount = {}; // İadelerde refund_amount üzerinden filtreleyelim
      if (minAmount !== undefined) where.refund_amount.gte = minAmount;
      if (maxAmount !== undefined) where.refund_amount.lte = maxAmount;
    }

    if (search) {
      where.OR = [
        { reason: { contains: search } },
        { customer: { name: { contains: search } } },
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
      this.prisma.return.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          sale: true,
          customer: { select: { name: true, id: true } },
          employee: { select: { name: true, id: true } },
          items: {
            include: {
              bulkProduct: true,
              singleDevice: true,
            },
          },
        },
      }),
      this.prisma.return.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(companyId: number, id: number) {
    const returnRecord = await this.prisma.return.findFirst({
      where: { id, company_id: companyId },
      include: {
        sale: true,
        customer: true,
        employee: { select: { name: true, id: true } },
        items: {
          include: {
            bulkProduct: true,
            singleDevice: true,
          },
        },
      },
    });

    if (!returnRecord) throw new NotFoundException('İade bulunamadı');
    return returnRecord;
  }

  async cancel(companyId: number, id: number, employeeId: number) {
    const returnRecord = await this.prisma.return.findFirst({
      where: { id, company_id: companyId },
      include: {
        items: true,
        sale: {
          include: { items: true },
        },
      },
    });

    if (!returnRecord) throw new NotFoundException('İade bulunamadı');
    if ((returnRecord as any).status === TransactionStatus.CANCELLED)
      throw new BadRequestException('Bu iade zaten iptal edilmiş');

    return this.prisma.$transaction(async (tx) => {
      // 1. SaleItem ve Stok Güncelle
      for (const item of returnRecord.items) {
        const saleItem = returnRecord.sale.items.find(
          (si) => si.id === item.sale_item_id,
        );
        if (saleItem) {
          const newReturnedQty = saleItem.returned_quantity - item.quantity;
          const status =
            newReturnedQty === 0
              ? ItemStatus.NORMAL
              : ItemStatus.PARTIALLY_RETURNED;

          await tx.saleItem.update({
            where: { id: saleItem.id },
            data: {
              returned_quantity: newReturnedQty,
              status: status,
            },
          });
        }

        // Stok Çıkışı (İade iptal edildiği için ürün tekrar "satılmış" sayılır)
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
              reason: `İade İptali #${returnRecord.id} (Satış #${returnRecord.sale_id})`,
            },
          });
        } else if (item.single_device_id) {
          await tx.singleDevice.update({
            where: { id: item.single_device_id },
            data: { status: DeviceStatus.SOLD },
          });

          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              single_device_id: item.single_device_id,
              type: MovementType.OUT,
              quantity: 1,
              reason: `İade İptali #${returnRecord.id} (Satış #${returnRecord.sale_id})`,
            },
          });
        }
      }

      // 2. Satış Durumunu Yeniden Hesapla
      const updatedSaleItems = await tx.saleItem.findMany({
        where: { sale_id: returnRecord.sale_id },
      });
      const allReturned = updatedSaleItems.every(
        (i) => i.status === ItemStatus.RETURNED,
      );
      const anyReturned = updatedSaleItems.some(
        (i) =>
          i.status === ItemStatus.RETURNED ||
          i.status === ItemStatus.PARTIALLY_RETURNED,
      );

      await tx.sale.update({
        where: { id: returnRecord.sale_id },
        data: {
          status: allReturned
            ? TransactionStatus.RETURNED
            : anyReturned
              ? TransactionStatus.PARTIALLY_RETURNED
              : TransactionStatus.COMPLETED,
        },
      });

      // 3. Kâr Düzeltmesini Geri Al
      let itemsCost = 0;
      for (const item of returnRecord.items) {
        if (item.bulk_product_id) {
          const product = await tx.bulkProduct.findUnique({
            where: { id: item.bulk_product_id },
          });
          if (product)
            itemsCost += Number(product.purchase_price) * item.quantity;
        } else if (item.single_device_id) {
          const device = await tx.singleDevice.findUnique({
            where: { id: item.single_device_id },
          });
          if (device) itemsCost += Number(device.purchase_price);
        }
      }
      const profitAdjustment = itemsCost - Number(returnRecord.refund_amount);
      await tx.sale.update({
        where: { id: returnRecord.sale_id },
        data: { profit: { decrement: profitAdjustment } },
      });

      // 4. Kasa ve Nakit İşlemlerini Geri Al
      if (Number(returnRecord.refund_amount) > 0) {
        const cashRegister = await tx.cashRegister.findUnique({
          where: { company_id: companyId },
        });
        if (cashRegister) {
          await tx.cashRegister.update({
            where: { id: cashRegister.id },
            data: { balance: { increment: returnRecord.refund_amount } },
          });

          await tx.cashTransaction.create({
            data: {
              company_id: companyId,
              cash_register_id: cashRegister.id,
              type: CashTransactionType.SALE_INCOME,
              amount: returnRecord.refund_amount,
              reference_id: returnRecord.id,
              description: `İade İptali #${returnRecord.id}`,
            },
          });
        }

        // Gider kaydını sil
        await tx.expense.deleteMany({
          where: {
            company_id: companyId,
            title: `Müşteri İade Ödemesi #${returnRecord.id}`,
          },
        });
      }

      // 5. İade Durumunu Güncelle
      const updatedReturn = await tx.return.update({
        where: { id },
        data: { status: TransactionStatus.CANCELLED },
      });

      return updatedReturn;
    });
  }
}
