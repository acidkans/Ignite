import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { WatekMailRepliesService } from './watek-mail-replies.service';

// @anchor watek-mail-replies-cron-service
// Co 5 minut (przesunięte o 2 min względem Q&A) odbiera odpowiedzi na maile wątków Realizacji.
// `WATEK_MAIL_REPLY_CRON=false` wyłącza automat (dev: kopia produkcji z prawdziwymi skrzynkami);
// „Sprawdź pocztę” w wątku działa dalej.
@Injectable()
export class WatekMailRepliesCronService {
  private readonly logger = new Logger(WatekMailRepliesCronService.name);
  private running = false;

  constructor(private readonly replies: WatekMailRepliesService, private readonly config: ConfigService) {}

  // @anchor watek-mail-replies-cron-run
  @Cron('2-59/5 * * * *', { name: 'watek-mail-replies' })
  async tick(): Promise<void> {
    if (this.running) return;
    if (String(this.config.get('WATEK_MAIL_REPLY_CRON') ?? 'true').toLowerCase() === 'false') return;
    this.running = true;
    try {
      await this.replies.pollActive();
    } catch (err: any) {
      this.logger.error(`Odbiór odpowiedzi na maile wątków — przebieg nieudany: ${err?.message}`);
    } finally {
      this.running = false;
    }
  }
}
