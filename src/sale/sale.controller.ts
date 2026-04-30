import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { SaleService } from './sale.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyId } from '../auth/decorators/company.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';

@ApiTags('sales')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SaleController {
  constructor(private readonly saleService: SaleService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni satış oluştur' })
  @ApiResponse({ status: 201, description: 'Satış başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Yetersiz stok veya geçersiz veri' })
  create(
    @CompanyId() companyId: number,
    @CurrentUser() currentUser: any, // ✅ tüm user nesnesi alınıyor
    @Body() dto: CreateSaleDto,
  ) {
    return this.saleService.create(companyId, currentUser.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tüm satışları listele (sayfalama)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findAll(@CompanyId() companyId: number, @Query() pagination: PaginationDto) {
    return this.saleService.findAll(companyId, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID ile satış detayı getir' })
  @ApiResponse({ status: 200, description: 'Satış detayı' })
  @ApiResponse({ status: 404, description: 'Satış kaydı bulunamadı' })
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.saleService.findOne(companyId, id);
  }

  @Post(':id/payment')
  @ApiOperation({ summary: 'Satışın ödenen tutarını güncelle' })
  @ApiResponse({ status: 200, description: 'Ödeme güncellendi' })
  updatePayment(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('paid_amount') paidAmount: number,
    @CurrentUser() user: any,
  ) {
    return this.saleService.updatePayment(companyId, id, paidAmount, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Satışı iptal et' })
  @ApiResponse({ status: 200, description: 'Satış başarıyla iptal edildi' })
  @ApiResponse({ status: 400, description: 'Satış iptal edilemez' })
  cancel(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.saleService.cancel(companyId, id, user.id);
  }
}
