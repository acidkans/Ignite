import { Module, Global } from '@nestjs/common';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationSettingsController } from './notification-settings.controller';
import { PushModule } from '../push/push.module';

// @anchor notif-settings-module
// Global — NotificationSettingsService dostępny wszędzie (cron, sync) bez ręcznego importu.
@Global()
@Module({
  imports: [PushModule],
  controllers: [NotificationSettingsController],
  providers: [NotificationSettingsService],
  exports: [NotificationSettingsService],
})
export class NotificationSettingsModule {}
