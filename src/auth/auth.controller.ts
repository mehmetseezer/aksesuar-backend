import {
  Controller,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Res,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Public } from './decorators/public.decorator';
import { CompanyId } from './decorators/company.decorator';
import { CurrentUser } from './decorators/user.decorator';
import { Roles } from './decorators/roles.decorator';
import { Response, Request as ExpressRequest } from 'express';
import { Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Yeni kullanıcı kaydı ve/veya şirket oluşturma' })
  @ApiResponse({ status: 201, description: 'Kayıt başarılı' })
  @ApiResponse({ status: 409, description: 'Email zaten kayıtlı' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kullanıcı girişi' })
  @ApiResponse({
    status: 200,
    description: 'Giriş başarılı, access token döner',
  })
  @ApiResponse({ status: 401, description: 'Geçersiz kimlik bilgileri' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(loginDto, response);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Access token yenileme' })
  @ApiResponse({ status: 200, description: 'Yeni access token döner' })
  @ApiResponse({ status: 401, description: 'Geçersiz refresh token' })
  async refresh(
    @Req() request: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies['refreshToken'];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token bulunamadı');
    }
    return this.authService.refreshTokens(refreshToken, response);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Çıkış yap' })
  @ApiResponse({ status: 200, description: 'Çıkış başarılı' })
  async logout(
    @Req() request: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() currentUser: any, // ✅ Giriş yapmış personel bilgisi
  ) {
    const refreshToken = request.cookies['refreshToken'];
    return this.authService.logout(
      refreshToken,
      response,
      currentUser?.id,
      currentUser?.company_id,
    );
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Giriş yapmış kullanıcının profil bilgileri' })
  @ApiResponse({ status: 200, description: 'Profil bilgileri' })
  async getProfile(@CurrentUser() user: any, @CompanyId() companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { usd_rate: true },
    });

    return {
      ...user,
      companyId,
      usd_rate: company?.usd_rate ? Number(company.usd_rate) : 0,
    };
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Sadece ADMIN yetkisi olanların erişebileceği örnek endpoint',
  })
  adminOnly(@CurrentUser() user: any) {
    return {
      message: 'Sadece adminler burayı görebilir',
      user,
    };
  }

  @Patch('company/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Firma ayarlarını güncelle (Örn: USD kuru)' })
  async updateCompanySettings(
    @CompanyId() companyId: number,
    @Body() body: { usd_rate?: number },
  ) {
    console.log('Update settings request:', { companyId, body });
    const data: any = {};
    if (body.usd_rate !== undefined) {
      data.usd_rate = body.usd_rate;
    }

    const company = await this.prisma.company.update({
      where: { id: companyId },
      data,
      select: { usd_rate: true },
    });

    return {
      message: 'Ayarlar güncellendi',
      usd_rate: company.usd_rate ? Number(company.usd_rate) : 0,
    };
  }
}
