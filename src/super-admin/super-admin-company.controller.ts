import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Put,
  Query,
  Delete,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminJwtAuthGuard } from './guards/super-admin-jwt.guard';
import { PaginationDto } from '../common/dto/pagination.dto';

@UseGuards(SuperAdminJwtAuthGuard)
@Controller('super-admin/companies')
export class SuperAdminCompanyController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get()
  getCompanies(@Query() pagination: PaginationDto) {
    const { search, ...p } = pagination;
    return this.superAdminService.getCompanies(p, search);
  }

  @Get('dashboard-stats')
  getStats() {
    return this.superAdminService.getDashboardStats();
  }

  @Post()
  createCompany(@Body() body: any) {
    return this.superAdminService.createCompany(body);
  }

  @Put(':id')
  updateCompany(@Param('id') id: string, @Body() body: any) {
    return this.superAdminService.updateCompany(+id, body);
  }

  @Patch(':id/toggle-status')
  toggleStatus(@Param('id') id: string) {
    return this.superAdminService.toggleCompanyStatus(+id);
  }

  @Get(':id/impersonate')
  impersonate(@Param('id') id: string) {
    return this.superAdminService.impersonateCompany(+id);
  }

  @Delete(':id')
  deleteCompany(@Param('id') id: string) {
    return this.superAdminService.deleteCompany(+id);
  }
}
