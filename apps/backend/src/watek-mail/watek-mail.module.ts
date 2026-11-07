import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailboxesModule } from '../mailboxes/mailboxes.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';
import { WatekMailController } from './watek-mail.controller';
import { WatekMailService } from './watek-mail.service';
import { WatekMailRepliesService } from './watek-mail-replies.service';
import { WatekMailRepliesCronService } from './watek-mail-replies-cron.service';

// @anchor watek-mail-module
// Maile z wątków Realizacji (osobno od pytań Q&A): wysyłka ze skrzynki firmowej, odbiór IMAP, import do wątku.
@Module({
  imports: [MailboxesModule, ConfigModule, NotificationsModule, PushModule],
  controllers: [WatekMailController],
  providers: [WatekMailService, WatekMailRepliesService, WatekMailRepliesCronService],
})
export class WatekMailModule {}
