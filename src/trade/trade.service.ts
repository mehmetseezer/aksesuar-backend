import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTradeDto } from './dto/create-trade.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  MovementType,
  DeviceStatus,
  ItemStatus,
  CashTransactionType,
  TransactionStatus,
} from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TradeService {
  constructor(private prisma: PrismaService) { }

  async create(companyId: number, employeeId: number, dto: CreateTradeDto) {
    const targetEmployeeId = dto.employee_id || employeeId;
    // 1. Müşteri kontrolü
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customer_id, company_id: companyId, deleted_at: null },
    });
    if (!customer) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    // 2. Eski ürünlerin toplam değerini hesapla
    let tradeInValue = 0;
    for (const item of dto.trade_in_items) {
      tradeInValue += item.unit_cost * item.quantity;
    }

    // 3. Yeni satışın toplam tutarını hesapla
    let saleTotal = 0;
    for (const item of dto.sale_items) {
      saleTotal += item.unit_price * item.quantity;
    }

    const remainingAmount = saleTotal - tradeInValue;
    const paidAmount = dto.paid_amount;

    // 4. Transaction başlat
    return this.prisma.$transaction(async (tx) => {
      // 4.5. Güncel Kur Bilgisini Al
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { usd_rate: true },
      });
      const currentUsdRate = company?.usd_rate || 0;

      // ========== A. ALIM (PURCHASE) İŞLEMİ ==========
      const purchase = await tx.purchase.create({
        data: {
          company_id: companyId,
          employee_id: targetEmployeeId,
          customer_id: customer.id,
          total_amount: tradeInValue,
          paid_amount: 0,
          trade_id: uuidv4(),
          usd_rate: currentUsdRate,
        },
      });

      // Alım kalemleri ve stok güncellemeleri
      for (const item of dto.trade_in_items) {
        let singleDeviceId = item.single_device_id;

        // Yeni IMEI girilmişse ürünü oluştur - DÜZELTİLDİ (company_id_imei kontrolü)
        if (!singleDeviceId && item.single_device_imei) {
          const existing = await tx.singleDevice.findUnique({
            where: {
              company_id_imei: {
                company_id: companyId,
                imei: item.single_device_imei,
              },
            },
          });

          let lastExitInfo = '';
          if (existing) {
            if (existing.status !== DeviceStatus.SOLD) {
              throw new BadRequestException(
                `IMEI ${item.single_device_imei} zaten kayıtlı (Durum: ${existing.status})`,
              );
            }

            // Daha önce satılmış bir cihaz geri alınıyor
            const lastExit = await tx.stockMovement.findFirst({
              where: { single_device_id: existing.id, type: MovementType.OUT },
              orderBy: { created_at: 'desc' },
            });

            lastExitInfo = lastExit
              ? ` (Daha önce vardı. Son çıkış: ${new Date(lastExit.created_at).toLocaleDateString('tr-TR')} - ${lastExit.reason})`
              : ' (Daha önce vardı)';

            const updated = await tx.singleDevice.update({
              where: { id: existing.id },
              data: {
                status: DeviceStatus.IN_STOCK,
                purchase_price: item.unit_cost,
                name: item.name || existing.name,
                condition_note: item.condition_note || existing.condition_note,
                capacity: (item as any).capacity,
                warranty: (item as any).warranty,
              },
            });
            singleDeviceId = updated.id;
          } else {
            const newUsed = await tx.singleDevice.create({
              data: {
                company_id: companyId,
                imei: item.single_device_imei,
                name: item.name || 'İsimsiz Cihaz',
                specs: item.specs,
                device_condition: item.device_condition,
                purchase_price: item.unit_cost,
                status: DeviceStatus.IN_STOCK,
                condition_note: item.condition_note,
                capacity: (item as any).capacity,
                warranty: (item as any).warranty,
              } as any,
            });
            singleDeviceId = newUsed.id;
          }

          if (!singleDeviceId) {
            throw new BadRequestException('Geçersiz ikinci el ürün bilgisi');
          }

          await tx.purchaseItem.create({
            data: {
              purchase_id: purchase.id,
              single_device_id: singleDeviceId,
              quantity: item.quantity,
              unit_cost: item.unit_cost,
            },
          });

          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              single_device_id: singleDeviceId,
              type: MovementType.IN,
              quantity: item.quantity,
              reason: `Takas Alım #${purchase.id}${lastExitInfo}`,
            },
          });
        } else if (singleDeviceId) {
          // Mevcut ürün ise durumunu ve fiyatlarını güncelle (takas bedeline göre)
          await tx.singleDevice.update({
            where: { id: singleDeviceId },
            data: {
              status: DeviceStatus.IN_STOCK,
              purchase_price: item.unit_cost,
            },
          });
        }
      }

      // ========== A2. GİDER KAYDI (TAKAS ALIM) ==========
      await tx.expense.create({
        data: {
          company_id: companyId,
          employee_id: targetEmployeeId,
          title: `Takas Alım Bedeli #${purchase.id}`,
          amount: tradeInValue,
          category: 'ALIM',
          description: `Müşteri ID: ${customer.id} üzerinden yapılan takas alımı`,
          usd_rate: currentUsdRate,
        },
      });

      // ========== B. SATIŞ (SALE) İŞLEMİ ==========
      const bulkProductIds = dto.sale_items
        .filter((i) => i.bulk_product_id)
        .map((i) => i.bulk_product_id);
      const singleDeviceIds = dto.sale_items
        .filter((i) => i.single_device_id)
        .map((i) => i.single_device_id);

      const [bulkProducts, singleDevices] = await Promise.all([
        bulkProductIds.length > 0
          ? tx.bulkProduct.findMany({
            where: {
              id: { in: bulkProductIds },
              company_id: companyId,
              deleted_at: null,
            },
          })
          : [],
        singleDeviceIds.length > 0
          ? tx.singleDevice.findMany({
            where: {
              id: { in: singleDeviceIds },
              company_id: companyId,
              deleted_at: null,
            },
          })
          : [],
      ]);

      for (const item of dto.sale_items) {
        if (item.bulk_product_id) {
          const product = bulkProducts.find(
            (p) => p.id === item.bulk_product_id,
          );
          if (!product)
            throw new NotFoundException(
              `Ürün bulunamadı: ${item.bulk_product_id}`,
            );
          if (product.quantity < item.quantity) {
            throw new BadRequestException(
              `${product.brand} ${product.model} için yetersiz stok`,
            );
          }
        } else if (item.single_device_id) {
          const product = singleDevices.find(
            (p) => p.id === item.single_device_id,
          );
          if (!product)
            throw new NotFoundException(
              `Ürün bulunamadı: ${item.single_device_id}`,
            );
          if (product.status !== DeviceStatus.IN_STOCK) {
            throw new BadRequestException(`${product.name} stokta değil`);
          }
        }
      }

      const sale = await tx.sale.create({
        data: {
          company_id: companyId,
          employee_id: targetEmployeeId,
          customer_id: customer.id,
          total_amount: saleTotal,
          paid_amount: remainingAmount > 0 ? paidAmount : saleTotal,
          profit: 0,
          trade_id: uuidv4(),
          usd_rate: currentUsdRate,
        },
      });

      let totalCost = 0;
      for (const item of dto.sale_items) {
        let cost = 0;

        if (item.bulk_product_id) {
          const product = bulkProducts.find(
            (p) => p.id === item.bulk_product_id,
          );
          cost = Number(product.purchase_price) * item.quantity;

          await tx.bulkProduct.update({
            where: { id: product.id },
            data: { quantity: { decrement: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              bulk_product_id: product.id,
              type: MovementType.OUT,
              quantity: item.quantity,
              reason: `Takas Satış #${sale.id}`,
            },
          });
        } else if (item.single_device_id) {
          const product = singleDevices.find(
            (p) => p.id === item.single_device_id,
          );
          cost = Number(product.purchase_price);

          await tx.singleDevice.update({
            where: { id: product.id },
            data: { status: DeviceStatus.SOLD },
          });

          await tx.stockMovement.create({
            data: {
              company_id: companyId,
              single_device_id: product.id,
              type: MovementType.OUT,
              quantity: 1,
              reason: `Takas Satış #${sale.id}`,
            },
          });
        }

        await tx.saleItem.create({
          data: {
            sale_id: sale.id,
            bulk_product_id: item.bulk_product_id,
            single_device_id: item.single_device_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
          },
        });

        totalCost += cost;
      }

      const profit = saleTotal - totalCost;
      await tx.sale.update({
        where: { id: sale.id },
        data: { profit },
      });

      // ========== C. TAKAS KAYDI ==========
      const trade = await tx.trade.create({
        data: {
          company_id: companyId,
          employee_id: targetEmployeeId,
          customer_id: customer.id,
          sale_id: sale.id,
          purchase_id: purchase.id,
          trade_in_value: tradeInValue,
          sale_total: saleTotal,
          remaining_amount: remainingAmount,
          paid_amount: paidAmount,
          trade_id: uuidv4(),
          description: dto.description,
          usd_rate: currentUsdRate,
        },
      });

      // ========== D. MÜŞTERİ BAKİYESİ ==========
      const balanceChange =
        remainingAmount > 0
          ? remainingAmount - paidAmount
          : -Math.min(Math.max(Number(customer.balance), 0), -remainingAmount);

      if (balanceChange !== 0) {
        await tx.customer.update({
          where: { id: customer.id },
          data: { balance: { increment: balanceChange } },
        });
      }

      // ========== E. KASA İŞLEMLERİ ========== (enum kullanıldı)
      const cashRegister = await tx.cashRegister.findUnique({
        where: { company_id: companyId },
      });
      if (!cashRegister) throw new BadRequestException('Kasa bulunamadı');

      if (paidAmount > 0) {
        await tx.cashRegister.update({
          where: { id: cashRegister.id },
          data: { balance: { increment: paidAmount } },
        });

        await tx.cashTransaction.create({
          data: {
            company_id: companyId,
            cash_register_id: cashRegister.id,
            type: CashTransactionType.SALE_INCOME,
            amount: paidAmount,
            reference_id: sale.id,
            description: `Takas Satış #${sale.id}`,
          },
        });
      }

      if (remainingAmount < 0) {
        const refundAmount = -remainingAmount;
        if (Number(customer.balance) < refundAmount) {
          const cashRefund = refundAmount - Number(customer.balance);
          if (cashRefund > 0) {
            await tx.cashRegister.update({
              where: { id: cashRegister.id },
              data: { balance: { decrement: cashRefund } },
            });

            await tx.cashTransaction.create({
              data: {
                company_id: companyId,
                cash_register_id: cashRegister.id,
                type: CashTransactionType.REFUND_OUT,
                amount: cashRefund,
                reference_id: trade.id,
                description: `Takas Para Üstü #${trade.id}`,
              },
            });
          }
        }
      }

      // ========== F. KOMİSYON ==========
      const rule = await tx.commissionRule.findFirst({
        where: {
          company_id: companyId,
          employee_id: targetEmployeeId,
          is_active: true,
        },
        orderBy: { min_profit: 'desc' },
      });

      if (rule && profit >= Number(rule.min_profit)) {
        let commissionAmount = 0;
        if (rule.type === 'PERCENTAGE') {
          commissionAmount = (profit * Number(rule.value)) / 100;
        } else if (rule.type === 'TIERED') {
          const baseThreshold = Number(rule.min_profit);
          const baseCommission = Number(rule.value);
          const stepAmount = Number(rule.step_amount || 0);
          const stepValue = Number(rule.step_value || 0);

          commissionAmount = baseCommission;
          if (stepAmount > 0 && profit > baseThreshold) {
            const extraSteps = Math.floor(
              (profit - baseThreshold) / stepAmount,
            );
            commissionAmount += extraSteps * stepValue;
          }
        } else {
          commissionAmount = Number(rule.value);
        }

        await tx.commission.create({
          data: {
            employee_id: targetEmployeeId,
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
          where: { id: targetEmployeeId },
          data: { commission_balance: { increment: commissionAmount } },
        });
      }

      // ========== G. AUDIT LOG KALDIRILDI ==========

      return trade;
    });
  }

  async findAll(companyId: number, pagination: PaginationDto) {
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
      where.sale_total = {}; // Takaslarda sale_total üzerinden filtreleyelim
      if (minAmount !== undefined) where.sale_total.gte = minAmount;
      if (maxAmount !== undefined) where.sale_total.lte = maxAmount;
    }

    if (search) {
      where.OR = [
        { customer: { name: { contains: search } } },
        { employee: { name: { contains: search } } },
      ];
    }

    if (imei) {
      where.OR = [
        {
          sale: {
            items: { some: { singleDevice: { imei: { contains: imei } } } },
          },
        },
        {
          purchase: {
            items: { some: { singleDevice: { imei: { contains: imei } } } },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          customer: { select: { name: true, phone: true, id: true } },
          employee: { select: { name: true, id: true } },
          sale: {
            select: {
              id: true,
              total_amount: true,
              items: {
                include: {
                  bulkProduct: {
                    select: {
                      id: true,
                      brand: true,
                      model: true,
                      barcode: true,
                    },
                  },
                  singleDevice: {
                    select: { id: true, name: true, imei: true },
                  },
                },
              },
            },
          },
          purchase: {
            select: {
              id: true,
              total_amount: true,
              items: {
                include: {
                  singleDevice: {
                    select: { id: true, name: true, imei: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.trade.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(companyId: number, id: number) {
    const trade = await this.prisma.trade.findFirst({
      where: { id, company_id: companyId },
      include: {
        customer: { select: { name: true, phone: true } },
        employee: { select: { name: true } },
        sale: {
          include: {
            items: {
              include: {
                bulkProduct: {
                  select: { id: true, brand: true, model: true, barcode: true },
                },
                singleDevice: { select: { id: true, name: true, imei: true } },
              },
            },
          },
        },
        purchase: {
          include: {
            items: {
              include: {
                singleDevice: { select: { id: true, name: true, imei: true } },
              },
            },
          },
        },
      },
    });

    if (!trade) throw new Error('Takas kaydı bulunamadı');
    return trade;
  }

  async cancel(companyId: number, id: number, employeeId: number) {
    const trade = await this.prisma.trade.findFirst({
      where: { id, company_id: companyId },
      include: {
        sale: { include: { items: true } },
        purchase: { include: { items: true } },
      },
    });

    if (!trade) throw new NotFoundException('Takas bulunamadı');
    if ((trade as any).status === TransactionStatus.CANCELLED)
      throw new BadRequestException('Bu takas zaten iptal edilmiş');

    return this.prisma.$transaction(async (tx) => {
      // 1. Satış Tarafını İptal Et (Stokları geri al)
      for (const item of trade.sale.items) {
        if (item.bulk_product_id) {
          await tx.bulkProduct.update({
            where: { id: item.bulk_product_id },
            data: { quantity: { increment: item.quantity } },
          });
        } else if (item.single_device_id) {
          await tx.singleDevice.update({
            where: { id: item.single_device_id },
            data: { status: DeviceStatus.IN_STOCK },
          });
        }
        await tx.stockMovement.create({
          data: {
            company_id: companyId,
            bulk_product_id: item.bulk_product_id,
            single_device_id: item.single_device_id,
            type: MovementType.IN,
            quantity: item.quantity,
            reason: `Takas İptali #${trade.id} (Satış Tarafı)`,
          },
        });
      }

      // 2. Alım Tarafını İptal Et (Stokları düşür/sil)
      for (const item of trade.purchase.items) {
        if (item.bulk_product_id) {
          await tx.bulkProduct.update({
            where: { id: item.bulk_product_id },
            data: { quantity: { decrement: item.quantity } },
          });
        } else if (item.single_device_id) {
          await tx.singleDevice.update({
            where: { id: item.single_device_id },
            data: { deleted_at: new Date() },
          });
        }
        await tx.stockMovement.create({
          data: {
            company_id: companyId,
            bulk_product_id: item.bulk_product_id,
            single_device_id: item.single_device_id,
            type: MovementType.OUT,
            quantity: item.quantity,
            reason: `Takas İptali #${trade.id} (Alım Tarafı)`,
          },
        });
      }

      // 3. Finansal İşlemleri Geri Al
      const cashRegister = await tx.cashRegister.findUnique({
        where: { company_id: companyId },
      });
      if (cashRegister) {
        // Ödenen nakit tutarı kasadan düş (Müşteri bize para vermişti, şimdi geri veriyoruz)
        if (Number(trade.paid_amount) > 0) {
          await tx.cashRegister.update({
            where: { id: cashRegister.id },
            data: { balance: { decrement: trade.paid_amount } },
          });
          await tx.cashTransaction.create({
            data: {
              company_id: companyId,
              cash_register_id: cashRegister.id,
              type: CashTransactionType.REFUND_OUT,
              amount: trade.paid_amount,
              reference_id: trade.id,
              description: `Takas İptali #${trade.id} (Nakit İadesi)`,
            },
          });
        }

        // Eğer biz para üstü vermişsek (REFUND_OUT kayıtlarını bulup kasaya geri alalım)
        const refundTransactions = await tx.cashTransaction.findMany({
          where: {
            company_id: companyId,
            reference_id: trade.id,
            type: CashTransactionType.REFUND_OUT,
            description: { contains: 'Takas Para Üstü' },
          },
        });
        for (const t of refundTransactions) {
          await tx.cashRegister.update({
            where: { id: cashRegister.id },
            data: { balance: { increment: t.amount } },
          });
        }

        // Gider ve Gelir kayıtlarını temizle
        await tx.expense.deleteMany({
          where: {
            company_id: companyId,
            title: { contains: `Takas Alım Bedeli #${trade.purchase_id}` },
          },
        });
        await tx.income.deleteMany({
          where: {
            company_id: companyId,
            title: { contains: `Takas Satış Geliri #${trade.sale_id}` },
          },
        });
      }

      // 4. Müşteri Bakiyesini Geri Al
      // Bakiye Etkisi = (Satış Tutarı - Alım Tutarı) - Ödenen Nakit
      const balanceImpact =
        Number(trade.sale_total) -
        Number(trade.trade_in_value) -
        Number(trade.paid_amount);
      if (balanceImpact !== 0) {
        await tx.customer.update({
          where: { id: trade.customer_id },
          data: { balance: { decrement: balanceImpact } },
        });
      }

      // 6. Statüleri Güncelle
      await tx.sale.update({
        where: { id: trade.sale_id },
        data: { status: TransactionStatus.CANCELLED },
      });
      await tx.purchase.update({
        where: { id: trade.purchase_id },
        data: { status: TransactionStatus.CANCELLED },
      });
      const updatedTrade = await tx.trade.update({
        where: { id },
        data: { status: TransactionStatus.CANCELLED },
      });

      return updatedTrade;
    });
  }
}
