import {
  Controller,
  Post,
  Get,
  Param,
  Body,
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
import { TradeService } from './trade.service';
import { CreateTradeDto } from './dto/create-trade.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompanyId } from '../auth/decorators/company.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { Role } from '@prisma/client';

@ApiTags('trades')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trades')
export class TradeController {
  constructor(private readonly tradeService: TradeService) { }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Takas işlemi oluştur' })
  @ApiResponse({ status: 201, description: 'Takas başarıyla gerçekleştirildi' })
  @ApiResponse({ status: 400, description: 'Geçersiz veri veya yetersiz stok' })
  create(
    @CompanyId() companyId: number,
    @CurrentUser() currentUser: any,
    @Body() dto: CreateTradeDto,
  ) {
    return this.tradeService.create(companyId, currentUser.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tüm takas işlemlerini listele (sayfalama)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findAll(@CompanyId() companyId: number, @Query() pagination: PaginationDto) {
    return this.tradeService.findAll(companyId, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID ile takas detayı getir' })
  @ApiResponse({ status: 200, description: 'Takas detayı' })
  @ApiResponse({ status: 404, description: 'Takas kaydı bulunamadı' })
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tradeService.findOne(companyId, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Takas işlemini iptal et' })
  @ApiResponse({ status: 200, description: 'Takas başarıyla iptal edildi' })
  cancel(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: any,
  ) {
    return this.tradeService.cancel(companyId, id, currentUser.id);
  }
}
