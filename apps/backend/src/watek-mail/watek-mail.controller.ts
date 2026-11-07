import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WatekMailService } from './watek-mail.service';
import { WatekMailRepliesService } from './watek-mail-replies.service';

// @anchor watek-mail-controller
// Maile z wątków gałęzi / pozycji Realizacji: wysyłka do zaznaczonych adresatów i odbiór odpowiedzi do wątku.
@Controller('watek-mail')
@UseGuards(JwtAuthGuard)
export class WatekMailController {
  constructor(private readonly mail: WatekMailService, private readonly replies: WatekMailRepliesService) {}

  // @anchor get-watek-mail-context
  @Get('order/:processNodeId/context')
  context(@Req() req: any, @Param('processNodeId') processNodeId: string, @Query('wbsNodeId') wbsNodeId: string) {
    return this.mail.context(req.user.userId, processNodeId, String(wbsNodeId || ''));
  }

  // @anchor get-watek-mail-list
  @Get('order/:processNodeId')
  list(@Param('processNodeId') processNodeId: string) {
    return this.mail.list(processNodeId);
  }

  // @anchor post-watek-mail-send
  @Post('send')
  send(@Req() req: any, @Body() dto: any) {
    return this.mail.send(req.user.userId, dto);
  }

  // @anchor post-watek-mail-check
  @Post('check')
  check(@Body() dto: any) {
    return this.replies.checkOrder(String(dto?.processNodeId || ''));
  }
}
