import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminJwtAuthGuard } from './guards/super-admin-jwt.guard';

@Controller('super-admin/announcements')
@UseGuards(SuperAdminJwtAuthGuard)
export class SuperAdminAnnouncementController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get()
  getAnnouncements() {
    return this.superAdminService.getAnnouncements();
  }

  @Post()
  createAnnouncement(@Body() body: any) {
    return this.superAdminService.createAnnouncement(body);
  }

  @Put(':id')
  updateAnnouncement(@Param('id') id: string, @Body() body: any) {
    return this.superAdminService.updateAnnouncement(+id, body);
  }

  @Delete(':id')
  deleteAnnouncement(@Param('id') id: string) {
    return this.superAdminService.deleteAnnouncement(+id);
  }
}
