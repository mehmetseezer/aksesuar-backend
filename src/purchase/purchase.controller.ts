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
import { PurchaseService } from './purchase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PurchaseQueryDto } from './dto/purchase-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyId } from '../auth/decorators/company.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';

@ApiTags('purchases')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchases')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni alım (satın alma) oluştur' })
  @ApiResponse({ status: 201, description: 'Alım başarıyla oluşturuldu' })
  @ApiResponse({
    status: 400,
    description: 'Geçersiz veri veya IMEI zaten kayıtlı',
  })
  create(
    @CompanyId() companyId: number,
    @CurrentUser('id') employeeId: number,
    @Body() dto: CreatePurchaseDto,
  ) {
    return this.purchaseService.create(companyId, employeeId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tüm alımları listele (sayfalama ve filtreleme)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'supplier_id', required: false, type: Number })
  @ApiQuery({ name: 'customer_id', required: false, type: Number })
  findAll(@CompanyId() companyId: number, @Query() query: PurchaseQueryDto) {
    return this.purchaseService.findAll(companyId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID ile alım detayı getir' })
  @ApiResponse({ status: 200, description: 'Alım detayı' })
  @ApiResponse({ status: 404, description: 'Alım kaydı bulunamadı' })
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.purchaseService.findOne(companyId, id);
  }

  @Post(':id/payment')
  @ApiOperation({ summary: 'Alımın ödenen tutarını güncelle' })
  @ApiResponse({ status: 200, description: 'Ödeme güncellendi' })
  updatePayment(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('paid_amount') paidAmount: number,
    @CurrentUser('id') employeeId: number,
  ) {
    return this.purchaseService.updatePayment(
      companyId,
      id,
      paidAmount,
      employeeId,
    );
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Alımı iptal et' })
  @ApiResponse({ status: 200, description: 'Alım başarıyla iptal edildi' })
  @ApiResponse({ status: 400, description: 'Alım iptal edilemez' })
  cancel(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') employeeId: number,
  ) {
    return this.purchaseService.cancel(companyId, id, employeeId);
  }
}
