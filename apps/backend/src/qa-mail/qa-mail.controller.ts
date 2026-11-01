import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QaMailService } from './qa-mail.service';
import { QaMailRepliesService } from './qa-mail-replies.service';

// @anchor qa-mail-controller
// Pytania z Q&A wysyłane mailem do klienta ze skrzynki firmowej zalogowanego użytkownika.
@Controller('qa-mail')
@UseGuards(JwtAuthGuard)
export class QaMailController {
  constructor(private readonly qaMail: QaMailService, private readonly replies: QaMailRepliesService) {}

  // @anchor get-qa-mail-replies
  @Get('replies/:processNodeId')
  listReplies(@Param('processNodeId') processNodeId: string) {
    return this.replies.list(processNodeId);
  }

  // @anchor post-qa-mail-replies-check
  @Post('replies/check')
  checkReplies(@Body() dto: any) {
    return this.replies.checkOrder(String(dto?.processNodeId || ''));
  }

  // @anchor post-qa-mail-reply-analyze
  @Post('replies/:id/analyze')
  analyzeReply(@Param('id') id: string) {
    return this.replies.analyze(id);
  }

  // @anchor post-qa-mail-reply-resolve
  @Post('replies/:id/resolve')
  resolveReply(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.replies.resolve(req.user.userId, id, String(dto?.status || ''));
  }

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
