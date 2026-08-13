import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaveBalancesService, SetEntitlementDto } from './leave-balances.service';

// @anchor leave-balances-controller
@Controller('leave-balances')
@UseGuards(JwtAuthGuard)
export class LeaveBalancesController {
  constructor(private readonly balances: LeaveBalancesService) {}

  // @anchor leave-balances-read-endpoint
  @Get()
  read(@Req() req: any, @Query('userId') targetUserId?: string) {
    return this.balances.read(req.user.userId, req.user.roles || [], targetUserId);
  }

  // @anchor leave-balances-entitlement-endpoint
  @Put('entitlement')
  setEntitlement(@Req() req: any, @Body() dto: SetEntitlementDto) {
    return this.balances.setEntitlement(req.user.userId, req.user.roles || [], dto);
  }
}
