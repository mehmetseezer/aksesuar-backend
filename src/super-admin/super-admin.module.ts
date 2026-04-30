import { Module } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminAuthController } from './super-admin-auth.controller';
import { SuperAdminCompanyController } from './super-admin-company.controller';
import { SuperAdminPackageController } from './super-admin-package.controller';
import { SuperAdminGlobalController } from './super-admin-global.controller';
import { SuperAdminAnnouncementController } from './super-admin-announcement.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SuperAdminJwtStrategy } from './strategies/super-admin-jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    SuperAdminAuthController,
    SuperAdminCompanyController,
    SuperAdminPackageController,
    SuperAdminGlobalController,
    SuperAdminAnnouncementController,
  ],
  providers: [SuperAdminService, SuperAdminJwtStrategy],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
