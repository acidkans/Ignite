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
import { LeaveDecisionTokenService } from './leave-decision-token.service';
import { LeaveDecisionLinkController } from './leave-decision-link.controller';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';

// @anchor leaves-module
@Module({
  imports: [GoogleCalendarModule],
  controllers: [
    LeavesController,
    LeaveRequestsController,
    LeaveDecisionLinkController,
    LeaveBalancesController,
    DependentsController,
  ],
  providers: [
    LeavesService,
    LeaveRequestsService,
    LeaveBalancesService,
    DependentsService,
    HolidaysService,
    LeaveDecisionTokenService,
  ],
  exports: [LeavesService, LeaveRequestsService, LeaveBalancesService, DependentsService, HolidaysService],
})
export class LeavesModule {}
