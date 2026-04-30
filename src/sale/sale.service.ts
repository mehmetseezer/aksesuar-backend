import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/pagination.interface';
import {
  DeviceStatus,
  MovementType,
  CashTransactionType,
  ItemStatus,
  AuditAction,
  TransactionStatus,
  CommissionType,
  LedgerType,
} from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SaleService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: number, employeeId: number, dto: CreateSaleDto) {
    const targetEmployeeId = dto.employee_id || employeeId;

    return this.prisma.$transaction(async (tx) => {
      // 1. Ürünleri ve Maliyetleri Hesapla
      let totalAmount = 0;
      let totalCost = 0;

      const bulkProductUpdates = [];
      const singleDeviceUpdates = [];

      // Bulk Products
      for (const item of dto.items.filter((i) => i.bulk_product_id)) {
        const product = await tx.bulkProduct.findFirst({
          where: { id: item.bulk_product_id, company_id: companyId },
        });

        if (!product || product.quantity < item.quantity) {
          throw new BadRequestException(
            `Yetersiz stok: ${product?.brand} ${product?.model}`,
          );
        }

        totalAmount += Number(item.unit_price) * item.quantity;
        totalCost += Number(product.purchase_price) * item.quantity;

        bulkProductUpdates.push({
          id: item.bulk_product_id,
          quantity: item.quantity,
        });
      }

      // Single Devices
      for (const item of dto.items.filter((i) => i.single_device_id)) {
        const device = await tx.singleDevice.findFirst({
          where: { id: item.single_device_id, company_id: companyId },
        });

        if (!device || device.status !== DeviceStatus.IN_STOCK) {
          throw new BadRequestException(`Cihaz stokta değil: ${device?.name}`);
        }

        totalAmount += Number(item.unit_price) * item.quantity;
        totalCost += Number(device.purchase_price) * item.quantity;

        singleDeviceUpdates.push({
          id: item.single_device_id,
          newStatus: DeviceStatus.SOLD,
        });
      }

      const profit = totalAmount - totalCost;

      // 1.5. Güncel Kur Bilgisini Al
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { usd_rate: true },
      });

      // 2. Satış Kaydını Oluştur
      const sale = await tx.sale.create({
        data: {
          company_id: companyId,
          employee_id: targetEmployeeId,
          customer_id: dto.customer_id,
          total_amount: totalAmount,
          paid_amount: dto.paid_amount,
          profit: profit,
          description: dto.description,
          usd_rate: company?.usd_rate || 0,
        },
      });

      // 3. Satış Kalemlerini Oluştur
      for (const item of dto.items) {
        await tx.saleItem.create({
          data: {
            sale_id: sale.id,
            bulk_product_id: item.bulk_product_id,
            single_device_id: item.single_device_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            status: ItemStatus.NORMAL,
          },
        });
      }

      // 3.5 Müşteri bilgisini al
      let customerName = 'Anonim';
      if (dto.customer_id) {
        const customer = await tx.customer.findUnique({
          where: { id: dto.customer_id },
        });
        if (customer) customerName = customer.name;
      }

      // 4. Stok Güncelle
      for (const update of bulkProductUpdates) {
        await tx.bulkProduct.update({
          where: { id: update.id },
          data: { quantity: { decrement: update.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            company_id: companyId,
            bulk_product_id: update.id,
            type: MovementType.OUT,
            quantity: update.quantity,
            reason: `Satış #${sale.id}: ${customerName} kişisine satıldı`,
          },
        });
      }

      for (const update of singleDeviceUpdates) {
        await tx.singleDevice.update({
          where: { id: update.id },
          data: { status: update.newStatus },
        });

        await tx.stockMovement.create({
          data: {
            company_id: companyId,
            single_device_id: update.id,
            type: MovementType.OUT,
            quantity: 1,
            reason: `Satış #${sale.id}: ${customerName} kişisine satıldı`,
          },
        });
      }

      // 5. Müşteri Bakiyesi ve Ledger
      if (dto.customer_id) {
        // 5.1 Satış Kaydı (Müşterinin borcu arttı)
        await tx.customerLedger.create({
          data: {
            company_id: companyId,
            customer_id: dto.customer_id,
            type: LedgerType.SALE,
            amount: totalAmount,
            reference_id: sale.id,
            description: `Satış #${sale.id}`,
          },
        });

        // 5.2 Tahsilat Kaydı (Eğer peşinat varsa, müşterinin borcu azaldı)
        if (dto.paid_amount > 0) {
          await tx.customerLedger.create({
            data: {
              company_id: companyId,
              customer_id: dto.customer_id,
              type: LedgerType.CUSTOMER_PAYMENT,
              amount: -dto.paid_amount,
              reference_id: sale.id,
              description: `Satış #${sale.id} Peşinat`,
            },
          });
        }

        const remaining = totalAmount - dto.paid_amount;
        if (remaining !== 0) {
          await tx.customer.update({
            where: { id: dto.customer_id },
            data: { balance: { increment: remaining } },
          });
        }
      }

      // 6. Kasa İşlemleri
      const cashRegister = await tx.cashRegister.upsert({
        where: { company_id: companyId },
        update: {},
        create: { company_id: companyId, balance: 0 },
      });

      await tx.cashRegister.update({
        where: { id: cashRegister.id },
        data: { balance: { increment: dto.paid_amount } },
      });

      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: cashRegister.id,
          type: CashTransactionType.SALE_INCOME,
          amount: dto.paid_amount,
          reference_id: sale.id,
          description: `Satış #${sale.id}`,
        },
      });

      // Gelir Kaydı Oluştur
      await tx.income.create({
        data: {
          company_id: companyId,
          employee_id: targetEmployeeId,
          title: `Satış Geliri #${sale.id}`,
          amount: dto.paid_amount,
          category: 'SATIŞ',
          description: `Müşteri ID: ${dto.customer_id || 'Anonim'}`,
        },
      });

      // 7. Tedarikçiye aktarım (Redirection)
      if (dto.supplier_id && dto.supplier_amount && dto.supplier_amount > 0) {
        // 7.1 Borçlu olunan alımları bul ve kronolojik olarak öde
        const allPurchases = await tx.purchase.findMany({
          where: {
            company_id: companyId,
            supplier_id: dto.supplier_id,
            status: 'COMPLETED',
          },
          orderBy: { created_at: 'asc' },
        });

        const unpaidPurchases = allPurchases.filter(
          (p) => Number(p.paid_amount) < Number(p.total_amount),
        );
        let remainingRedirection = dto.supplier_amount;

        for (const purchase of unpaidPurchases) {
          if (remainingRedirection <= 0) break;
          const purchaseDebt =
            Number(purchase.total_amount) - Number(purchase.paid_amount);
          const paymentForThis = Math.min(remainingRedirection, purchaseDebt);

          await tx.purchase.update({
            where: { id: purchase.id },
            data: { paid_amount: { increment: paymentForThis } },
          });

          remainingRedirection -= paymentForThis;
        }

        const supplier = await tx.supplier.findUnique({
          where: { id: dto.supplier_id },
        });

        await tx.supplier.update({
          where: { id: dto.supplier_id },
          data: { total_debt: { decrement: dto.supplier_amount } },
        });

        await tx.cashRegister.update({
          where: { id: cashRegister.id },
          data: { balance: { decrement: dto.supplier_amount } },
        });

        await tx.cashTransaction.create({
          data: {
            company_id: companyId,
            cash_register_id: cashRegister.id,
            type: CashTransactionType.SUPPLIER_PAYMENT,
            amount: dto.supplier_amount,
            reference_id: sale.id,
            description: `Tedarikçiye Aktarım (${supplier?.name ?? 'Bilinmiyor'}) - Satış #${sale.id}`,
          },
        });
      }

      // 8. Komisyon Hesapla
      const applicableRules = await tx.commissionRule.findMany({
        where: {
          company_id: companyId,
          is_active: true,
          OR: [
            { employee_id: targetEmployeeId },
            { employee_id: null },
            { type: CommissionType.DAILY_PROFIT_PERCENTAGE },
          ],
        },
      });

      for (const rule of applicableRules) {
        let commissionAmount = 0;
        const threshold = Number(rule.min_profit);

        // Eğer kural bir çalışana atanmışsa o alır, atanmamışsa (global ise) satışı yapan alır
        const recipientId = rule.employee_id || targetEmployeeId;

        if (rule.type === CommissionType.DAILY_PROFIT_PERCENTAGE) {
          // Günlük Kâr Payı: Her satışın kârından yüzde (Eşik kontrolü dahil)
          if (profit >= threshold) {
            commissionAmount = (profit * Number(rule.value)) / 100;
          }
        } else if (recipientId === targetEmployeeId) {
          // Diğer kural tipleri sadece satışı yapan için geçerli
          if (rule.type === CommissionType.TIERED) {
            const baseCommission = Number(rule.value);
            const stepAmount = Number(rule.step_amount || 0);
            const stepValue = Number(rule.step_value || 0);

            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);

            const previousSales = await tx.sale.aggregate({
              where: {
                employee_id: targetEmployeeId,
                company_id: companyId,
                created_at: { gte: startOfDay, lte: endOfDay },
                status: {
                  notIn: [
                    TransactionStatus.CANCELLED,
                    TransactionStatus.RETURNED,
                  ],
                },
                id: { not: sale.id },
              },
              _sum: { profit: true },
            });

            const totalProfitSoFar = Number(previousSales._sum.profit || 0);
            const totalProfitWithCurrent = totalProfitSoFar + profit;

            const calculateDeserved = (totalProfit: number) => {
              if (totalProfit < threshold) return 0;
              let total = baseCommission;
              if (stepAmount > 0 && totalProfit > threshold) {
                const extraSteps = Math.floor(
                  (totalProfit - threshold) / stepAmount,
                );
                total += extraSteps * stepValue;
              }
              return total;
            };

            const totalDeservedNow = calculateDeserved(totalProfitWithCurrent);
            const totalDeservedBefore = calculateDeserved(totalProfitSoFar);
            commissionAmount = totalDeservedNow - totalDeservedBefore;
          } else if (rule.type === CommissionType.PERCENTAGE) {
            if (profit >= threshold) {
              commissionAmount = (profit * Number(rule.value)) / 100;
            }
          } else if (rule.type === CommissionType.STATIC) {
            if (profit >= threshold) {
              commissionAmount = Number(rule.value);
            }
          }
        }

        if (commissionAmount > 0) {
          await tx.commission.create({
            data: {
              employee_id: recipientId,
              sale_id: sale.id,
              rule_id: rule.id,
              rule_snapshot: {
                name: rule.name,
                type: rule.type,
                value: rule.value.toString(),
                step_amount: rule.step_amount?.toString(),
                step_value: rule.step_value?.toString(),
              },
              amount: commissionAmount,
            },
          });

          await tx.employee.update({
            where: { id: recipientId },
            data: {
              commission_balance: { increment: commissionAmount },
              balance: { increment: commissionAmount },
            },
          });

          // 8.1 Employee Ledger Kaydı
          await tx.employeeLedger.create({
            data: {
              company_id: companyId,
              employee_id: recipientId,
              type: LedgerType.COMMISSION,
              amount: commissionAmount,
              reference_id: sale.id,
              description: `Satış #${sale.id} Komisyonu`,
            },
          });
        }
      }

      // 9. Audit Log
      await tx.auditLog.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          action: AuditAction.SALE_CREATE,
          entity: 'Sale',
          entity_id: sale.id,
          new_value: { total_amount: totalAmount, profit: profit },
        },
      });

      return sale;
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
      where.total_amount = {};
      if (minAmount !== undefined) where.total_amount.gte = minAmount;
      if (maxAmount !== undefined) where.total_amount.lte = maxAmount;
    }

    if (search) {
      where.OR = [
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
      this.prisma.sale.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          customer: { select: { name: true, id: true } },
          employee: { select: { name: true, id: true } },
          commissions: { select: { amount: true } },
          items: {
            include: {
              bulkProduct: true,
              singleDevice: true,
            },
          },
        },
      }),
      this.prisma.sale.count({ where }),
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
    const sale = await this.prisma.sale.findFirst({
      where: { id, company_id: companyId },
      include: {
        customer: true,
        employee: { select: { name: true, id: true } },
        items: {
          include: {
            bulkProduct: true,
            singleDevice: true,
          },
        },
        returns: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Satış bulunamadı');
    }

    return sale;
  }

  async updatePayment(
    companyId: number,
    id: number,
    newAmount: number,
    employeeId: number,
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, company_id: companyId },
    });

    if (!sale) throw new NotFoundException('Satış bulunamadı');
    if (sale.status === 'RETURNED')
      throw new BadRequestException(
        'İade edilmiş satışın ödemesi değiştirilemez',
      );

    const oldAmount = Number(sale.paid_amount);
    const diff = newAmount - oldAmount;

    if (diff === 0) return sale;

    return this.prisma.$transaction(async (tx) => {
      // 1. Satışı güncelle
      const updatedSale = await tx.sale.update({
        where: { id },
        data: { paid_amount: newAmount },
      });

      // 2. Kasayı güncelle
      await tx.cashRegister.update({
        where: { company_id: companyId },
        data: { balance: { increment: diff } },
      });

      // 3. Müşteri bakiyesini güncelle (Müşteri borcu azalırsa bakiye azalır)
      if (sale.customer_id) {
        await tx.customer.update({
          where: { id: sale.customer_id },
          data: { balance: { decrement: diff } },
        });
      }

      // 4. Nakit hareket kaydı oluştur
      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: (
            await tx.cashRegister.findUnique({
              where: { company_id: companyId },
            })
          ).id,
          type: 'OTHER_INCOME', // Veya düzeltme tipi
          amount: diff,
          description: `Satış #${id} ödeme düzeltmesi (${oldAmount} -> ${newAmount})`,
          reference_id: id,
        },
      });

      return updatedSale;
    });
  }

  async cancel(companyId: number, id: number, employeeId: number) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, company_id: companyId },
      include: {
        items: true,
        returns: {
          where: { status: { not: TransactionStatus.CANCELLED } },
        },
      },
    });

    if (!sale) throw new NotFoundException('Satış bulunamadı');
    if (sale.status === TransactionStatus.CANCELLED)
      throw new BadRequestException('Bu satış zaten iptal edilmiş');
    if ((sale as any).returns.length > 0) {
      throw new BadRequestException(
        'Bu satışın aktif iadeleri var. Önce iadeleri iptal etmelisiniz.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Stokları Geri Al
      for (const item of sale.items) {
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
              reason: `Satış İptali #${sale.id}`,
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
              reason: `Satış İptali #${sale.id}`,
            },
          });
        }
      }

      // 2. Müşteri Bakiyesini ve Ledger'ı Geri Al
      if (sale.customer_id) {
        // Satış kaydını tersle
        await tx.customerLedger.create({
          data: {
            company_id: companyId,
            customer_id: sale.customer_id,
            type: LedgerType.ADJUSTMENT,
            amount: -Number(sale.total_amount),
            reference_id: sale.id,
            description: `Satış İptali #${sale.id} (Satış İadesi)`,
          },
        });

        // Tahsilat kaydını tersle (Eğer iade ediliyorsa, borcu geri artar)
        if (Number(sale.paid_amount) > 0) {
          await tx.customerLedger.create({
            data: {
              company_id: companyId,
              customer_id: sale.customer_id,
              type: LedgerType.ADJUSTMENT,
              amount: Number(sale.paid_amount),
              reference_id: sale.id,
              description: `Satış İptali #${sale.id} (Tahsilat İadesi)`,
            },
          });
        }

        const remainingAmount =
          Number(sale.total_amount) - Number(sale.paid_amount);
        if (remainingAmount !== 0) {
          await tx.customer.update({
            where: { id: sale.customer_id },
            data: { balance: { decrement: remainingAmount } },
          });
        }
      }

      // 3. Kasa ve Nakit İşlemlerini Geri Al
      if (Number(sale.paid_amount) > 0) {
        const cashRegister = await tx.cashRegister.findUnique({
          where: { company_id: companyId },
        });

        if (cashRegister) {
          await tx.cashRegister.update({
            where: { id: cashRegister.id },
            data: { balance: { decrement: sale.paid_amount } },
          });

          await tx.cashTransaction.create({
            data: {
              company_id: companyId,
              cash_register_id: cashRegister.id,
              type: CashTransactionType.REFUND_OUT,
              amount: sale.paid_amount,
              reference_id: sale.id,
              description: `Satış İptali #${sale.id}`,
            },
          });
        }

        await tx.income.deleteMany({
          where: {
            company_id: companyId,
            title: `Satış Geliri #${sale.id}`,
          },
        });
      }

      // 4. Komisyonları Geri Al
      const commissions = await tx.commission.findMany({
        where: { sale_id: sale.id },
      });

      for (const commission of commissions) {
        await tx.employee.update({
          where: { id: commission.employee_id },
          data: {
            commission_balance: { decrement: commission.amount },
            balance: { decrement: commission.amount },
          },
        });

        // Ledger kaydını tersle
        await tx.employeeLedger.create({
          data: {
            company_id: companyId,
            employee_id: commission.employee_id,
            type: LedgerType.ADJUSTMENT,
            amount: -Number(commission.amount),
            reference_id: sale.id,
            description: `Satış İptali #${sale.id} Komisyon İadesi`,
          },
        });

        await tx.commission.delete({
          where: { id: commission.id },
        });
      }

      // 5. Satış Durumunu Güncelle
      const updatedSale = await tx.sale.update({
        where: { id },
        data: { status: TransactionStatus.CANCELLED },
      });

      // 6. Audit Log
      await tx.auditLog.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          action: AuditAction.SALE_DELETE,
          entity: 'Sale',
          entity_id: sale.id,
          old_value: { status: sale.status },
          new_value: { status: 'CANCELLED' },
        },
      });

      return updatedSale;
    });
  }
}
