import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PurchaseQueryDto } from './dto/purchase-query.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/pagination.interface';
import {
  DeviceStatus,
  MovementType,
  CashTransactionType,
  ItemStatus,
  AuditAction,
  TransactionStatus,
} from '@prisma/client';

@Injectable()
export class PurchaseService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: number, employeeId: number, dto: CreatePurchaseDto) {
    const targetEmployeeId = dto.employee_id || employeeId;

    return this.prisma.$transaction(async (tx) => {
      // 0. Güncel Kur Bilgisini Al
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { usd_rate: true },
      });
      const currentRate = Number(company?.usd_rate || 0);

      if (
        (dto.cost_currency === 'USD' || dto.payment_currency === 'USD') &&
        currentRate <= 1
      ) {
        throw new BadRequestException(
          'Dolar kuru ayarlanmamış veya geçersiz! Lütfen ayarlardan güncel kuru giriniz.',
        );
      }

      // Ödeme hesaplamaları
      let totalReducedTlFromDebt = 0;
      let totalPaidTlForRegister = 0;

      if (dto.payment_currency === 'USD' && dto.paid_amount_usd > 0) {
        totalReducedTlFromDebt = dto.paid_amount_usd * currentRate;
        totalPaidTlForRegister = dto.paid_amount_usd * currentRate;
      } else {
        totalReducedTlFromDebt = dto.paid_amount || 0;
        totalPaidTlForRegister = dto.paid_amount || 0;
      }

      let totalAmount = 0;

      const purchase = await tx.purchase.create({
        data: {
          company_id: companyId,
          employee_id: targetEmployeeId,
          supplier_id: dto.supplier_id,
          customer_id: dto.customer_id,
          total_amount: 0,
          paid_amount: totalReducedTlFromDebt,
          description: dto.description,
          usd_rate: currentRate,
        },
      });

      for (const item of dto.items) {
        let bulkProductId = item.bulk_product_id;
        let singleDeviceId = item.single_device_id;
        const unitCostTl =
          dto.cost_currency === 'USD'
            ? Number(item.unit_cost) * currentRate
            : Number(item.unit_cost);

        if (item.is_new_product || (!bulkProductId && !singleDeviceId)) {
          if (
            item.type === 'bulk' ||
            (item.brand && !item.single_device_imei)
          ) {
            const bulk = await tx.bulkProduct.create({
              data: {
                company_id: companyId,
                brand: item.brand || 'Bilinmiyor',
                model: item.model || '',
                category: item.category || 'Genel',
                purchase_price: unitCostTl,
                selling_price: unitCostTl,
                quantity: 0,
              },
            });
            bulkProductId = bulk.id;
          } else {
            const imei = item.imei || item.single_device_imei;
            let device;
            if (imei) {
              const existingDevice = await tx.singleDevice.findUnique({
                where: {
                  company_id_imei: { company_id: companyId, imei: imei },
                },
              });
              if (existingDevice) {
                if (existingDevice.status !== DeviceStatus.SOLD) {
                  throw new BadRequestException(
                    `Sistemde zaten bu IMEI'li (${imei}) cihaz var`,
                  );
                }
                device = await tx.singleDevice.update({
                  where: { id: existingDevice.id },
                  data: {
                    name: item.name || existingDevice.name,
                    device_condition:
                      item.condition || item.device_condition || 'USED',
                    purchase_price: unitCostTl,
                    battery_health: item.battery_health,
                    condition_note: item.condition_note,
                    status: DeviceStatus.IN_STOCK,
                    capacity: item.capacity,
                    warranty: item.warranty,
                    deleted_at: null,
                  },
                });
              }
            }
            if (!device) {
              device = await tx.singleDevice.create({
                data: {
                  company_id: companyId,
                  name:
                    item.name ||
                    `${item.brand || ''} ${item.model || ''}`.trim() ||
                    'Bilinmiyor',
                  imei: imei || `TEMP-${Date.now()}`,
                  device_condition:
                    item.condition || item.device_condition || 'USED',
                  purchase_price: unitCostTl,
                  battery_health: item.battery_health,
                  condition_note: item.condition_note,
                  capacity: item.capacity,
                  warranty: item.warranty,
                  status: DeviceStatus.IN_STOCK,
                },
              });
            }
            singleDeviceId = device.id;
          }
        }

        await tx.purchaseItem.create({
          data: {
            purchase_id: purchase.id,
            bulk_product_id: bulkProductId,
            single_device_id: singleDeviceId,
            quantity: item.quantity,
            unit_cost: unitCostTl,
            status: ItemStatus.NORMAL,
          },
        });

        totalAmount += unitCostTl * item.quantity;

        if (bulkProductId) {
          await tx.bulkProduct.update({
            where: { id: bulkProductId },
            data: { quantity: { increment: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              bulk_product_id: bulkProductId,
              type: MovementType.IN,
              quantity: item.quantity,
              reason: `Alım #${purchase.id}`,
            },
          });
        }

        if (singleDeviceId) {
          await tx.singleDevice.update({
            where: { id: singleDeviceId },
            data: { status: DeviceStatus.IN_STOCK },
          });
          let sourceName = 'Bilinmiyor';
          if (dto.supplier_id) {
            const supplier = await tx.supplier.findUnique({
              where: { id: dto.supplier_id },
            });
            if (supplier) sourceName = supplier.name;
          } else if (dto.customer_id) {
            const customer = await tx.customer.findUnique({
              where: { id: dto.customer_id },
            });
            if (customer) sourceName = customer.name;
          }
          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              single_device_id: singleDeviceId,
              type: MovementType.IN,
              quantity: 1,
              reason: `Alım #${purchase.id}: ${sourceName} üzerinden alındı`,
            },
          });
        }
      }

      await tx.purchase.update({
        where: { id: purchase.id },
        data: { total_amount: totalAmount },
      });

      const remaining = totalAmount - totalReducedTlFromDebt;

      if (dto.supplier_id && remaining > 0) {
        await tx.supplier.update({
          where: { id: dto.supplier_id },
          data: { total_debt: { increment: remaining } },
        });
      }

      if (dto.customer_id) {
        const balanceChange = totalReducedTlFromDebt - totalAmount;
        if (balanceChange !== 0) {
          await tx.customer.update({
            where: { id: dto.customer_id },
            data: { balance: { increment: balanceChange } },
          });
        }
      }

      const cashRegister = await tx.cashRegister.upsert({
        where: { company_id: companyId },
        update: {},
        create: { company_id: companyId, balance: 0 },
      });

      await tx.cashRegister.update({
        where: { id: cashRegister.id },
        data: { balance: { decrement: totalPaidTlForRegister } },
      });

      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: cashRegister.id,
          type: CashTransactionType.PURCHASE_PAYMENT,
          amount: totalPaidTlForRegister,
          reference_id: purchase.id,
          description: `Alım #${purchase.id}${dto.payment_currency === 'USD' ? ` (${dto.paid_amount_usd} USD)` : ''}`,
        },
      });

      if (totalPaidTlForRegister > 0) {
        await tx.expense.create({
          data: {
            company_id: companyId,
            employee_id: targetEmployeeId,
            title: `Alım Gideri #${purchase.id}`,
            amount: totalPaidTlForRegister,
            category: 'ALIM',
            description: `Tedarikçi ID: ${dto.supplier_id || 'Anonim'}${dto.payment_currency === 'USD' ? ` (${dto.paid_amount_usd} USD)` : ''}`,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          action: AuditAction.PURCHASE_CREATE,
          entity: 'Purchase',
          entity_id: purchase.id,
          new_value: {
            total_amount: totalAmount,
            paid_tl: totalPaidTlForRegister,
          },
        },
      });

      return tx.purchase.findUnique({
        where: { id: purchase.id },
        include: {
          items: {
            include: {
              bulkProduct: true,
              singleDevice: true,
            },
          },
        },
      });
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
      where.total_amount = {};
      if (minAmount !== undefined) where.total_amount.gte = minAmount;
      if (maxAmount !== undefined) where.total_amount.lte = maxAmount;
    }

    if (search) {
      where.OR = [
        { supplier: { name: { contains: search } } },
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
      this.prisma.purchase.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          supplier: { select: { name: true, id: true } },
          customer: { select: { name: true, id: true } },
          employee: { select: { name: true, id: true } },
          items: {
            include: {
              bulkProduct: {
                select: {
                  id: true,
                  brand: true,
                  model: true,
                  quantity: true,
                  barcode: true,
                },
              },
              singleDevice: {
                select: { id: true, name: true, imei: true, status: true },
              },
            },
          },
        },
      }),
      this.prisma.purchase.count({ where }),
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
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, company_id: companyId },
      include: {
        supplier: true,
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

    if (!purchase) {
      throw new NotFoundException('Alım bulunamadı');
    }

    return purchase;
  }

  async updatePayment(
    companyId: number,
    id: number,
    newAmount: number,
    employeeId: number,
  ) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, company_id: companyId },
    });

    if (!purchase) throw new NotFoundException('Alım bulunamadı');

    const oldAmount = Number(purchase.paid_amount);
    const diff = newAmount - oldAmount;

    if (diff === 0) return purchase;

    return this.prisma.$transaction(async (tx) => {
      // 1. Alımı güncelle
      const updatedPurchase = await tx.purchase.update({
        where: { id },
        data: { paid_amount: newAmount },
      });

      // 2. Kasayı güncelle (Ödenen para artarsa kasa azalır - Alım olduğu için)
      await tx.cashRegister.update({
        where: { company_id: companyId },
        data: { balance: { decrement: diff } },
      });

      // 3. Tedarikçi/Müşteri bakiyesini güncelle
      if (purchase.supplier_id) {
        await tx.supplier.update({
          where: { id: purchase.supplier_id },
          data: { total_debt: { decrement: diff } },
        });
      } else if (purchase.customer_id) {
        await tx.customer.update({
          where: { id: purchase.customer_id },
          data: { balance: { increment: diff } },
        });
      }

      // 4. Nakit hareket kaydı oluştur
      const register = await tx.cashRegister.findUnique({
        where: { company_id: companyId },
      });
      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: register.id,
          type: CashTransactionType.PURCHASE_PAYMENT,
          amount: diff,
          description: `Alım #${id} ödeme düzeltmesi (${oldAmount} -> ${newAmount})`,
          reference_id: id,
        },
      });

      // 5. Gider kaydı oluştur
      await tx.expense.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          title: `Alım Ödeme Düzeltmesi #${id}`,
          amount: diff,
          category: 'ALIM',
          description: `Alım #${id} için yapılan ödeme güncellemesi`,
        },
      });

      return updatedPurchase;
    });
  }

  async cancel(companyId: number, id: number, employeeId: number) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, company_id: companyId },
      include: {
        items: true,
        supplierReturns: {
          where: { status: { not: TransactionStatus.CANCELLED } },
        },
      },
    });

    if (!purchase) throw new NotFoundException('Alım bulunamadı');
    if (purchase.status === TransactionStatus.CANCELLED)
      throw new BadRequestException('Bu alım zaten iptal edilmiş');
    if ((purchase as any).supplierReturns.length > 0) {
      throw new BadRequestException(
        'Bu alımın aktif tedarikçi iadeleri var. Önce iadeleri iptal etmelisiniz.',
      );
    }

    // Stok kontrolü yapalım (Ürünler hala stokta mı?)
    for (const item of purchase.items) {
      if (item.bulk_product_id) {
        const product = await this.prisma.bulkProduct.findUnique({
          where: { id: item.bulk_product_id },
        });
        if (product && product.quantity < item.quantity) {
          throw new BadRequestException(
            `Ürün (${product.brand} ${product.model}) stokta yeterli değil. Satılmış olabilir.`,
          );
        }
      } else if (item.single_device_id) {
        const device = await this.prisma.singleDevice.findUnique({
          where: { id: item.single_device_id },
        });
        if (device && device.status !== DeviceStatus.IN_STOCK) {
          throw new BadRequestException(
            `Cihaz (${device.name}) stokta değil (Durum: ${device.status}). Satılmış olabilir.`,
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Stokları Geri Al (Düşür)
      for (const item of purchase.items) {
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
              reason: `Alım İptali #${purchase.id}`,
            },
          });
        } else if (item.single_device_id) {
          await tx.singleDevice.update({
            where: { id: item.single_device_id },
            data: { deleted_at: new Date() },
          });

          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              single_device_id: item.single_device_id,
              type: MovementType.OUT,
              quantity: 1,
              reason: `Alım İptali #${purchase.id}`,
            },
          });
        }
      }

      // 2. Borç/Bakiye Geri Al
      const debt = Number(purchase.total_amount) - Number(purchase.paid_amount);
      if (purchase.supplier_id && debt !== 0) {
        await tx.supplier.update({
          where: { id: purchase.supplier_id },
          data: { total_debt: { decrement: debt } },
        });
      } else if (purchase.customer_id) {
        const balanceChange =
          Number(purchase.total_amount) - Number(purchase.paid_amount);
        if (balanceChange !== 0) {
          await tx.customer.update({
            where: { id: purchase.customer_id },
            data: { balance: { decrement: balanceChange } },
          });
        }
      }

      // 3. Kasa ve Nakit İşlemlerini Geri Al
      if (Number(purchase.paid_amount) > 0) {
        const cashRegister = await tx.cashRegister.findUnique({
          where: { company_id: companyId },
        });

        if (cashRegister) {
          await tx.cashRegister.update({
            where: { id: cashRegister.id },
            data: { balance: { increment: purchase.paid_amount } },
          });

          await tx.cashTransaction.create({
            data: {
              company_id: companyId,
              cash_register_id: cashRegister.id,
              type: CashTransactionType.SALE_INCOME,
              amount: purchase.paid_amount,
              reference_id: purchase.id,
              description: `Alım İptali #${purchase.id} (Para İadesi)`,
            },
          });
        }

        await tx.expense.deleteMany({
          where: {
            company_id: companyId,
            title: `Alım Gideri #${purchase.id}`,
          },
        });
      }

      // 4. Alım Durumunu Güncelle
      const updatedPurchase = await tx.purchase.update({
        where: { id },
        data: { status: TransactionStatus.CANCELLED },
      });

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          action: AuditAction.STOCK_ADJUSTMENT,
          entity: 'Purchase',
          entity_id: purchase.id,
          old_value: { status: purchase.status },
          new_value: { status: 'CANCELLED' },
        },
      });

      return updatedPurchase;
    });
  }
}
