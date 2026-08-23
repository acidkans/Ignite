import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateLeaveRequestDto,
  DecideLeaveRequestDto,
  LeaveRequestsService,
  UpdateLeaveRequestDto,
} from './leave-requests.service';

// @anchor leave-requests-controller
@Controller('leave-requests')
@UseGuards(JwtAuthGuard)
export class LeaveRequestsController {
  constructor(private readonly requests: LeaveRequestsService) {}

  // @anchor leave-requests-mine-endpoint
  @Get('mine')
  mine(@Req() req: any) {
    return this.requests.listOwn(req.user.userId, req.user.roles || []);
  }

  // @anchor leave-requests-subordinates-endpoint
  @Get('subordinates')
  subordinates(@Req() req: any) {
    return this.requests.listSubordinates(req.user.userId, req.user.roles || []);
  }

  // @anchor leave-requests-dashboard-endpoint
  @Get('dashboard')
  dashboard(@Req() req: any, @Query('userId') targetUserId?: string) {
    return this.requests.dashboard(req.user.userId, req.user.roles || [], targetUserId);
  }

  // @anchor leave-requests-type-usage-endpoint
  /// Ile dni wybrano i ile zostało z każdego rodzaju urlopu — podgląd we wniosku.
  @Get('type-usage')
  typeUsage(@Req() req: any, @Query('userId') targetUserId?: string, @Query('year') year?: string) {
    return this.requests.typeUsage(
      req.user.userId,
      req.user.roles || [],
      targetUserId,
      year ? Number(year) : undefined,
    );
  }

  // @anchor leave-requests-holiday-days-endpoint
  /// Swieta w sobote do wyboru we wniosku „Do wyboru za swieto w sobote".
  @Get('holiday-days')
  holidayDays(
    @Req() req: any,
    @Query('userId') targetUserId?: string,
    @Query('year') year?: string,
    @Query('requestId') requestId?: string,
  ) {
    return this.requests.holidayDaysForRequest(
      req.user.userId,
      req.user.roles || [],
      targetUserId,
      year ? Number(year) : undefined,
      requestId,
    );
  }

  // @anchor leave-requests-create-endpoint
  @Post()
  create(@Req() req: any, @Body() dto: CreateLeaveRequestDto) {
    return this.requests.create(req.user.userId, req.user.roles || [], dto);
  }

  // @anchor leave-requests-decision-endpoint
  @Patch(':id/decision')
  decide(@Req() req: any, @Param('id') id: string, @Body() dto: DecideLeaveRequestDto) {
    return this.requests.decide(req.user.userId, req.user.roles || [], id, dto);
  }

  // @anchor leave-requests-update-endpoint
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateLeaveRequestDto) {
    return this.requests.update(req.user.userId, req.user.roles || [], id, dto);
  }

  // @anchor leave-requests-delete-endpoint
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.requests.remove(req.user.userId, req.user.roles || [], id);
  }
}
