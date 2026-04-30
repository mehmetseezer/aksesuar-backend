import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/pagination.interface';
import { CashTransactionType, AuditAction } from '@prisma/client';

@Injectable()
export class IncomeService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: number, employeeId: number, dto: CreateIncomeDto) {
    const cashRegister = await this.prisma.cashRegister.findUnique({
      where: { company_id: companyId },
    });

    if (!cashRegister) {
      throw new BadRequestException(
        'Kasa bulunamadı, önce bir kasa kaydı oluşturmalısınız',
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { usd_rate: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const income = await tx.income.create({
        data: {
          company_id: companyId,
          employee_id: dto.employee_id || employeeId,
          title: dto.title,
          amount: dto.amount,
          category: dto.category || 'GENEL',
          description: dto.description,
          usd_rate: company?.usd_rate || 0,
        },
      });

      await tx.cashRegister.update({
        where: { company_id: companyId },
        data: { balance: { increment: dto.amount } },
      });

      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: cashRegister.id,
          type: CashTransactionType.OTHER_INCOME,
          amount: dto.amount,
          reference_id: income.id,
          description: `Gelir: ${dto.title}`,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          action: AuditAction.INCOME_CREATE,
          entity: 'Income',
          entity_id: income.id,
          new_value: {
            title: dto.title,
            amount: dto.amount,
            category: income.category,
          },
        },
      });

      return income;
    });
  }

  async findAll(
    companyId: number,
    pagination: PaginationDto,
    category?: string,
    search?: string,
  ): Promise<PaginatedResult<any>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      company_id: companyId,
      deleted_at: null,
      ...(category && { category }),
    };

    if (search) {
      where.AND = [
        { company_id: companyId },
        { deleted_at: null },
        ...(category ? [{ category }] : []),
        {
          OR: [
            { title: { contains: search } },
            { description: { contains: search } },
          ],
        },
      ];
      delete where.company_id;
      delete where.deleted_at;
      if (category) delete where.category;
    }

    const [data, total] = await Promise.all([
      this.prisma.income.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          employee: { select: { name: true, id: true } },
        },
      }),
      this.prisma.income.count({ where }),
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
    const income = await this.prisma.income.findFirst({
      where: {
        id,
        company_id: companyId,
        deleted_at: null,
      },
      include: {
        employee: { select: { name: true, id: true } },
      },
    });

    if (!income) {
      throw new NotFoundException('Gelir kaydı bulunamadı');
    }

    return income;
  }

  async update(companyId: number, id: number, dto: UpdateIncomeDto) {
    const income = await this.prisma.income.findFirst({
      where: {
        id,
        company_id: companyId,
        deleted_at: null,
      },
    });

    if (!income) {
      throw new NotFoundException('Gelir kaydı bulunamadı');
    }

    return this.prisma.income.update({
      where: { id },
      data: {
        title: dto.title,
        amount: dto.amount,
        category: dto.category,
        description: dto.description,
      },
    });
  }

  async remove(companyId: number, id: number, employeeId: number) {
    const income = await this.prisma.income.findFirst({
      where: {
        id,
        company_id: companyId,
        deleted_at: null,
      },
    });

    if (!income) {
      throw new NotFoundException('Gelir kaydı bulunamadı');
    }

    const cashRegister = await this.prisma.cashRegister.findUnique({
      where: { company_id: companyId },
    });

    return this.prisma.$transaction(async (tx) => {
      // 1. Soft delete income
      const updatedIncome = await tx.income.update({
        where: { id },
        data: { deleted_at: new Date() },
      });

      if (cashRegister) {
        // 2. Decrement balance
        await tx.cashRegister.update({
          where: { id: cashRegister.id },
          data: { balance: { decrement: income.amount } },
        });

        // 3. Create reversal transaction
        await tx.cashTransaction.create({
          data: {
            company_id: companyId,
            cash_register_id: cashRegister.id,
            type: CashTransactionType.EXPENSE_OUT,
            amount: income.amount,
            reference_id: income.id,
            description: `Gelir İptali (Silindi): ${income.title}`,
          },
        });

        // 4. Audit Log
        await tx.auditLog.create({
          data: {
            company_id: companyId,
            employee_id: employeeId,
            action: AuditAction.INCOME_DELETE,
            entity: 'Income',
            entity_id: income.id,
            old_value: { title: income.title, amount: income.amount },
          },
        });
      }

      return updatedIncome;
    });
  }
}
