import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class CommissionService {
  constructor(private prisma: PrismaService) {}

  async createRule(companyId: number, dto: CreateCommissionRuleDto) {
    return this.prisma.$transaction(async (tx) => {
      // Eğer çalışana özel bir kural ise ve aktifse, diğer aktif kurallarını pasife çek
      if (dto.employee_id && dto.is_active !== false) {
        await tx.commissionRule.updateMany({
          where: {
            company_id: companyId,
            employee_id: dto.employee_id,
            is_active: true,
          },
          data: { is_active: false },
        });
      }

      return tx.commissionRule.create({
        data: {
          company_id: companyId,
          employee_id: dto.employee_id,
          name: dto.name,
          min_profit: dto.min_profit,
          type: dto.type,
          value: dto.value,
          step_amount: dto.step_amount,
          step_value: dto.step_value,
          is_active: dto.is_active !== undefined ? dto.is_active : true,
        },
      });
    });
  }

  async findAllRules(companyId: number, pagination: PaginationDto) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.commissionRule.findMany({
        where: { company_id: companyId },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { employee: { select: { name: true } } },
      }),
      this.prisma.commissionRule.count({ where: { company_id: companyId } }),
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

  async findOneRule(companyId: number, id: number) {
    const rule = await this.prisma.commissionRule.findFirst({
      where: { id, company_id: companyId },
    });

    if (!rule) {
      throw new NotFoundException('Komisyon kuralı bulunamadı');
    }

    return rule;
  }

  async updateRule(
    companyId: number,
    id: number,
    dto: UpdateCommissionRuleDto,
  ) {
    await this.findOneRule(companyId, id); // check existence

    return this.prisma.$transaction(async (tx) => {
      if (dto.employee_id && dto.is_active === true) {
        await tx.commissionRule.updateMany({
          where: {
            company_id: companyId,
            employee_id: dto.employee_id,
            is_active: true,
            id: { not: id },
          },
          data: { is_active: false },
        });
      }

      return tx.commissionRule.update({
        where: { id },
        data: {
          name: dto.name,
          employee_id: dto.employee_id,
          min_profit: dto.min_profit,
          type: dto.type,
          value: dto.value,
          step_amount: dto.step_amount,
          step_value: dto.step_value,
          is_active: dto.is_active,
        },
      });
    });
  }

  async removeRule(companyId: number, id: number) {
    await this.findOneRule(companyId, id);
    return this.prisma.commissionRule.delete({
      where: { id },
    });
  }

  // Çalışana özel gerçekleştirilen tüm komisyonları getiren method (Employee detail page için)
  async getEmployeeCommissions(
    companyId: number,
    employeeId: number,
    pagination: PaginationDto,
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.commission.findMany({
        where: {
          employee_id: employeeId,
          employee: { company_id: companyId },
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          sale: {
            select: { total_amount: true, created_at: true },
          },
          rule: {
            select: { name: true, type: true, value: true },
          },
        },
      }),
      this.prisma.commission.count({
        where: {
          employee_id: employeeId,
          employee: { company_id: companyId },
        },
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
    };
  }
}
