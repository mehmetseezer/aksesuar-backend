import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/pagination.interface';
import { CashTransactionType, AuditAction } from '@prisma/client';

@Injectable()
export class ExpenseService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: number, employeeId: number, dto: CreateExpenseDto) {
    return this.prisma.$transaction(async (tx) => {
      let cashRegister = await tx.cashRegister.findUnique({
        where: { company_id: companyId },
      });

      if (!cashRegister) {
        cashRegister = await tx.cashRegister.create({
          data: { company_id: companyId, balance: 0 },
        });
      }

      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { usd_rate: true },
      });

      const expense = await tx.expense.create({
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
        data: { balance: { decrement: dto.amount } },
      });

      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: cashRegister.id,
          type: CashTransactionType.EXPENSE_OUT,
          amount: dto.amount,
          reference_id: expense.id,
          description: `Gider: ${dto.title}`,
        },
      });

      // Sadece gider oluşturma logu tutuluyor
      await tx.auditLog.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          action: AuditAction.EXPENSE_CREATE,
          entity: 'Expense',
          entity_id: expense.id,
          new_value: { title: dto.title, amount: dto.amount },
        },
      });

      return expense;
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
      this.prisma.expense.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          employee: { select: { name: true, id: true } },
        },
      }),
      this.prisma.expense.count({ where }),
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
    const expense = await this.prisma.expense.findFirst({
      where: {
        id,
        company_id: companyId,
        deleted_at: null,
      },
      include: {
        employee: { select: { name: true, id: true } },
      },
    });

    if (!expense) {
      throw new NotFoundException('Gider kaydı bulunamadı');
    }

    return expense;
  }

  async update(companyId: number, id: number, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findFirst({
      where: {
        id,
        company_id: companyId,
        deleted_at: null,
      },
    });

    if (!expense) {
      throw new NotFoundException('Gider kaydı bulunamadı');
    }

    return this.prisma.expense.update({
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
    const expense = await this.prisma.expense.findFirst({
      where: {
        id,
        company_id: companyId,
        deleted_at: null,
      },
    });

    if (!expense) {
      throw new NotFoundException('Gider kaydı bulunamadı');
    }

    const cashRegister = await this.prisma.cashRegister.findUnique({
      where: { company_id: companyId },
    });

    return this.prisma.$transaction(async (tx) => {
      // 1. Soft delete expense
      const updatedExpense = await tx.expense.update({
        where: { id },
        data: { deleted_at: new Date() },
      });

      if (cashRegister) {
        // 2. Increment balance (reversing the expense)
        await tx.cashRegister.update({
          where: { id: cashRegister.id },
          data: { balance: { increment: expense.amount } },
        });

        // 3. Create reversal transaction
        await tx.cashTransaction.create({
          data: {
            company_id: companyId,
            cash_register_id: cashRegister.id,
            type: CashTransactionType.OTHER_INCOME,
            amount: expense.amount,
            reference_id: expense.id,
            description: `Gider İptali (Silindi): ${expense.title}`,
          },
        });

        // 4. Audit Log
        await tx.auditLog.create({
          data: {
            company_id: companyId,
            employee_id: employeeId,
            action: AuditAction.EXPENSE_DELETE,
            entity: 'Expense',
            entity_id: expense.id,
            old_value: { title: expense.title, amount: expense.amount },
          },
        });
      }

      return updatedExpense;
    });
  }
}
