import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { SupplierService } from './supplier.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompanyId } from '../auth/decorators/company.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { Role } from '@prisma/client';

@ApiTags('suppliers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni tedarikçi oluştur' })
  @ApiResponse({ status: 201, description: 'Tedarikçi oluşturuldu' })
  @ApiResponse({ status: 409, description: 'Bu isimde tedarikçi zaten var' })
  create(@CompanyId() companyId: number, @Body() dto: CreateSupplierDto) {
    return this.supplierService.create(companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tüm tedarikçileri listele (sayfalama)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(@CompanyId() companyId: number, @Query() query: SupplierQueryDto) {
    const { search, ...pagination } = query;
    return this.supplierService.findAll(companyId, pagination, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID ile tedarikçi getir' })
  @ApiResponse({ status: 404, description: 'Tedarikçi bulunamadı' })
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.supplierService.findOne(companyId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Tedarikçi bilgilerini güncelle' })
  @ApiResponse({ status: 200, description: 'Güncelleme başarılı' })
  @ApiResponse({ status: 404, description: 'Tedarikçi bulunamadı' })
  @ApiResponse({ status: 409, description: 'İsim çakışması' })
  update(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.supplierService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tedarikçiyi sil (soft delete) - Sadece Admin' })
  @ApiResponse({ status: 204, description: 'Silme başarılı' })
  @ApiResponse({
    status: 403,
    description: 'Bu işlem için yetkiniz bulunmamaktadır',
  })
  @ApiResponse({ status: 404, description: 'Tedarikçi bulunamadı' })
  async remove(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.supplierService.remove(companyId, id);
  }

  @Post(':id/pay')
  @ApiOperation({
    summary: 'Tedarikçiye ödeme yap (Borç düşür, kasadan çıkış yap)',
  })
  @ApiResponse({ status: 201, description: 'Ödeme başarılı' })
  @ApiResponse({
    status: 400,
    description: 'Geçersiz tutar veya bakiye yetersiz',
  })
  @ApiResponse({ status: 404, description: 'Tedarikçi bulunamadı' })
  pay(
    @CompanyId() companyId: number,
    @CurrentUser('id') employeeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('amount') amount: number,
    @Body('currency') currency: 'TL' | 'USD' = 'TL',
    @Body('description') description?: string,
  ) {
    return this.supplierService.paySupplier(
      companyId,
      id,
      amount,
      employeeId,
      currency,
      description,
    );
  }
}
