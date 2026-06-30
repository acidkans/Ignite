import { Body, Controller, Get, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { NotificationSettingsService } from './notification-settings.service';
import { PushService } from '../push/push.service';

// @anchor notif-settings-controller
@Controller('notification-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class NotificationSettingsController {
  constructor(
    private readonly service: NotificationSettingsService,
    private readonly push: PushService,
  ) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(@Body() dto: any) {
    return this.service.update(dto);
  }

  @Post('test-push')
  async testPush(@Request() req) {
    await this.push.sendToUser(req.user.userId, '🔔 Test powiadomień', 'Powiadomienia działają poprawnie!');
    return { ok: true };
  }
}
