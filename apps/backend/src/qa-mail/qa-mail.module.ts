import { Module } from '@nestjs/common';
import { MailboxesModule } from '../mailboxes/mailboxes.module';
import { QaMailController } from './qa-mail.controller';
import { QaMailService } from './qa-mail.service';

// @anchor qa-mail-module
// Pytania z Q&A wysyłane mailem do klienta (krok 3). Odbiór odpowiedzi (krok 4) dołączy tutaj.
@Module({
  imports: [MailboxesModule],
  controllers: [QaMailController],
  providers: [QaMailService],
  exports: [QaMailService],
})
export class QaMailModule {}
