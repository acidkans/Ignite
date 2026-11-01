import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailboxesModule } from '../mailboxes/mailboxes.module';
import { AiModule } from '../ai/ai.module';
import { QaMailController } from './qa-mail.controller';
import { QaMailService } from './qa-mail.service';
import { QaMailRepliesService } from './qa-mail-replies.service';
import { QaMailRepliesCronService } from './qa-mail-replies-cron.service';

// @anchor qa-mail-module
// Pytania z Q&A wysyłane mailem do klienta i odbiór odpowiedzi (IMAP + propozycje AI).
@Module({
  imports: [MailboxesModule, ConfigModule, forwardRef(() => AiModule)],
  controllers: [QaMailController],
  providers: [QaMailService, QaMailRepliesService, QaMailRepliesCronService],
  exports: [QaMailService, QaMailRepliesService],
})
export class QaMailModule {}
