// src/auth/strategies/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: any) {
    // Token içinde zaten company_id ve subdomain var, ekstra sorgu yapmaya gerek yok
    // Ancak kullanıcının hala var olduğunu doğrulayalım
    const user = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
      include: { company: true },
    });

    if (!user) {
      throw new UnauthorizedException('Kullanıcı artık mevcut değil');
    }

    const company = user.company;
    if (!company) {
      throw new UnauthorizedException('Kullanıcının şirketi bulunamadı');
    }

    if (!company.is_active) {
      throw new UnauthorizedException(
        'Şirket hesabı aktif değil. Lütfen yöneticiyle iletişime geçin.',
      );
    }

    if (
      company.subscription_ends_at &&
      new Date() > company.subscription_ends_at
    ) {
      throw new UnauthorizedException(
        'Şirket abonelik süresi dolmuştur. Lütfen aboneliğinizi yenileyin.',
      );
    }

    return {
      userId: payload.sub,
      id: payload.sub,
      email: payload.email,
      companyId: payload.company_id,
      subdomain: payload.subdomain,
      company_name: company.name,
      role: payload.role,
      name: payload.name || user.name,
      is_impersonated: !!payload.is_impersonated,
    };
  }
}
