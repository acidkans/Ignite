import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards } from '@nestjs/common';
import { SiteService } from './site.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('sites')
@UseGuards(JwtAuthGuard)
export class SiteController {
  constructor(private readonly siteService: SiteService) { }

  @Get('config')
  getUserConfig(@Request() req) {
    return this.siteService.getUserConfig(req.user.userId);
  }

  @Post('config')
  updateUserConfig(@Request() req, @Body() config: any) {
    return this.siteService.updateUserConfig(req.user.userId, config);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.siteService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSiteDto: any) {
    return this.siteService.update(id, updateSiteDto);
  }
}
