import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Role, EmployeeStatus } from '@prisma/client';

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ==============================
  // AUTHENTICATION
  // ==============================
  async login(loginDto: any, response: Response) {
    const admin = await this.prisma.systemAdmin.findUnique({
      where: { email: loginDto.email },
    });

    if (!admin) {
      throw new UnauthorizedException('Geçersiz kimlik bilgileri');
    }

    const isMatch = await bcrypt.compare(
      loginDto.password,
      admin.password_hash,
    );
    if (!isMatch) {
      throw new UnauthorizedException('Geçersiz kimlik bilgileri');
    }

    const payload = { sub: admin.id, email: admin.email, isSuperAdmin: true };
    const token = this.jwtService.sign(payload);

    response.cookie('superAdminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      message: 'Giriş başarılı',
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      },
    };
  }

  async logout(response: Response) {
    response.clearCookie('superAdminToken');
    return { message: 'Çıkış başarılı' };
  }

  // ==============================
  // COMPANIES (TENANTS)
  // ==============================
  async getCompanies(pagination: PaginationDto, search?: string) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { deleted_at: null };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { subdomain: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: {
          package: true,
          _count: {
            select: {
              employees: true,
              bulkProducts: true,
              singleDevices: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.company.count({ where }),
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

  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // Space'leri - yap
      .replace(/[^\w\-]+/g, '') // Alfanümerik olmayanları kaldır
      .replace(/\-\-+/g, '-'); // Çift -'leri tek yap
  }

  async createCompany(data: any) {
    const subdomain =
      data.subdomain || this.slugify(data.name) || `comp-${Date.now()}`;

    // Check if subdomain exists
    const existing = await this.prisma.company.findUnique({
      where: { subdomain },
    });
    if (existing) {
      // Eğer otomatik üretilen varsa sonuna rastgele ekle
      data.subdomain = `${subdomain}-${Math.floor(Math.random() * 1000)}`;
    } else {
      data.subdomain = subdomain;
    }

    const company = await this.prisma.company.create({
      data: {
        name: data.name,
        subdomain: data.subdomain,
        package_id: data.package_id || null,
        subscription_ends_at: data.subscription_ends_at
          ? new Date(data.subscription_ends_at)
          : null,
        is_active: data.is_active ?? true,
      },
    });

    // Create default admin if email/password provided, or just create a placeholder
    const adminEmail = data.admin_email || `admin@${data.subdomain}.com`;
    const adminPassword = data.admin_password || '123456'; // Default password if not provided
    const adminName = data.admin_name || 'Şirket Yöneticisi';

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await this.prisma.employee.create({
      data: {
        email: adminEmail,
        password_hash: hashedPassword,
        name: adminName,
        role: Role.ADMIN,
        status: EmployeeStatus.ACTIVE,
        company_id: company.id,
      },
    });

    return company;
  }

  async updateCompany(id: number, data: any) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new BadRequestException('Şirket bulunamadı');

    // Subdomain'i manuel olarak veya isme göre güncelle
    const newSubdomain =
      data.subdomain ||
      (data.name ? this.slugify(data.name) : company.subdomain);

    // Eğer subdomain değişmişse benzersizlik kontrolü yap
    if (newSubdomain !== company.subdomain) {
      const existing = await this.prisma.company.findUnique({
        where: { subdomain: newSubdomain },
      });
      if (existing) {
        throw new BadRequestException(
          'Bu subdomain zaten başka bir şirket tarafından kullanılıyor',
        );
      }
    }

    return this.prisma.company.update({
      where: { id },
      data: {
        name: data.name,
        subdomain: newSubdomain,
        package_id: data.package_id,
        subscription_ends_at: data.subscription_ends_at
          ? new Date(data.subscription_ends_at)
          : null,
        is_active: data.is_active,
      },
    });
  }

  async toggleCompanyStatus(id: number) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new BadRequestException('Şirket bulunamadı');

    return this.prisma.company.update({
      where: { id },
      data: { is_active: !company.is_active },
    });
  }

  async deleteCompany(id: number) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new BadRequestException('Şirket bulunamadı');

    return this.prisma.company.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });
  }

  // ==============================
  // PACKAGES
  // ==============================
  async getPackages(pagination: PaginationDto, search?: string) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.name = { contains: search };
    }

    const [data, total] = await Promise.all([
      this.prisma.package.findMany({
        where,
        orderBy: { price: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.package.count({ where }),
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

  async createPackage(data: any) {
    return this.prisma.package.create({
      data: {
        name: data.name,
        price: data.price,
        max_employees: data.max_employees,
        max_products: data.max_products,
        features: data.features || null,
        is_active: data.is_active ?? true,
      },
    });
  }

  async updatePackage(id: number, data: any) {
    return this.prisma.package.update({
      where: { id },
      data: {
        name: data.name,
        price: data.price,
        max_employees: data.max_employees,
        max_products: data.max_products,
        features: data.features,
        is_active: data.is_active,
      },
    });
  }

  // ==============================
  // DASHBOARD STATS
  // ==============================
  async getDashboardStats() {
    const totalCompanies = await this.prisma.company.count({
      where: { deleted_at: null },
    });
    const activeCompanies = await this.prisma.company.count({
      where: { is_active: true, deleted_at: null },
    });
    const packagesCount = await this.prisma.package.count();

    // Monthly recurring revenue
    const activeWithPackages = await this.prisma.company.findMany({
      where: { is_active: true, package_id: { not: null }, deleted_at: null },
      include: { package: true },
    });

    const mrr = activeWithPackages.reduce((acc, comp) => {
      return acc + (comp.package ? Number(comp.package.price) : 0);
    }, 0);

    // Package distribution for chart
    const packageStats = await this.prisma.package.findMany({
      include: { 
        _count: { 
          select: { 
            companies: { where: { deleted_at: null } } 
          } 
        } 
      },
    });

    const packageDistribution = packageStats.map((p) => ({
      name: p.name,
      value: p._count.companies,
    }));

    // Growth data (last 6 months) - Simplified grouping
    const companies = await this.prisma.company.findMany({
      where: { deleted_at: null },
      select: { created_at: true },
    });

    const months = [
      'Oca',
      'Şub',
      'Mar',
      'Nis',
      'May',
      'Haz',
      'Tem',
      'Ağu',
      'Eyl',
      'Eki',
      'Kas',
      'Ara',
    ];
    const growthData = months
      .map((month, index) => {
        const count = companies.filter(
          (c) => new Date(c.created_at).getMonth() === index,
        ).length;
        return { month, count };
      })
      .slice(0, new Date().getMonth() + 1);

    return {
      totalCompanies,
      activeCompanies,
      totalPackages: packagesCount,
      mrr,
      packageDistribution,
      growthData,
    };
  }

  // ==============================
  // GLOBAL VIEWS (Omniscient View)
  // ==============================
  async getGlobalTransactions(pagination: PaginationDto, type?: string) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [sales, purchases, returns] = await Promise.all([
      this.prisma.sale.findMany({
        include: { company: true, employee: true },
        orderBy: { created_at: 'desc' },
        skip: type === 'sale' || !type ? skip : 0,
        take: type === 'sale' || !type ? limit : 0,
      }),
      this.prisma.purchase.findMany({
        include: { company: true, employee: true },
        orderBy: { created_at: 'desc' },
        skip: type === 'purchase' || !type ? skip : 0,
        take: type === 'purchase' || !type ? limit : 0,
      }),
      this.prisma.return.findMany({
        include: { company: true, employee: true },
        orderBy: { created_at: 'desc' },
        skip: type === 'return' || !type ? skip : 0,
        take: type === 'return' || !type ? limit : 0,
      }),
    ]);

    // Format and unify
    let all: any[] = [];
    if (!type || type === 'sale') {
      all = [...all, ...sales.map(s => ({ ...s, tx_type: 'SATIS' }))];
    }
    if (!type || type === 'purchase') {
      all = [...all, ...purchases.map(p => ({ ...p, tx_type: 'ALIS' }))];
    }
    if (!type || type === 'return') {
      all = [...all, ...returns.map(r => ({ ...r, tx_type: 'IADE' }))];
    }

    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const data = all.slice(0, limit);

    // Calculate actual total
    const [salesCount, purchasesCount, returnsCount] = await Promise.all([
      this.prisma.sale.count(),
      this.prisma.purchase.count(),
      this.prisma.return.count(),
    ]);

    let total = 0;
    if (!type || type === 'sale') total += salesCount;
    if (!type || type === 'purchase') total += purchasesCount;
    if (!type || type === 'return') total += returnsCount;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  async getGlobalProducts(pagination: PaginationDto) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.bulkProduct.findMany({
        include: { company: true },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.bulkProduct.count(),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getGlobalDevices(pagination: PaginationDto) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.singleDevice.findMany({
        include: { company: true },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.singleDevice.count(),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getGlobalAuditLogs(pagination: PaginationDto) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        include: { company: true, employee: true },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async impersonateCompany(id: number) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        employees: {
          where: { role: 'ADMIN', deleted_at: null },
          take: 1,
        }
      }
    });

    if (!company) throw new NotFoundException('Şirket bulunamadı');
    
    // Use the first active admin, or any employee if no admin found
    let targetEmployee = company.employees[0];
    if (!targetEmployee) {
      targetEmployee = await this.prisma.employee.findFirst({
        where: { company_id: id, deleted_at: null }
      });
    }

    if (!targetEmployee) throw new NotFoundException('Şirkette aktif personel bulunamadı');

    const payload = {
      sub: targetEmployee.id,
      email: targetEmployee.email,
      company_id: company.id,
      subdomain: company.subdomain,
      company_name: company.name,
      role: targetEmployee.role,
      name: targetEmployee.name,
      is_impersonated: true, // Mark this token as impersonated
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      subdomain: company.subdomain,
      redirect_url: `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${company.subdomain}.localhost:3000/impersonate?token=${accessToken}`,
    };
  }

  // ==============================
  // ANNOUNCEMENTS
  // ==============================
  async getAnnouncements() {
    return this.prisma.systemAnnouncement.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async getActiveAnnouncements() {
    return this.prisma.systemAnnouncement.findMany({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async createAnnouncement(data: any) {
    return this.prisma.systemAnnouncement.create({
      data: {
        title: data.title,
        content: data.content,
        is_active: data.is_active ?? true,
      },
    });
  }

  async updateAnnouncement(id: number, data: any) {
    return this.prisma.systemAnnouncement.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        is_active: data.is_active,
      },
    });
  }

  async deleteAnnouncement(id: number) {
    return this.prisma.systemAnnouncement.delete({
      where: { id },
    });
  }
}
