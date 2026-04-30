import { Controller, Get } from '@nestjs/common';
import { SuperAdminService } from './super-admin/super-admin.service';

@Controller('public')
export class PublicController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('announcements')
  getActiveAnnouncements() {
    return this.superAdminService.getActiveAnnouncements();
  }
}
