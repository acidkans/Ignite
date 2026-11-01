import { Module } from '@nestjs/common';
import { MailboxesService } from './mailboxes.service';
import { MailboxesController, MailDomainsController } from './mailboxes.controller';

// @anchor mailboxes-module
// Poczta firmowa: domeny (Airtel, Europrim…) i skrzynki użytkowników. Wysyłka pytań i odbiór
// odpowiedzi (krok 3–4) będą korzystać z MailboxesService.
@Module({
  controllers: [MailDomainsController, MailboxesController],
  providers: [MailboxesService],
  exports: [MailboxesService],
})
export class MailboxesModule {}
