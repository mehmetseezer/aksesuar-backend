// src/employee/employee.controller.ts
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
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GiveAdvanceDto, MakePaymentDto } from './dto/financial-actions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompanyId } from '../auth/decorators/company.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { Role, EmployeeStatus } from '@prisma/client';

@ApiTags('employees')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Yeni personel oluştur' })
  @ApiResponse({ status: 201, description: 'Personel başarıyla oluşturuldu' })
  @ApiResponse({ status: 409, description: 'E-posta adresi zaten kayıtlı' })
  @ApiResponse({
    status: 403,
    description: 'Bu işlem için yetkiniz bulunmamaktadır',
  })
  create(
    @CompanyId() companyId: number,
    @Body() createEmployeeDto: CreateEmployeeDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.employeeService.create(
      companyId,
      createEmployeeDto,
      currentUser.role,
      currentUser.id,
    );
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Tüm personelleri listele (sayfalama)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'role', required: false, enum: Role })
  @ApiQuery({ name: 'status', required: false, enum: EmployeeStatus })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(@CompanyId() companyId: number, @Query() query: EmployeeQueryDto) {
    const { role, status, search, ...pagination } = query;
    return this.employeeService.findAll(companyId, pagination, {
      role,
      status,
      search,
    });
  }

  @Get('me')
  @ApiOperation({ summary: 'Kendi profil bilgilerimi getir' })
  @ApiResponse({
    status: 200,
    description: 'Profil bilgileri başarıyla getirildi',
  })
  async getMyProfile(@CurrentUser() currentUser: any) {
    return currentUser;
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'ID ile personel getir' })
  @ApiResponse({ status: 404, description: 'Personel bulunamadı' })
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Personel bilgilerini güncelle' })
  @ApiResponse({ status: 200, description: 'Güncelleme başarılı' })
  @ApiResponse({ status: 404, description: 'Personel bulunamadı' })
  @ApiResponse({ status: 409, description: 'E-posta adresi çakışması' })
  @ApiResponse({
    status: 403,
    description: 'Bu işlem için yetkiniz bulunmamaktadır',
  })
  update(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.employeeService.update(
      companyId,
      id,
      updateEmployeeDto,
      currentUser.id,
      currentUser.role,
    );
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Kendi şifremi değiştir' })
  @ApiResponse({ status: 200, description: 'Şifre başarıyla değiştirildi' })
  @ApiResponse({ status: 400, description: 'Mevcut şifre yanlış' })
  changeMyPassword(
    @CompanyId() companyId: number,
    @CurrentUser() currentUser: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.employeeService.changePassword(
      companyId,
      currentUser.id,
      changePasswordDto.oldPassword,
      changePasswordDto.newPassword,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Personeli sil (soft delete) - Sadece Admin' })
  @ApiResponse({ status: 204, description: 'Silme başarılı' })
  @ApiResponse({
    status: 403,
    description: 'Bu işlem için yetkiniz bulunmamaktadır',
  })
  @ApiResponse({ status: 404, description: 'Personel bulunamadı' })
  async remove(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: any,
  ) {
    await this.employeeService.remove(
      companyId,
      id,
      currentUser.id,
      currentUser.role,
    );
  }

  @Get(':id/activities')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Personel aktivite geçmişini getir' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getActivities(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.employeeService.getEmployeeActivities(
      companyId,
      id,
      pagination,
    );
  }

  @Get(':id/sales')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Personel satış geçmişini getir' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getSales(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.employeeService.getEmployeeSales(companyId, id, pagination);
  }

  @Get(':id/payments')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Personel ödeme geçmişini getir' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getPayments(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.employeeService.getEmployeePayments(companyId, id, pagination);
  }

  @Post(':id/payment')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Personele ödeme yap (Maaş/Komisyon)' })
  makePayment(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MakePaymentDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.employeeService.makePayment(companyId, id, currentUser.id, dto);
  }

  @Post(':id/accrue-salary')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Personele maaş tahakkuk et' })
  async accrueSalary(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: any,
  ) {
    return this.employeeService.accrueSalary(companyId, id, currentUser.id);
  }

  @Post(':id/advance')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Personele avans ver' })
  async giveAdvance(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GiveAdvanceDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.employeeService.giveAdvance(companyId, id, currentUser.id, dto);
  }
}
