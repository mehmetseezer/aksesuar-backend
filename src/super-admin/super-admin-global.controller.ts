import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminJwtAuthGuard } from './guards/super-admin-jwt.guard';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('super-admin/global')
@UseGuards(SuperAdminJwtAuthGuard)
export class SuperAdminGlobalController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('transactions')
  getTransactions(@Query() pagination: PaginationDto) {
    return this.superAdminService.getGlobalTransactions(pagination, pagination.type);
  }

  @Get('products')
  getProducts(@Query() pagination: PaginationDto) {
    return this.superAdminService.getGlobalProducts(pagination);
  }

  @Get('devices')
  getDevices(@Query() pagination: PaginationDto) {
    return this.superAdminService.getGlobalDevices(pagination);
  }

  @Get('audit-logs')
  getAuditLogs(@Query() pagination: PaginationDto) {
    return this.superAdminService.getGlobalAuditLogs(pagination);
  }
}
