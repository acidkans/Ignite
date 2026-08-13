import { Module } from '@nestjs/common';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveBalancesController } from './leave-balances.controller';
import { LeaveBalancesService } from './leave-balances.service';
import { DependentsController } from './dependents.controller';
import { DependentsService } from './dependents.service';
import { HolidaysService } from './holidays.service';

// @anchor leaves-module
@Module({
  controllers: [LeavesController, LeaveRequestsController, LeaveBalancesController, DependentsController],
  providers: [LeavesService, LeaveRequestsService, LeaveBalancesService, DependentsService, HolidaysService],
  exports: [LeavesService, LeaveRequestsService, LeaveBalancesService, DependentsService, HolidaysService],
})
export class LeavesModule {}
