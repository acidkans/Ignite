import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TrainingAlertsService, warsawNow } from './training-alerts.service';

// @anchor training-alerts-cron-service — co godzinę sprawdza, czy wybiła godzina wysyłki
// z ustawień (czas polski) i czy dziś nic jeszcze nie poszło. Jeden przebieg dziennie —
// także gdy admin rano kliknął „Wyślij teraz": progi i tak nie wysłałyby drugi raz tego samego.
@Injectable()
export class TrainingAlertsCronService {
    private readonly logger = new Logger(TrainingAlertsCronService.name);
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly alerts: TrainingAlertsService,
        private readonly config: ConfigService,
    ) {}

    // @anchor training-alerts-cron-run
    @Cron('0 * * * *', { name: 'training-alerts' })
    async tick(): Promise<void> {
        if (this.running) return;
        // @anchor training-alerts-cron-env — `TRAINING_ALERTS_CRON=false` wyłącza automat (dev: baza
        // to kopia produkcji z prawdziwymi adresami adminów). Ręczne „Wyślij teraz" działa dalej.
        if (String(this.config.get('TRAINING_ALERTS_CRON') ?? 'true').toLowerCase() === 'false') return;
        this.running = true;
        try {
            const settings = await this.alerts.getSettings();
            const now = warsawNow();
            if (!settings.enabled || now.hour !== settings.hour) return;
            const recent = await this.prisma.trainingAlertRun.findMany({
                where: { status: { not: 'TEST' }, ranAt: { gte: new Date(Date.now() - 36 * 3_600_000) } },
                select: { ranAt: true },
            });
            if (recent.some(r => warsawNow(r.ranAt).day === now.day)) return;
            const run = await this.alerts.run('CRON');
            if (run && run.status !== 'SKIPPED') this.logger.log(`Alerty szkoleń: ${run.status}, pozycji ${run.items}, odbiorców ${run.recipients}`);
        } catch (err: any) {
            this.logger.error(`Alerty szkoleń — przebieg nieudany: ${err?.message}`);
        } finally {
            this.running = false;
        }
    }
}
