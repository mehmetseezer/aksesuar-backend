import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyId } from '../auth/decorators/company.decorator';
import { ReportFilterDto } from './dto/report-filter.dto';

@ApiTags('reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard özet bilgileri' })
  getDashboardSummary(
    @CompanyId() companyId: number,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportService.getDashboardSummary(
      companyId,
      filter.startDate,
      filter.endDate,
    );
  }

  @Get('end-of-day')
  @ApiOperation({ summary: 'Gün sonu raporu' })
  getEndOfDayReport(
    @CompanyId() companyId: number,
    @Query('date') date?: string,
  ) {
    return this.reportService.getEndOfDayReport(companyId, date);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Satış raporu (günlük detay, sayfalama)' })
  getSalesReport(
    @CompanyId() companyId: number,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportService.getSalesReport(
      companyId,
      filter,
      filter.startDate,
      filter.endDate,
    );
  }

  @Get('top-products')
  @ApiOperation({ summary: 'En çok satan ürünler (sayfalama)' })
  getTopProducts(
    @CompanyId() companyId: number,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportService.getTopSellingProducts(
      companyId,
      filter,
      filter.startDate,
      filter.endDate,
    );
  }

  @Get('cash-flow')
  @ApiOperation({ summary: 'Nakit akışı özeti (sayfalama)' })
  getCashFlow(
    @CompanyId() companyId: number,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportService.getCashFlowSummary(
      companyId,
      filter,
      filter.startDate,
      filter.endDate,
    );
  }

  @Get('inventory-value')
  @ApiOperation({ summary: 'Stok değeri ve miktar özeti' })
  getInventoryValue(@CompanyId() companyId: number) {
    return this.reportService.getInventoryValue(companyId);
  }

  @Get('employee-productivity')
  @ApiOperation({ summary: 'Çalışan verimlilik raporu' })
  getEmployeeProductivity(
    @CompanyId() companyId: number,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportService.getEmployeeProductivity(
      companyId,
      filter.startDate,
      filter.endDate,
    );
  }
}
