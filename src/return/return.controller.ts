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
import { ReturnService } from './return.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompanyId } from '../auth/decorators/company.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { Role } from '@prisma/client';

@ApiTags('returns')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('returns')
export class ReturnController {
  constructor(private readonly returnService: ReturnService) { }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Satış iadesi oluştur (komisyon otomatik iptal)' })
  @ApiResponse({ status: 201, description: 'İade başarıyla oluşturuldu' })
  @ApiResponse({
    status: 400,
    description: 'Geçersiz iade miktarı veya satış kalemi',
  })
  @ApiResponse({ status: 404, description: 'Satış bulunamadı' })
  create(
    @CompanyId() companyId: number,
    @CurrentUser() currentUser: any,
    @Body() dto: CreateReturnDto,
  ) {
    return this.returnService.create(companyId, currentUser.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tüm iadeleri listele (sayfalama)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findAll(@CompanyId() companyId: number, @Query() pagination: PaginationDto) {
    return this.returnService.findAll(companyId, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID ile iade detayı getir' })
  @ApiResponse({ status: 200, description: 'İade detayı' })
  @ApiResponse({ status: 404, description: 'İade kaydı bulunamadı' })
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.returnService.findOne(companyId, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'İadeyi iptal et' })
  @ApiResponse({ status: 200, description: 'İade başarıyla iptal edildi' })
  cancel(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: any,
  ) {
    return this.returnService.cancel(companyId, id, currentUser.id);
  }
}
