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
import { ExpenseService } from './expense.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompanyId } from '../auth/decorators/company.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { Role } from '@prisma/client';
import { ExpenseQueryDto } from './dto/expense-query.dto';

@ApiTags('expenses')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @ApiOperation({ summary: 'Yeni gider oluştur' })
  @ApiResponse({ status: 201, description: 'Gider başarıyla oluşturuldu' })
  create(
    @CompanyId() companyId: number,
    @CurrentUser() currentUser: any,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expenseService.create(companyId, currentUser.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tüm giderleri listele (sayfalama)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'category', required: false, type: String })
  findAll(@CompanyId() companyId: number, @Query() query: ExpenseQueryDto) {
    return this.expenseService.findAll(
      companyId,
      query,
      query.category,
      query.search,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID ile gider getir' })
  @ApiResponse({ status: 404, description: 'Gider bulunamadı' })
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.expenseService.findOne(companyId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @ApiOperation({ summary: 'Gider bilgilerini güncelle' })
  @ApiResponse({ status: 200, description: 'Güncelleme başarılı' })
  @ApiResponse({ status: 404, description: 'Gider bulunamadı' })
  update(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenseService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gideri sil (soft delete) - Sadece Admin' })
  @ApiResponse({ status: 204, description: 'Silme başarılı' })
  @ApiResponse({ status: 404, description: 'Gider bulunamadı' })
  async remove(
    @CompanyId() companyId: number,
    @CurrentUser() currentUser: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.expenseService.remove(companyId, id, currentUser.id);
  }
}
