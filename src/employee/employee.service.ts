// src/employee/employee.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import * as bcrypt from 'bcrypt';
import { Role, EmployeeStatus, AuditAction, LedgerType } from '@prisma/client';

@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async create(
    companyId: number,
    dto: CreateEmployeeDto,
    creatorRole: Role,
    creatorId: number,
  ) {
    // Sadece ADMIN ve MANAGER personel oluşturabilir
    if (creatorRole !== Role.ADMIN && creatorRole !== Role.MANAGER) {
      throw new ForbiddenException(
        'Personel oluşturma yetkiniz bulunmamaktadır',
      );
    }

    // Email benzersizliği kontrolü
    const existing = await this.prisma.employee.findFirst({
      where: {
        company_id: companyId,
        email: dto.email,
        deleted_at: null,
      },
    });

    if (existing) {
      throw new ConflictException('Bu e-posta adresi zaten kayıtlı');
    }

    const password_hash = await this.hashPassword(dto.password);

    const employee = await this.prisma.employee.create({
      data: {
        company_id: companyId,
        name: dto.name,
        email: dto.email,
        password_hash,
        role: dto.role || Role.STAFF,
        salary: dto.salary || 0,
        employment_date: dto.employment_date || new Date(),
      },
    });

    // ? Audit log ekle
    try {
      await this.prisma.auditLog.create({
        data: {
          company_id: companyId,
          employee_id: creatorId,
          action: AuditAction.EMPLOYEE_CREATE,
          entity: 'Employee',
          entity_id: employee.id,
          new_value: {
            name: employee.name,
            email: employee.email,
            role: employee.role,
          },
        },
      });
    } catch (error) {
      console.error('Audit log oluşturulamadı:', error);
    }

    const { password_hash: _, ...result } = employee;
    return result;
  }

  async findAll(
    companyId: number,
    pagination: PaginationDto,
    filters: { role?: Role; status?: EmployeeStatus; search?: string },
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      company_id: companyId,
      deleted_at: null,
      ...(filters.role && { role: filters.role }),
      ...(filters.status && { status: filters.status }),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search } },
          { email: { contains: filters.search } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          salary: true,
          commission_balance: true,
          last_login_at: true,
          created_at: true,
        },
      }),
      this.prisma.employee.count({ where }),
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
    const employee = await this.prisma.employee.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
      include: {
        _count: {
          select: { sales: true, purchases: true },
        },
        commissionRules: {
          where: { is_active: true },
        },
        commissions: {
          take: 5,
          orderBy: { created_at: 'desc' },
          include: {
            rule: { select: { name: true } },
          },
        },
        ledgers: {
          take: 50,
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Personel bulunamadı');
    }

    const calculatedBalance = await this.getEmployeeBalance(id);

    // Hash'li password'ü gizle
    const { password_hash, ...result } = employee;
    return {
      ...result,
      calculated_balance: calculatedBalance,
    };
  }

  async update(
    companyId: number,
    id: number,
    dto: UpdateEmployeeDto,
    currentEmployeeId: number,
    currentEmployeeRole: Role,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!employee) {
      throw new NotFoundException('Personel bulunamadı');
    }

    // Yetki kontrolleri
    await this.checkUpdatePermissions(
      employee,
      currentEmployeeId,
      currentEmployeeRole,
      dto,
    );

    // Email benzersizliği kontrolü
    if (dto.email && dto.email !== employee.email) {
      const emailExists = await this.prisma.employee.findFirst({
        where: {
          company_id: companyId,
          email: dto.email,
          deleted_at: null,
          NOT: { id },
        },
      });
      if (emailExists) {
        throw new ConflictException(
          'Bu e-posta adresi başka bir personele ait',
        );
      }
    }

    // Password hash'leme
    let password_hash = employee.password_hash;
    if (dto.password) {
      password_hash = await this.hashPassword(dto.password);
    }

    // Eski değerleri audit log için sakla
    const oldValues = {
      name: employee.name,
      email: employee.email,
      role: employee.role,
      status: employee.status,
      salary: employee.salary,
    };

    // Role güncelleme kontrolü
    const updateData: any = {
      ...(dto.name && { name: dto.name }),
      ...(dto.email && { email: dto.email }),
      ...(dto.password && { password_hash }),
      ...(dto.status && { status: dto.status }),
      ...(dto.role && { role: dto.role }),
      ...(dto.salary !== undefined && { salary: dto.salary }),
    };

    // Eğer status INACTIVE yapılıyorsa, refresh token'ları temizle
    if (
      dto.status === EmployeeStatus.INACTIVE &&
      employee.status !== EmployeeStatus.INACTIVE
    ) {
      await this.prisma.refreshToken.deleteMany({
        where: { employee_id: id },
      });
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        salary: true,
        updated_at: true,
      },
    });

    // ? Audit log ekle
    try {
      await this.prisma.auditLog.create({
        data: {
          company_id: companyId,
          employee_id: currentEmployeeId,
          action: AuditAction.EMPLOYEE_UPDATE,
          entity: 'Employee',
          entity_id: id,
          old_value: oldValues,
          new_value: updated,
        },
      });
    } catch (error) {
      console.error('Audit log oluşturulamadı:', error);
    }

    return updated;
  }

  private async checkUpdatePermissions(
    targetEmployee: any,
    currentEmployeeId: number,
    currentRole: Role,
    dto: UpdateEmployeeDto,
  ) {
    // Kendi hesabını güncelleme
    if (targetEmployee.id === currentEmployeeId) {
      // Kendi rolünü değiştiremez
      if (dto.role && dto.role !== targetEmployee.role) {
        throw new ForbiddenException('Kendi rolünüzü değiştiremezsiniz');
      }
      // Kendi status'ünü ACTIVE'den INACTIVE yapamaz (kilitlenme riski)
      if (
        dto.status === EmployeeStatus.INACTIVE &&
        targetEmployee.status === EmployeeStatus.ACTIVE
      ) {
        throw new ForbiddenException('Kendi hesabınızı pasifleştiremezsiniz');
      }
      return;
    }

    // Başkasını güncelleme yetkileri
    if (currentRole !== Role.ADMIN) {
      // Sadece ADMIN başka personeli güncelleyebilir
      throw new ForbiddenException(
        'Başka bir personeli güncelleme yetkiniz bulunmamaktadır',
      );
    }
  }

  async remove(
    companyId: number,
    id: number,
    currentEmployeeId: number,
    currentRole: Role,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, company_id: companyId, deleted_at: null },
    });

    if (!employee) {
      throw new NotFoundException('Personel bulunamadı');
    }

    // Kendini silemez
    if (employee.id === currentEmployeeId) {
      throw new ForbiddenException('Kendi hesabınızı silemezsiniz');
    }

    // Sadece ADMIN silebilir
    if (currentRole !== Role.ADMIN) {
      throw new ForbiddenException('Personel silme yetkiniz bulunmamaktadır');
    }

    // Soft delete: Önce refresh token'ları temizle
    await this.prisma.refreshToken.deleteMany({
      where: { employee_id: id },
    });

    const deleted = await this.prisma.employee.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    // ? Audit log ekle
    try {
      await this.prisma.auditLog.create({
        data: {
          company_id: companyId,
          employee_id: currentEmployeeId,
          action: AuditAction.EMPLOYEE_DELETE,
          entity: 'Employee',
          entity_id: id,
          old_value: employee,
        },
      });
    } catch (error) {
      console.error('Audit log oluşturulamadı:', error);
    }

    return deleted;
  }

  async updateLastLogin(employeeId: number) {
    return this.prisma.employee.update({
      where: { id: employeeId },
      data: { last_login_at: new Date() },
    });
  }

  async changePassword(
    companyId: number,
    employeeId: number,
    oldPassword: string,
    newPassword: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, company_id: companyId, deleted_at: null },
    });

    if (!employee) {
      throw new NotFoundException('Personel bulunamadı');
    }

    const isPasswordValid = await bcrypt.compare(
      oldPassword,
      employee.password_hash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Mevcut şifre yanlış');
    }

    const hashedPassword = await this.hashPassword(newPassword);

    return this.prisma.employee.update({
      where: { id: employeeId },
      data: { password_hash: hashedPassword },
    });
  }

  async getEmployeeActivities(
    companyId: number,
    employeeId: number,
    pagination: PaginationDto,
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          company_id: companyId,
          employee_id: employeeId,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.auditLog.count({
        where: {
          company_id: companyId,
          employee_id: employeeId,
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

  async getEmployeeSales(
    companyId: number,
    employeeId: number,
    pagination: PaginationDto,
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          company_id: companyId,
          employee_id: employeeId,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          customer: { select: { name: true } },
          items: {
            include: {
              bulkProduct: { select: { brand: true, model: true } },
              singleDevice: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.sale.count({
        where: {
          company_id: companyId,
          employee_id: employeeId,
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

  async getEmployeeBalance(employeeId: number): Promise<number> {
    const aggregate = await this.prisma.employeeLedger.aggregate({
      where: { employee_id: employeeId },
      _sum: { amount: true },
    });
    return Number(aggregate._sum.amount || 0);
  }

  async giveAdvance(
    companyId: number,
    employeeId: number,
    currentEmployeeId: number,
    dto: { amount: number; description?: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, company_id: companyId, deleted_at: null },
      });

      if (!employee) throw new NotFoundException('Personel bulunamadı');

      const amount = Math.abs(Number(dto.amount));

      // 1. Ledger kaydı oluştur (Negatif - Şirketten para çıktı, personel borçlandı)
      await tx.employeeLedger.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          type: LedgerType.ADVANCE,
          amount: -amount,
          description: dto.description || 'Personel Avansı',
        },
      });

      // 2. Bakiyeleri güncelle (Cached)
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          balance: { decrement: amount },
          advance_balance: { increment: amount },
        },
      });

      // 3. Kasa çıkışı
      const cashRegister = await tx.cashRegister.findUnique({
        where: { company_id: companyId },
      });
      if (!cashRegister) throw new BadRequestException('Kasa bulunamadı');

      await tx.cashRegister.update({
        where: { id: cashRegister.id },
        data: { balance: { decrement: amount } },
      });

      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: cashRegister.id,
          type: 'EXPENSE_OUT',
          amount: amount,
          description: `Personel Avansı: ${employee.name}`,
        },
      });

      // 4. Gider kaydı
      await tx.expense.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          title: `Personel Avansı: ${employee.name}`,
          amount: amount,
          category: 'AVANS',
          description: dto.description,
        },
      });

      return { message: 'Avans başarıyla verildi' };
    });
  }

  async makePayment(
    companyId: number,
    employeeId: number,
    currentEmployeeId: number,
    dto: any,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, company_id: companyId, deleted_at: null },
      });

      if (!employee) throw new NotFoundException('Personel bulunamadı');

      const amount = Number(dto.amount);

      // 1. Ledger kaydı oluştur (Negatif - Ödeme yapıldı, personelin alacağı azaldı)
      await tx.employeeLedger.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          type:
            dto.category === 'MAAŞ'
              ? LedgerType.SALARY_PAYMENT
              : LedgerType.EXPENSE,
          amount: -amount,
          description: dto.description || `${dto.category} ödemesi`,
        },
      });

      // 2. Bakiyeleri güncelle (Cached)
      const updateData: any = {
        balance: { decrement: amount },
      };

      if (dto.category === 'KOMİSYON') {
        if (Number(employee.commission_balance || 0) < amount) {
          throw new BadRequestException(
            `Yetersiz komisyon bakiyesi. Mevcut: ${employee.commission_balance} ₺`,
          );
        }
        updateData.commission_balance = { decrement: amount };
      }

      await tx.employee.update({
        where: { id: employeeId },
        data: updateData,
      });

      // 3. Kasa kontrolü ve güncelleme (Nakit çıkışı)
      const cashRegister = await tx.cashRegister.findUnique({
        where: { company_id: companyId },
      });
      if (!cashRegister) throw new BadRequestException('Kasa bulunamadı');

      await tx.cashRegister.update({
        where: { id: cashRegister.id },
        data: { balance: { decrement: amount } },
      });

      // 4. Gider kaydı oluştur
      await tx.expense.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          title: `${dto.category} Ödemesi: ${employee.name}`,
          amount: amount,
          category: dto.category,
          description: dto.description || `${dto.category} ödemesi`,
        },
      });

      // 5. Kasa hareketi
      await tx.cashTransaction.create({
        data: {
          company_id: companyId,
          cash_register_id: cashRegister.id,
          type: 'EXPENSE_OUT',
          amount: amount,
          description: `${dto.category} Ödemesi: ${employee.name}`,
        },
      });

      return { message: 'Ödeme başarıyla kaydedildi' };
    });
  }

  async accrueSalary(
    companyId: number,
    employeeId: number,
    currentEmployeeId: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, company_id: companyId, deleted_at: null },
      });

      if (!employee) throw new NotFoundException('Personel bulunamadı');
      if (Number(employee.salary) <= 0)
        throw new BadRequestException('Personel maaşı tanımlanmamış');

      const salaryAmount = Number(employee.salary);

      // 1. Ledger kaydı oluştur (Pozitif - Maaş hak edildi, şirketin personele borcu arttı)
      await tx.employeeLedger.create({
        data: {
          company_id: companyId,
          employee_id: employeeId,
          type: LedgerType.SALARY,
          amount: salaryAmount,
          description: `${new Date().toLocaleString('tr-TR', { month: 'long', year: 'numeric' })} Maaş Tahakkuku`,
        },
      });

      // 2. Bakiyeyi artır (Maaş hak edildi)
      await tx.employee.update({
        where: { id: employeeId },
        data: { balance: { increment: salaryAmount } },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          company_id: companyId,
          employee_id: currentEmployeeId,
          action: AuditAction.EMPLOYEE_UPDATE,
          entity: 'Employee',
          entity_id: employeeId,
          new_value: { action: 'SALARY_ACCRUAL', amount: salaryAmount },
        },
      });

      return {
        message: 'Maaş başarıyla tahakkuk ettirildi',
        amount: salaryAmount,
      };
    });
  }

  async getEmployeePayments(
    companyId: number,
    employeeId: number,
    pagination: PaginationDto,
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          company_id: companyId,
          employee_id: employeeId,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.expense.count({
        where: {
          company_id: companyId,
          employee_id: employeeId,
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

  // ==================== AUTOMATION ====================

  /**
   * Her ayın 1'inde gece yarısı tüm personellerin maaşlarını otomatik olarak tahakkuk ettirir.
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async handleMonthlySalaryAccrual() {
    this.logger.log('Aylık otomatik maaş tahakkuku başlatıldı...');

    const now = new Date();
    const monthName = now.toLocaleString('tr-TR', {
      month: 'long',
      year: 'numeric',
    });
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Tüm aktif ve maaşı olan personelleri getir
    const employees = await this.prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        deleted_at: null,
        salary: { gt: 0 },
      },
    });

    for (const employee of employees) {
      try {
        // İşe giriş tarihini belirle
        let employmentDate = employee.employment_date
          ? new Date(employee.employment_date)
          : null;

        // Eğer ayarlanmamışsa, kaydolduğu ayın 1'i olarak kabul et
        if (!employmentDate) {
          const createdAt = new Date(employee.created_at);
          employmentDate = new Date(
            createdAt.getFullYear(),
            createdAt.getMonth(),
            1,
          );
          this.logger.warn(
            `${employee.name} için işe giriş tarihi ayarlanmamış, ${employmentDate.toLocaleDateString()} (kayıt ayı başı) olarak kabul ediliyor.`,
          );
        }

        const oneMonthAfter = new Date(employmentDate);
        oneMonthAfter.setMonth(oneMonthAfter.getMonth() + 1);

        if (now < oneMonthAfter) {
          this.logger.log(
            `${employee.name} henüz 1 ayını doldurmadı (Giriş: ${employmentDate.toLocaleDateString()}), maaş tahakkuku atlanıyor.`,
          );
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          // Bu ay için zaten tahakkuk yapılmış mı kontrol et
          const existing = await tx.employeeLedger.findFirst({
            where: {
              employee_id: employee.id,
              type: LedgerType.SALARY,
              created_at: { gte: startOfMonth },
            },
          });

          if (existing) {
            this.logger.warn(
              `${employee.name} için ${monthName} maaşı zaten tahakkuk ettirilmiş, atlanıyor.`,
            );
            return;
          }

          const salaryAmount = Number(employee.salary);

          // 1. Ledger kaydı (Alacak artışı)
          await tx.employeeLedger.create({
            data: {
              company_id: employee.company_id,
              employee_id: employee.id,
              type: LedgerType.SALARY,
              amount: salaryAmount,
              description: `${monthName} Maaş Tahakkuku (Otomatik)`,
            },
          });

          // 2. Bakiyeyi güncelle
          await tx.employee.update({
            where: { id: employee.id },
            data: { balance: { increment: salaryAmount } },
          });

          this.logger.log(
            `${employee.name} için ${salaryAmount} ₺ maaş tahakkuk ettirildi.`,
          );
        });
      } catch (error) {
        this.logger.error(
          `${employee.name} için maaş tahakkuku sırasında hata: ${error.message}`,
        );
      }
    }

    this.logger.log('Aylık otomatik maaş tahakkuku tamamlandı.');
  }
}
