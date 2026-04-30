import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { IncomeService } from './income.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { IncomeQueryDto } from './dto/income-query.dto';

@Controller('incomes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncomeController {
  constructor(private readonly incomeService: IncomeService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Request() req, @Body() createIncomeDto: CreateIncomeDto) {
    return this.incomeService.create(
      req.user.companyId,
      req.user.id,
      createIncomeDto,
    );
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  findAll(@Request() req, @Query() query: IncomeQueryDto) {
    return this.incomeService.findAll(
      req.user.companyId,
      query,
      query.category,
      query.search,
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  findOne(@Request() req, @Param('id') id: string) {
    return this.incomeService.findOne(req.user.companyId, +id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateIncomeDto: UpdateIncomeDto,
  ) {
    return this.incomeService.update(req.user.companyId, +id, updateIncomeDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Request() req, @Param('id') id: string) {
    return this.incomeService.remove(req.user.companyId, +id, req.user.id);
  }
}
