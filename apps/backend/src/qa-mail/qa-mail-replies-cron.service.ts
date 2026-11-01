import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { QaMailRepliesService } from './qa-mail-replies.service';

// @anchor qa-mail-replies-cron-service — co 5 minut odbiera odpowiedzi klientów na maile z pytaniami.
// `QA_MAIL_REPLY_CRON=false` wyłącza automat (dev: kopia produkcji z prawdziwymi skrzynkami);
// „Sprawdź pocztę” w oknie odpowiedzi działa dalej.
@Injectable()
export class QaMailRepliesCronService {
  private readonly logger = new Logger(QaMailRepliesCronService.name);
  private running = false;

  constructor(private readonly replies: QaMailRepliesService, private readonly config: ConfigService) {}

  // @anchor qa-mail-replies-cron-run
  @Cron('*/5 * * * *', { name: 'qa-mail-replies' })
  async tick(): Promise<void> {
    if (this.running) return;
    if (String(this.config.get('QA_MAIL_REPLY_CRON') ?? 'true').toLowerCase() === 'false') return;
    this.running = true;
    try {
      await this.replies.pollActive();
    } catch (err: any) {
      this.logger.error(`Odbiór odpowiedzi na pytania — przebieg nieudany: ${err?.message}`);
    } finally {
      this.running = false;
    }
  }
}
