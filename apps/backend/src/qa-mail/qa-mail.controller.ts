import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QaMailService } from './qa-mail.service';

// @anchor qa-mail-controller
// Pytania z Q&A wysyłane mailem do klienta ze skrzynki firmowej zalogowanego użytkownika.
@Controller('qa-mail')
@UseGuards(JwtAuthGuard)
export class QaMailController {
  constructor(private readonly qaMail: QaMailService) {}

  // @anchor get-qa-mail-context
  @Get('order/:processNodeId')
  context(@Req() req: any, @Param('processNodeId') processNodeId: string) {
    return this.qaMail.context(req.user.userId, processNodeId);
  }

  // @anchor post-qa-mail-send
  @Post('send')
  send(@Req() req: any, @Body() dto: any) {
    return this.qaMail.send(req.user.userId, dto);
  }
}
