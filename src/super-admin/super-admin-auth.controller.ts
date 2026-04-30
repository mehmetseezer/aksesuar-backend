import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { Response, Request } from 'express';
import { SuperAdminJwtAuthGuard } from './guards/super-admin-jwt.guard';

@Controller('super-admin/auth')
export class SuperAdminAuthController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    return this.superAdminService.login(body, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    return this.superAdminService.logout(res);
  }

  @Get('profile')
  @UseGuards(SuperAdminJwtAuthGuard)
  getProfile(@Req() req: any) {
    return req.user;
  }
}
