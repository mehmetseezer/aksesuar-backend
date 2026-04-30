import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  Patch,
  Param,
} from '@nestjs/common';
import { SupplierReturnService } from './supplier-return.service';
import { CreateSupplierReturnDto } from './dto/create-supplier-return.dto';
import { SupplierReturnQueryDto } from './dto/supplier-return-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyId } from '../auth/decorators/company.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';

@Controller('supplier-return')
@UseGuards(JwtAuthGuard)
export class SupplierReturnController {
  constructor(private readonly supplierReturnService: SupplierReturnService) {}

  @Post()
  create(
    @Request() req,
    @Body() createSupplierReturnDto: CreateSupplierReturnDto,
  ) {
    return this.supplierReturnService.create(
      req.user.companyId,
      req.user.userId,
      createSupplierReturnDto,
    );
  }

  @Get()
  findAll(
    @CompanyId() companyId: number,
    @Query() query: SupplierReturnQueryDto,
  ) {
    return this.supplierReturnService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.supplierReturnService.findOne(req.user.companyId, +id);
  }

  @Patch(':id/cancel')
  cancel(@Request() req, @Param('id') id: string) {
    return this.supplierReturnService.cancel(
      req.user.companyId,
      +id,
      req.user.userId,
    );
  }
}
