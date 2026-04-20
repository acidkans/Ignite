import { Controller, Get, Post, Delete, Body, UseGuards, Request, HttpCode } from '@nestjs/common';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
    constructor(private push: PushService) {}

    @Get('vapid-public-key')
    getPublicKey() {
        return this.push.getPublicKey();
    }

    @Post('subscribe')
    subscribe(@Body() body: { endpoint: string; p256dh: string; auth: string }, @Request() req) {
        return this.push.subscribe(req.user.userId, body);
    }

    @Delete('unsubscribe')
    unsubscribe(@Body() body: { endpoint: string }) {
        return this.push.unsubscribe(body.endpoint);
    }

    @Post('test')
    @HttpCode(200)
    async test(@Request() req) {
        await this.push.sendToUser(req.user.userId, '🔔 Test powiadomień', 'Push działa poprawnie!');
        return { ok: true };
    }
}
