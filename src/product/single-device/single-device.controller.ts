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
import { SingleDeviceService } from './single-device.service';
import { CreateSingleDeviceDto } from './dto/create-single-device.dto';
import { UpdateSingleDeviceDto } from './dto/update-single-device.dto';
import { SingleDeviceQueryDto } from './dto/single-device-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CompanyId } from '../../auth/decorators/company.decorator';
import { Role, DeviceStatus } from '@prisma/client';

@ApiTags('products')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('single-devices')
export class SingleDeviceController {
  constructor(private readonly singleDeviceService: SingleDeviceService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Yeni tekil cihaz ekle (Admin/Manager)' })
  @ApiResponse({ status: 201, description: 'Ürün oluşturuldu' })
  @ApiResponse({ status: 409, description: 'IMEI zaten kayıtlı' })
  create(@CompanyId() companyId: number, @Body() dto: CreateSingleDeviceDto) {
    return this.singleDeviceService.create(companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tüm tekil cihazları listele (sayfalama)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'status', enum: DeviceStatus, required: false })
  findAll(
    @CompanyId() companyId: number,
    @Query() query: SingleDeviceQueryDto,
  ) {
    if (query.status) {
      return this.singleDeviceService.findByStatus(
        companyId,
        query.status,
        query,
        query.search,
      );
    }
    return this.singleDeviceService.findAll(companyId, query, query.search);
  }

  @Get(':id/commercial-history')
  @ApiOperation({ summary: 'Cihazın ticari işlem geçmişini getir (sayfalama)' })
  getCommercialHistory(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SingleDeviceQueryDto,
  ) {
    return this.singleDeviceService.getCommercialHistory(companyId, id, query);
  }

  @Get(':id/stock-movements')
  @ApiOperation({ summary: 'Cihazın stok hareketlerini getir (sayfalama)' })
  getStockMovements(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SingleDeviceQueryDto,
  ) {
    return this.singleDeviceService.getStockMovements(companyId, id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID ile tekil cihaz getir' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.singleDeviceService.findOne(companyId, id);
  }

  @Get('imei/:imei')
  @ApiOperation({ summary: 'IMEI ile tekil cihaz getir' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  findByImei(@CompanyId() companyId: number, @Param('imei') imei: string) {
    return this.singleDeviceService.findByImei(companyId, imei);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Tekil cihaz bilgilerini güncelle (Admin/Manager)' })
  @ApiResponse({ status: 200, description: 'Güncelleme başarılı' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  @ApiResponse({ status: 409, description: 'IMEI çakışması' })
  update(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSingleDeviceDto,
  ) {
    return this.singleDeviceService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tekil cihazı sil (soft delete) - Sadece Admin' })
  @ApiResponse({ status: 204, description: 'Silme başarılı' })
  @ApiResponse({ status: 403, description: 'Yetkisiz erişim' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  async remove(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.singleDeviceService.remove(companyId, id);
  }
}
