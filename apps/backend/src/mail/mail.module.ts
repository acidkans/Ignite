import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';

// @anchor mail-module
// Wysyłka korzysta z SmtpService (Global) — konfiguracja z panelu „Poczta SMTP", fallback env.
@Global()
@Module({
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
