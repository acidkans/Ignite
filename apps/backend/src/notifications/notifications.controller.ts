import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private notifications: NotificationsService) {}

    @Get()
    getAll(@Request() req) {
        return this.notifications.getForUser(req.user.userId);
    }

    @Get('unread-count')
    getUnreadCount(@Request() req) {
        return this.notifications.getUnreadCount(req.user.userId);
    }

    @Patch('read-all')
    markAllRead(@Request() req) {
        return this.notifications.markRead(req.user.userId);
    }

    @Patch(':id/read')
    markRead(@Param('id') id: string, @Request() req) {
        return this.notifications.markRead(req.user.userId, id);
    }
}
