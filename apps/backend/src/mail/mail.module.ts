import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { MailboxesModule } from '../mailboxes/mailboxes.module';

// @anchor mail-module
// Wysyłka korzysta z SmtpService (Global) — konfiguracja z panelu „Poczta SMTP", fallback env.
// Eksporty zamówień z domeną poczty idą ze skrzynki firmowej użytkownika (MailboxesService).
@Global()
@Module({
  imports: [MailboxesModule],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
