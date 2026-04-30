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
import { BulkProductService } from './bulk-product.service';
import { CreateBulkProductDto } from './dto/create-bulk-product.dto';
import { UpdateBulkProductDto } from './dto/update-bulk-product.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CompanyId } from '../../auth/decorators/company.decorator';
import { Role } from '@prisma/client';

@ApiTags('products')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bulk-products')
export class BulkProductController {
  constructor(private readonly bulkProductService: BulkProductService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Yeni toptan ürün ekle (Admin/Manager)' })
  @ApiResponse({ status: 201, description: 'Ürün oluşturuldu' })
  @ApiResponse({ status: 409, description: 'Barkod zaten kayıtlı' })
  create(@CompanyId() companyId: number, @Body() dto: CreateBulkProductDto) {
    return this.bulkProductService.create(companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tüm toptan ürünleri listele (sayfalama)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findAll(
    @CompanyId() companyId: number,
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
  ) {
    return this.bulkProductService.findAll(companyId, pagination, search);
  }

  @Get(':id/commercial-history')
  @ApiOperation({ summary: 'Ürünün ticari işlem geçmişini getir (sayfalama)' })
  getCommercialHistory(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.bulkProductService.getCommercialHistory(
      companyId,
      id,
      pagination,
    );
  }

  @Get(':id/stock-movements')
  @ApiOperation({ summary: 'Ürünün stok hareketlerini getir (sayfalama)' })
  getStockMovements(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.bulkProductService.getStockMovements(companyId, id, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID ile toptan ürün getir' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.bulkProductService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Toptan ürün bilgilerini güncelle (Admin/Manager)' })
  @ApiResponse({ status: 200, description: 'Güncelleme başarılı' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  @ApiResponse({ status: 409, description: 'Barkod çakışması' })
  update(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBulkProductDto,
  ) {
    return this.bulkProductService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Toptan ürünü sil (soft delete) - Sadece Admin' })
  @ApiResponse({ status: 204, description: 'Silme başarılı' })
  @ApiResponse({ status: 403, description: 'Yetkisiz erişim' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  async remove(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.bulkProductService.remove(companyId, id);
  }
}
