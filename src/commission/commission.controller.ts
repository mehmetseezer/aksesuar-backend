import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { CommissionService } from './commission.service';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompanyId } from '../auth/decorators/company.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Role } from '@prisma/client';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('commissions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commissions')
export class CommissionController {
  constructor(private readonly commissionService: CommissionService) {}

  @Post('rules')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Yeni komisyon kuralı oluştur' })
  createRule(
    @CompanyId() companyId: number,
    @Body() createDto: CreateCommissionRuleDto,
  ) {
    return this.commissionService.createRule(companyId, createDto);
  }

  @Get('rules')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Tüm komisyon kurallarını listele' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAllRules(
    @CompanyId() companyId: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.commissionService.findAllRules(companyId, pagination);
  }

  @Get('rules/:id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'ID ile komisyon kuralı getir' })
  findOneRule(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.commissionService.findOneRule(companyId, id);
  }

  @Patch('rules/:id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Komisyon kuralını güncelle' })
  updateRule(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateCommissionRuleDto,
  ) {
    return this.commissionService.updateRule(companyId, id, updateDto);
  }

  @Delete('rules/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Komisyon kuralını sil' })
  removeRule(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.commissionService.removeRule(companyId, id);
  }

  @Get('employee/:employeeId')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Bir personelin komisyon geçmişini getir' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getEmployeeCommissions(
    @CompanyId() companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.commissionService.getEmployeeCommissions(
      companyId,
      employeeId,
      pagination,
    );
  }
}
