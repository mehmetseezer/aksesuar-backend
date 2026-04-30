import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  UseGuards,
  Query,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminJwtAuthGuard } from './guards/super-admin-jwt.guard';
import { PaginationDto } from '../common/dto/pagination.dto';

@UseGuards(SuperAdminJwtAuthGuard)
@Controller('super-admin/packages')
export class SuperAdminPackageController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get()
  getPackages(@Query() pagination: PaginationDto) {
    const { search, ...p } = pagination;
    return this.superAdminService.getPackages(p, search);
  }

  @Post()
  createPackage(@Body() body: any) {
    return this.superAdminService.createPackage(body);
  }

  @Put(':id')
  updatePackage(@Param('id') id: string, @Body() body: any) {
    return this.superAdminService.updatePackage(+id, body);
  }
}
