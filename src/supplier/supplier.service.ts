import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/pagination.interface';

@Injectable()
export class SupplierService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: number, dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findFirst({
      where: {
        company_id: companyId,
        name: dto.name,
        deleted_at: null,
      },
    });

    if (existing) {
      throw new ConflictException('Bu isimde bir tedarikçi zaten kayıtlı');
    }

    return this.prisma.supplier.create({
      data: {
        ...dto,
        company_id: companyId,
        total_debt: 0,
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
      ];
    }

    const [data, total, statsData, companyData] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: {
          purchases: {
            where: { status: 'COMPLETED' },
            select: { total_amount: true, paid_amount: true, usd_rate: true },
          },
          supplierReturns: {
            where: { status: 'COMPLETED' },
            select: {
              total_amount: true,
              received_amount: true,
              usd_rate: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.supplier.count({
        where,
      }),
      this.prisma.supplier.aggregate({
        where: { company_id: companyId, deleted_at: null },
        _sum: { total_debt: true },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { usd_rate: true },
      }),
    ]);

    const currentRate = Number(companyData?.usd_rate || 0);

    // Dolar bazlı borç hesaplama (Satır satır TL / Kur)
    const processedData = data.map((s) => {
      let debtUsd = 0;
      s.purchases.forEach((p) => {
        const rate = Number(p.usd_rate) > 1 ? Number(p.usd_rate) : currentRate;
        if (rate > 1) {
          debtUsd += (Number(p.total_amount) - Number(p.paid_amount)) / rate;
        }
      });
      s.supplierReturns.forEach((r) => {
        const rate = Number(r.usd_rate) > 1 ? Number(r.usd_rate) : currentRate;
        if (rate > 1) {
          debtUsd -=
            (Number(r.total_amount) - Number(r.received_amount)) / rate;
        }
      });

      return {
        ...s,
        total_debt_usd: debtUsd.toFixed(2),
        purchases: undefined, // Hide these in the final response if not needed
        supplierReturns: undefined,
      };
    });

    // Stats için dolar toplamı (Ham SQL veya Aggregate)
    // Not: Performans için ham SQL daha iyi olabilir ama burada aggregate ile gidelim
    const allPurchases = await this.prisma.purchase.findMany({
      where: {
        company_id: companyId,
        status: 'COMPLETED',
        supplier_id: { not: null },
      },
      select: { total_amount: true, paid_amount: true, usd_rate: true },
    });
    const allReturns = await this.prisma.supplierReturn.findMany({
      where: { company_id: companyId, status: 'COMPLETED' },
      select: { total_amount: true, received_amount: true, usd_rate: true },
    });

    let totalDebtUsd = 0;
    allPurchases.forEach((p) => {
      const rate = Number(p.usd_rate) > 1 ? Number(p.usd_rate) : currentRate;
      if (rate > 1) {
        totalDebtUsd += (Number(p.total_amount) - Number(p.paid_amount)) / rate;
      }
    });
    allReturns.forEach((r) => {
      const rate = Number(r.usd_rate) > 1 ? Number(r.usd_rate) : currentRate;
      if (rate > 1) {
        totalDebtUsd -=
          (Number(r.total_amount) - Number(r.received_amount)) / rate;
      }
    });

    // Pozitif ve negatif bakiyeleri ayrı ayrı hesaplamak için ek sorgular
    const [debtSum, receivableSum] = await Promise.all([
      this.prisma.supplier.aggregate({
        where: {
          company_id: companyId,
          deleted_at: null,
          total_debt: { gt: 0 },
        },
        _sum: { total_debt: true },
      }),
      this.prisma.supplier.aggregate({
        where: {
          company_id: companyId,
          deleted_at: null,
          total_debt: { lt: 0 },
        },
        _sum: { total_debt: true },
      }),
    ]);

    return {
      data: processedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        totalDebt: debtSum._sum.total_debt || 0,
        totalDebtUsd: totalDebtUsd.toFixed(2),
        totalReceivable: Math.abs(Number(receivableSum._sum.total_debt || 0)),
        balance: statsData._sum.total_debt || 0,
      },
    } as any;
  }

  async findOne(companyId: number, id: number) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id,
        company_id: companyId,
        deleted_at: null,
      },
      include: {
        purchases: {
          where: { status: 'COMPLETED' },
          select: { total_amount: true, paid_amount: true, usd_rate: true },
        },
        supplierReturns: {
          where: { status: 'COMPLETED' },
          select: { total_amount: true, received_amount: true, usd_rate: true },
        },
        company: {
          select: { usd_rate: true },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException('Tedarikçi bulunamadı');
    }

    const currentRate = Number((supplier as any).company?.usd_rate || 0);
    let debtUsd = 0;
    supplier.purchases.forEach((p) => {
      const rate = Number(p.usd_rate) > 1 ? Number(p.usd_rate) : currentRate;
      if (rate > 1) {
        debtUsd += (Number(p.total_amount) - Number(p.paid_amount)) / rate;
      }
    });
    supplier.supplierReturns.forEach((r) => {
      const rate = Number(r.usd_rate) > 1 ? Number(r.usd_rate) : currentRate;
      if (rate > 1) {
        debtUsd -= (Number(r.total_amount) - Number(r.received_amount)) / rate;
      }
    });

    return {
      ...supplier,
      total_debt_usd: debtUsd.toFixed(2),
      // purchases: undefined, // Don't hide if frontend expects recent purchases
      supplierReturns: undefined,
    };
  }

  async update(companyId: number, id: number, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!supplier) {
      throw new NotFoundException('Tedarikçi bulunamadı');
    }

    if (dto.name && dto.name !== supplier.name) {
      const nameExists = await this.prisma.supplier.findFirst({
        where: {
          company_id: companyId,
          name: dto.name,
          deleted_at: null,
          NOT: { id },
        },
      });
      if (nameExists) {
        throw new ConflictException('Bu isimde başka bir tedarikçi mevcut');
      }
    }

    return this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async remove(companyId: number, id: number) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!supplier) {
      throw new NotFoundException('Tedarikçi bulunamadı');
    }

    return this.prisma.supplier.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async paySupplier(
    companyId: number,
    id: number,
    amount: number,
    employeeId: number,
    currency: 'TL' | 'USD' = 'TL',
    description?: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Ödenecek tutar 0 dan büyük olmalıdır');
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!supplier) throw new NotFoundException('Tedarikçi bulunamadı');

    return this.prisma.$transaction(async (tx) => {
      // 0. Güncel Kur
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { usd_rate: true },
      });
      const currentRate = Number(company?.usd_rate || 1);

      // 1. Tedarikçiye ait tüm tamamlanmış alımları getir
      const allPurchases = await tx.purchase.findMany({
        where: {
          company_id: companyId,
          supplier_id: id,
          status: 'COMPLETED',
        },
        orderBy: { created_at: 'asc' },
      });

      // 2. Sadece borcu kalanları filtrele
      // Borç hesaplama: (Total - Paid) / Rate
      const unpaidPurchases = allPurchases.filter(
        (p) => Number(p.paid_amount) < Number(p.total_amount),
      );

      let remainingPayment = amount; // Bu tutar seçilen currency cinsindendir
      let totalTlPaidFromRegister = 0;
      let totalTlReducedFromDebt = 0;

      for (const purchase of unpaidPurchases) {
        if (remainingPayment <= 0) break;

        const purchaseRate =
          Number(purchase.usd_rate) > 1
            ? Number(purchase.usd_rate)
            : currentRate;

        let paymentInPurchaseCurrency;
        let paymentToReduceTlDebt;

        if (currency === 'USD') {
          // Dolar ödemesi: Kalan dolar borcu kadar veya ödenen dolar kadar düşer
          const purchaseDebtUsd =
            (Number(purchase.total_amount) - Number(purchase.paid_amount)) /
            purchaseRate;
          const paymentUsdForThis = Math.min(remainingPayment, purchaseDebtUsd);

          paymentToReduceTlDebt = paymentUsdForThis * purchaseRate;
          totalTlPaidFromRegister += paymentUsdForThis * currentRate;
          remainingPayment -= paymentUsdForThis;
        } else {
          // TL ödemesi: Klasik mantık
          const purchaseDebtTl =
            Number(purchase.total_amount) - Number(purchase.paid_amount);
          const paymentTlForThis = Math.min(remainingPayment, purchaseDebtTl);

          paymentToReduceTlDebt = paymentTlForThis;
          totalTlPaidFromRegister += paymentTlForThis;
          remainingPayment -= paymentTlForThis;
        }

        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            paid_amount: { increment: paymentToReduceTlDebt },
          },
        });

        totalTlReducedFromDebt += paymentToReduceTlDebt;
      }

      // Eğer hala kalan ödeme varsa (tüm borçlar bittiyse), bakiyeye (negatif borç) ekle
      if (remainingPayment > 0) {
        if (currency === 'USD') {
          totalTlPaidFromRegister += remainingPayment * currentRate;
          totalTlReducedFromDebt += remainingPayment * currentRate; // Fazladan ödeme TL olarak borçtan düşer
        } else {
          totalTlPaidFromRegister += remainingPayment;
          totalTlReducedFromDebt += remainingPayment;
        }
      }

      // Find cash register
      let register = await tx.cashRegister.findUnique({
        where: { company_id: companyId },
      });

      if (!register) {
        register = await tx.cashRegister.create({
          data: { company_id: companyId, balance: 0 },
        });
      }

      // Update supplier total debt
      const updatedSupplier = await tx.supplier.update({
        where: { id },
        data: {
          total_debt: {
            decrement: totalTlReducedFromDebt,
          },
        },
      });

      // Update cash register balance
      await tx.cashRegister.update({
        where: { id: register.id },
        data: {
          balance: {
            decrement: totalTlPaidFromRegister,
          },
        },
      });

      // Create transaction record
      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: register.id,
          type: 'SUPPLIER_PAYMENT',
          amount: totalTlPaidFromRegister,
          description:
            description ||
            `${supplier.name} - Tedarikçi Ödemesi (${amount} ${currency})`,
          reference_id: supplier.id,
        },
      });

      // Create Expense record
      await tx.expense.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          title: `Tedarikçi Ödemesi: ${supplier.name}`,
          amount: totalTlPaidFromRegister,
          category: 'ALIM',
          description:
            description ||
            `${supplier.name} şirketine yapılan ${amount} ${currency} tutarında borç ödemesi`,
        },
      });

      return updatedSupplier;
    });
  }
}
