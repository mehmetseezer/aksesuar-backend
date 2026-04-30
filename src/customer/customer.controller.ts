// src/customer/customer.controller.ts
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
import { PaginationDto } from '../common/dto/pagination.dto';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompanyId } from '../auth/decorators/company.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { Role, Employee } from '@prisma/client';

@ApiTags('customers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni müşteri oluştur' })
  @ApiResponse({ status: 201, description: 'Müşteri başarıyla oluşturuldu' })
  @ApiResponse({ status: 409, description: 'Telefon numarası zaten kayıtlı' })
  create(
    @CompanyId() companyId: number,
    @Body() createCustomerDto: CreateCustomerDto,
  ) {
    return this.customerService.create(companyId, createCustomerDto);
  }

  @Get()
  @ApiOperation({ summary: 'Tüm müşterileri listele (sayfalama)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(@CompanyId() companyId: number, @Query() query: CustomerQueryDto) {
    const { search, ...pagination } = query;
    return this.customerService.findAll(companyId, pagination, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID ile müşteri getir' })
  @ApiResponse({ status: 404, description: 'Müşteri bulunamadı' })
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.customerService.findOne(companyId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Müşteri bilgilerini güncelle' })
  @ApiResponse({ status: 200, description: 'Güncelleme başarılı' })
  @ApiResponse({ status: 404, description: 'Müşteri bulunamadı' })
  @ApiResponse({ status: 409, description: 'Telefon numarası çakışması' })
  update(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ) {
    return this.customerService.update(companyId, id, updateCustomerDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Müşteriyi sil (soft delete) - Sadece Admin' })
  @ApiResponse({ status: 204, description: 'Silme başarılı' })
  @ApiResponse({
    status: 403,
    description: 'Bu işlem için yetkiniz bulunmamaktadır',
  })
  @ApiResponse({ status: 404, description: 'Müşteri bulunamadı' })
  async remove(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.customerService.remove(companyId, id);
  }

  @Post(':id/pay-customer')
  @ApiOperation({ summary: 'Müşteriye ödeme yap (Borç ödeme)' })
  pay(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('amount') amount: number,
    @Body('description') description: string,
    @CurrentUser() employee: Employee,
  ) {
    return this.customerService.payCustomer(
      companyId,
      id,
      amount,
      employee.id,
      description,
    );
  }

  @Post(':id/receive-payment')
  @ApiOperation({ summary: 'Müşteriden tahsilat yap' })
  receive(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('amount') amount: number,
    @Body('description') description: string,
    @CurrentUser() employee: Employee,
  ) {
    return this.customerService.receivePayment(
      companyId,
      id,
      amount,
      employee.id,
      description,
    );
  }

  @Get(':id/sales')
  @ApiOperation({ summary: 'Müşterinin satış geçmişini getir' })
  findSales(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.customerService.findSales(companyId, id, pagination);
  }

  @Get(':id/purchases')
  @ApiOperation({ summary: 'Müşterinin alım geçmişini getir' })
  findPurchases(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.customerService.findPurchases(companyId, id, pagination);
  }

  @Get(':id/trades')
  @ApiOperation({ summary: 'Müşterinin takas geçmişini getir' })
  findTrades(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.customerService.findTrades(companyId, id, pagination);
  }

  @Get(':id/returns')
  @ApiOperation({ summary: 'Müşterinin iade geçmişini getir' })
  findReturns(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.customerService.findReturns(companyId, id, pagination);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'Müşterinin ödeme/tahsilat geçmişini getir' })
  findPayments(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.customerService.findPayments(companyId, id, pagination);
  }
}
