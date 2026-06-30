import { Module } from '@nestjs/common';
import { NotificationCronService } from './notification-cron.service';
import { UserTasksModule } from '../user-tasks/user-tasks.module';
import { PushModule } from '../push/push.module';
import { NotificationSettingsModule } from '../notification-settings/notification-settings.module';

// @anchor notification-cron-module
@Module({
  imports: [UserTasksModule, PushModule, NotificationSettingsModule],
  providers: [NotificationCronService],
})
export class NotificationCronModule {}
