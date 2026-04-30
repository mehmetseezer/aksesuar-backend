import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role, AuditAction, EmployeeStatus } from '@prisma/client';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string, subdomain?: string) {
    let user;

    if (subdomain) {
      const company = await this.prisma.company.findUnique({
        where: { subdomain },
      });
      if (!company) return null;

      user = await this.prisma.employee.findFirst({
        where: { email, company_id: company.id },
        include: { company: true },
      });
    } else {
      // Global search by email
      user = await this.prisma.employee.findFirst({
        where: { email },
        include: { company: true },
        orderBy: { last_login_at: 'desc' }, // Birden fazla varsa en son gireni al
      });
    }

    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return null;

    const { password_hash, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto, response?: Response) {
    const user = await this.validateUser(
      loginDto.email,
      loginDto.password,
      loginDto.subdomain,
    );

    if (!user) {
      throw new UnauthorizedException('Geçersiz email, şifre veya şirket');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      company_id: user.company_id,
      subdomain: user.company.subdomain,
      company_name: user.company.name,
      role: user.role,
      name: user.name,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        employee_id: user.id,
        expires_at: expiresAt,
      },
    });

    if (response) {
      response.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    // Son login tarihini güncelle
    await this.prisma.employee.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    // LOGIN audit log
    try {
      await this.prisma.auditLog.create({
        data: {
          company_id: user.company_id,
          employee_id: user.id,
          action: AuditAction.LOGIN,
          entity: 'Employee',
          entity_id: user.id,
        },
      });
    } catch (error) {
      console.error('Audit log oluşturulamadı:', error);
    }

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        subdomain: user.company.subdomain,
        company_name: user.company.name,
      },
    };
  }

  async refreshTokens(refreshToken: string, response?: Response) {
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { employee: { include: { company: true } } },
    });

    if (!tokenRecord || tokenRecord.expires_at < new Date()) {
      throw new UnauthorizedException(
        'Geçersiz veya süresi dolmuş refresh token',
      );
    }

    const user = tokenRecord.employee;

    const payload = {
      sub: user.id,
      email: user.email,
      company_id: user.company_id,
      subdomain: user.company.subdomain,
      company_name: user.company.name,
      role: user.role,
      name: user.name,
    };
    const newAccessToken = this.jwtService.sign(payload);

    const newRefreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.$transaction([
      this.prisma.refreshToken.delete({ where: { id: tokenRecord.id } }),
      this.prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          employee_id: user.id,
          expires_at: expiresAt,
        },
      }),
    ]);

    if (response) {
      response.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    return {
      access_token: newAccessToken,
    };
  }

  async logout(
    refreshToken: string,
    response?: Response,
    employeeId?: number,
    companyId?: number,
  ) {
    // Önce token'ı bulalım ki employee_id'yi alabilelim (eğer parametre olarak gelmediyse)
    let employeeIdForLog = employeeId;
    let companyIdForLog = companyId;

    if (!employeeIdForLog && refreshToken) {
      const tokenRecord = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        select: {
          employee_id: true,
          employee: { select: { company_id: true } },
        },
      });
      if (tokenRecord) {
        employeeIdForLog = tokenRecord.employee_id;
        companyIdForLog = tokenRecord.employee.company_id;
      }
    }

    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    // LOGOUT audit log
    if (employeeIdForLog && companyIdForLog) {
      try {
        await this.prisma.auditLog.create({
          data: {
            company_id: companyIdForLog,
            employee_id: employeeIdForLog,
            action: AuditAction.LOGOUT,
            entity: 'Employee',
            entity_id: employeeIdForLog,
          },
        });
      } catch (error) {
        console.error('Audit log oluşturulamadı:', error);
      }
    }

    if (response) {
      response.clearCookie('refreshToken', { path: '/' });
    }
    return { message: 'Çıkış başarılı' };
  }

  async register(registerDto: RegisterDto) {
    const { email, name, password, role, subdomain, companyName } = registerDto;

    let company;

    if (subdomain) {
      company = await this.prisma.company.findUnique({
        where: { subdomain },
      });
      if (!company) {
        throw new BadRequestException('Geçersiz şirket alt alan adı');
      }
    } else if (companyName) {
      const generatedSubdomain = companyName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      const existing = await this.prisma.company.findUnique({
        where: { subdomain: generatedSubdomain },
      });
      if (existing) {
        throw new ConflictException('Bu şirket adı zaten kullanımda');
      }

      company = await this.prisma.company.create({
        data: {
          name: companyName,
          subdomain: generatedSubdomain,
        },
      });

      if (role !== Role.ADMIN) {
        throw new BadRequestException(
          'Yeni şirket oluştururken rol ADMIN olmalıdır',
        );
      }
    } else {
      throw new BadRequestException(
        'Şirket alt alan adı veya şirket adı belirtmelisiniz',
      );
    }

    const existingUser = await this.prisma.employee.findFirst({
      where: { email, company_id: company.id },
    });
    if (existingUser) {
      throw new ConflictException('Bu email bu şirkette zaten kayıtlı');
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = await this.prisma.employee.create({
      data: {
        email,
        name,
        password_hash: hashed,
        role,
        status: EmployeeStatus.ACTIVE,
        company_id: company.id,
      },
      include: { company: true },
    });

    const { password_hash, ...result } = newUser;

    // REGISTER audit log
    try {
      await this.prisma.auditLog.create({
        data: {
          company_id: newUser.company_id,
          employee_id: newUser.id,
          action: AuditAction.REGISTER,
          entity: 'Employee',
          entity_id: newUser.id,
        },
      });
    } catch (error) {
      console.error('Audit log oluşturulamadı:', error);
    }

    return result;
  }

  async getUserFromToken(userId: number) {
    return this.prisma.employee.findUnique({
      where: { id: userId },
      include: { company: true },
    });
  }
}
