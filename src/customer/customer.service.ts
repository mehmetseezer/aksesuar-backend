import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LedgerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/pagination.interface';

@Injectable()
export class CustomerService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: number, dto: CreateCustomerDto) {
    const existing = await this.prisma.customer.findFirst({
      where: {
        company_id: companyId,
        phone: dto.phone,
        deleted_at: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Bu telefon numarası ile kayıtlı müşteri zaten mevcut',
      );
    }

    return this.prisma.customer.create({
      data: {
        ...dto,
        company_id: companyId,
      },
    });
  }

  async findAll(
    companyId: number,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResult<any>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      company_id: companyId,
      deleted_at: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { identity_no: { contains: search } },
      ];
    }

    const [data, total, statsData, debtSum, creditSum] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          phone: true,
          identity_no: true,
          balance: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma.customer.count({
        where,
      }),
      this.prisma.customer.aggregate({
        where,
        _sum: { balance: true },
        _count: { id: true },
      }),
      this.prisma.customer.aggregate({
        where: { ...where, balance: { gt: 0 } },
        _sum: { balance: true },
        _count: { id: true },
      }),
      this.prisma.customer.aggregate({
        where: { ...where, balance: { lt: 0 } },
        _sum: { balance: true },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        totalBalance: statsData._sum.balance || 0,
        totalDebt: debtSum._sum.balance || 0,
        totalCredit: Math.abs(Number(creditSum._sum.balance || 0)),
        debtorCount: debtSum._count.id || 0,
      },
    };
  }

  async findOne(companyId: number, id: number) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        company_id: companyId,
        deleted_at: null,
      },
      include: {
        sales: {
          orderBy: { created_at: 'desc' },
          include: {
            items: {
              include: {
                bulkProduct: { select: { brand: true, model: true } },
                singleDevice: { select: { name: true, imei: true } },
              },
            },
            employee: { select: { name: true } },
          },
        },
        purchases: {
          orderBy: { created_at: 'desc' },
          include: {
            items: {
              include: {
                bulkProduct: { select: { brand: true, model: true } },
                singleDevice: { select: { name: true, imei: true } },
              },
            },
            employee: { select: { name: true } },
          },
        },
        trades: {
          orderBy: { created_at: 'desc' },
          include: {
            sale: {
              include: {
                items: {
                  include: {
                    bulkProduct: { select: { brand: true, model: true } },
                    singleDevice: { select: { name: true, imei: true } },
                  },
                },
              },
            },
            purchase: {
              include: {
                items: {
                  include: {
                    bulkProduct: { select: { brand: true, model: true } },
                    singleDevice: { select: { name: true, imei: true } },
                  },
                },
              },
            },
            employee: { select: { name: true } },
          },
        },
        returns: {
          orderBy: { created_at: 'desc' },
          include: {
            items: {
              include: {
                bulkProduct: { select: { brand: true, model: true } },
                singleDevice: { select: { name: true, imei: true } },
              },
            },
            employee: { select: { name: true } },
          },
        },
        ledgers: {
          take: 50,
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    const calculatedBalance = await this.getCustomerBalance(id);

    return {
      ...customer,
      calculated_balance: calculatedBalance,
    };
  }

  async update(companyId: number, id: number, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!customer) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    if (dto.phone && dto.phone !== customer.phone) {
      const phoneExists = await this.prisma.customer.findFirst({
        where: {
          company_id: companyId,
          phone: dto.phone,
          deleted_at: null,
          NOT: { id },
        },
      });
      if (phoneExists) {
        throw new ConflictException(
          'Bu telefon numarası başka bir müşteriye ait',
        );
      }
    }

    return this.prisma.customer.update({
      where: { id },
      data: dto,
    });
  }

  async getCustomerBalance(customerId: number): Promise<number> {
    const aggregate = await this.prisma.customerLedger.aggregate({
      where: { customer_id: customerId },
      _sum: { amount: true },
    });
    return Number(aggregate._sum.amount || 0);
  }

  async remove(companyId: number, id: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!customer) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    return this.prisma.customer.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async payCustomer(
    companyId: number,
    id: number,
    amount: number,
    employeeId: number,
    description?: string,
  ) {
    if (amount <= 0)
      throw new BadRequestException('Tutar 0 dan büyük olmalıdır');
    const customer = await this.prisma.customer.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });
    if (!customer) throw new NotFoundException('Müşteri bulunamadı');

    return this.prisma.$transaction(async (tx) => {
      let register = await tx.cashRegister.findUnique({
        where: { company_id: companyId },
      });
      if (!register)
        register = await tx.cashRegister.create({
          data: { company_id: companyId, balance: 0 },
        });

      // 1. Ledger kaydı oluştur (Negatif - Bakiye düştü, müşteri bize olan borcunu ödedi veya biz ona ödedik)
      // Customer Ledger'da Ödeme Yapmak (payCustomer) -> Bizim ona borcumuz vardı, ödedik -> Bakiyesi artar (borcu azalır/alacağı azalır)
      // Aslında payCustomer "Bizim ona olan borcumuzun ödenmesi" demektir.
      await tx.customerLedger.create({
        data: {
          company_id: companyId,
          customer_id: id,
          type: LedgerType.CUSTOMER_PAYMENT,
          amount: amount, // Borcunu artırıyoruz (bizim açımızdan)
          description: description || 'Müşteriye Ödeme',
        },
      });

      const updatedCustomer = await tx.customer.update({
        where: { id },
        data: { balance: { increment: amount } },
      });

      await tx.cashRegister.update({
        where: { id: register.id },
        data: { balance: { decrement: amount } },
      });

      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: register.id,
          type: 'PURCHASE_PAYMENT',
          amount: amount,
          description:
            description || `${customer.name} - Müşteriye Borç Ödemesi`,
          reference_id: customer.id,
        },
      });

      await tx.expense.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          title: `Müşteri Ödemesi: ${customer.name}`,
          amount: amount,
          category: 'ALIM',
          description:
            description || `${customer.name} kişisine yapılan borç ödemesi`,
        },
      });

      return updatedCustomer;
    });
  }

  async receivePayment(
    companyId: number,
    id: number,
    amount: number,
    employeeId: number,
    description?: string,
  ) {
    if (amount <= 0)
      throw new BadRequestException('Tutar 0 dan büyük olmalıdır');
    const customer = await this.prisma.customer.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });
    if (!customer) throw new NotFoundException('Müşteri bulunamadı');

    return this.prisma.$transaction(async (tx) => {
      let register = await tx.cashRegister.findUnique({
        where: { company_id: companyId },
      });
      if (!register)
        register = await tx.cashRegister.create({
          data: { company_id: companyId, balance: 0 },
        });

      // 1. Ledger kaydı oluştur (Negatif - Tahsilat yapıldı, müşterinin borcu azaldı)
      await tx.customerLedger.create({
        data: {
          company_id: companyId,
          customer_id: id,
          type: LedgerType.CUSTOMER_PAYMENT,
          amount: -amount,
          description: description || 'Müşteriden Tahsilat',
        },
      });

      const updatedCustomer = await tx.customer.update({
        where: { id },
        data: { balance: { decrement: amount } },
      });

      await tx.cashRegister.update({
        where: { id: register.id },
        data: { balance: { increment: amount } },
      });

      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: register.id,
          type: 'CUSTOMER_PAYMENT',
          amount: amount,
          description: description || `${customer.name} - Tahsilat`,
          reference_id: customer.id,
        },
      });

      await tx.income.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          title: `Müşteri Tahsilatı: ${customer.name}`,
          amount: amount,
          category: 'ALACAK TAHSİLATI',
          description:
            description || `${customer.name} kişisinden yapılan tahsilat`,
        },
      });

      return updatedCustomer;
    });
  }

  async findSales(companyId: number, id: number, pagination: PaginationDto) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where: { company_id: companyId, customer_id: id },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          items: {
            include: {
              bulkProduct: { select: { brand: true, model: true } },
              singleDevice: { select: { name: true, imei: true } },
            },
          },
          employee: { select: { name: true } },
        },
      }),
      this.prisma.sale.count({
        where: { company_id: companyId, customer_id: id },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findPurchases(
    companyId: number,
    id: number,
    pagination: PaginationDto,
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where: { company_id: companyId, customer_id: id },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          items: {
            include: {
              bulkProduct: { select: { brand: true, model: true } },
              singleDevice: { select: { name: true, imei: true } },
            },
          },
          employee: { select: { name: true } },
        },
      }),
      this.prisma.purchase.count({
        where: { company_id: companyId, customer_id: id },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findTrades(companyId: number, id: number, pagination: PaginationDto) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.trade.findMany({
        where: { company_id: companyId, customer_id: id },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          sale: {
            include: {
              items: {
                include: {
                  bulkProduct: { select: { brand: true, model: true } },
                  singleDevice: { select: { name: true, imei: true } },
                },
              },
            },
          },
          purchase: {
            include: {
              items: {
                include: {
                  bulkProduct: { select: { brand: true, model: true } },
                  singleDevice: { select: { name: true, imei: true } },
                },
              },
            },
          },
          employee: { select: { name: true } },
        },
      }),
      this.prisma.trade.count({
        where: { company_id: companyId, customer_id: id },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findReturns(companyId: number, id: number, pagination: PaginationDto) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.return.findMany({
        where: { company_id: companyId, customer_id: id },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          items: {
            include: {
              bulkProduct: { select: { brand: true, model: true } },
              singleDevice: { select: { name: true, imei: true } },
            },
          },
          employee: { select: { name: true } },
        },
      }),
      this.prisma.return.count({
        where: { company_id: companyId, customer_id: id },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findPayments(companyId: number, id: number, pagination: PaginationDto) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.cashTransaction.findMany({
        where: {
          company_id: companyId,
          reference_id: id,
          type: {
            in: [
              'CUSTOMER_PAYMENT',
              'PURCHASE_PAYMENT',
              'REFUND_OUT',
              'SALE_INCOME',
            ],
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.cashTransaction.count({
        where: {
          company_id: companyId,
          reference_id: id,
          type: {
            in: [
              'CUSTOMER_PAYMENT',
              'PURCHASE_PAYMENT',
              'REFUND_OUT',
              'SALE_INCOME',
            ],
          },
        },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
