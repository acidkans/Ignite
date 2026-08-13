import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateLeaveDto, LeavesService, UpdateLeaveDto } from './leaves.service';
import { HolidaysService } from './holidays.service';

// @anchor leaves-controller
@Controller('leaves')
@UseGuards(JwtAuthGuard)
export class LeavesController {
  constructor(
    private readonly leaves: LeavesService,
    private readonly holidays_: HolidaysService,
  ) {}

  // @anchor leaves-access-endpoint
  @Get('access')
  access(@Req() req: any) {
    return this.leaves.resolveAccess(req.user.userId, req.user.roles || []);
  }

  // @anchor leaves-types-endpoint
  @Get('types')
  types() {
    return this.leaves.listTypes();
  }

  // @anchor leaves-employees-endpoint
  @Get('employees')
  employees(@Req() req: any) {
    return this.leaves.listEmployees(req.user.userId, req.user.roles || []);
  }

  // @anchor leaves-layout-get-endpoint
  @Get('layout')
  getLayout(@Req() req: any) {
    return this.leaves.getLayout(req.user.userId);
  }

  // @anchor leaves-layout-put-endpoint
  @Put('layout')
  saveLayout(@Req() req: any, @Body() body: any) {
    return this.leaves.saveLayout(req.user.userId, body);
  }

  // @anchor leaves-holidays-get-endpoint
  /// Dni wolne za świeta w sobote — lista propozycji z decyzja administratora.
  @Get('holidays')
  holidays(@Query('year') year?: string) {
    const y = Number(year) || new Date().getFullYear();
    return this.holidays_.list(y);
  }

  // @anchor leaves-holidays-put-endpoint
  @Put('holidays')
  approveHolidays(@Req() req: any, @Body() body: { year?: number; dates?: string[] }) {
    const y = Number(body?.year) || new Date().getFullYear();
    const isAdmin = (req.user.roles || []).includes('ADMIN');
    return this.holidays_.setApproved(req.user.userId, isAdmin, y, body?.dates || []);
  }

  // @anchor leaves-holidays-custom-post-endpoint
  /// Wlasny dzien wolny administratora — poza kalendarzem swiat.
  @Post('holidays/custom')
  addCustomHoliday(@Req() req: any, @Body() body: { date: string; name?: string }) {
    const isAdmin = (req.user.roles || []).includes('ADMIN');
    return this.holidays_.addCustom(req.user.userId, isAdmin, body?.date, body?.name);
  }

  // @anchor leaves-holidays-custom-delete-endpoint
  @Delete('holidays/custom')
  removeCustomHoliday(@Req() req: any, @Query('date') date: string) {
    const isAdmin = (req.user.roles || []).includes('ADMIN');
    return this.holidays_.removeCustom(req.user.userId, isAdmin, date);
  }

  // @anchor leaves-list-endpoint
  @Get()
  list(@Req() req: any, @Query('leaveTypeId') leaveTypeId?: string) {
    return this.leaves.list(req.user.userId, req.user.roles || [], leaveTypeId);
  }

  // @anchor leaves-create-endpoint
  @Post()
  create(@Req() req: any, @Body() dto: CreateLeaveDto) {
    return this.leaves.create(req.user.userId, req.user.roles || [], dto);
  }

  // @anchor leaves-update-endpoint
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateLeaveDto) {
    return this.leaves.update(req.user.userId, req.user.roles || [], id, dto);
  }

  // @anchor leaves-delete-endpoint
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.leaves.remove(req.user.userId, req.user.roles || [], id);
  }
}
