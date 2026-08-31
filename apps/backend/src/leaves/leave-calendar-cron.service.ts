import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeaveRequestsService } from './leave-requests.service';

// @anchor leave-calendar-cron-months-back
/// Ile miesiecy wstecz sprawdza automat. Trzy wystarczaja: starsze urlopy nikt juz nie
/// przeglada, a kazdy przebieg to jedno zapytanie do Google na wniosek.
const CRON_MONTHS_BACK = 3;

// @anchor leave-calendar-cron-service
/// Cogodzinne pilnowanie, zeby wspolny kalendarz Google zgadzal sie z baza: recznie
/// skasowane wydarzenie wraca, a zapis, ktory nie przeszedl przy zatwierdzeniu wniosku,
/// sam sie ponawia. Chodzi TYLKO gdy administrator wlaczy przelacznik w panelu Urlopy —
/// dopoki wnioski pisze rownolegle AppSheet, automat mnozylby wpisy.
@Injectable()
export class LeaveCalendarCronService {
  private readonly logger = new Logger(LeaveCalendarCronService.name);
  /// zabezpieczenie przed nakladaniem sie przebiegow, gdy Google odpowiada wolno
  private running = false;

  constructor(private readonly requests: LeaveRequestsService) {}

  // @anchor leave-calendar-cron-run
  @Cron(CronExpression.EVERY_HOUR, { name: 'leave-calendar-resync' })
  async run(): Promise<void> {
    if (this.running) return;
    if (!(await this.requests.isCalendarSyncEnabled())) return;

    this.running = true;
    try {
      const wynik = await this.requests.reconcileCalendar(CRON_MONTHS_BACK);
      // cisza, gdy nie bylo nic do roboty — log ma sygnalizowac zmiany, nie bicie zegara
      if (wynik.poprawione || wynik.bledy) {
        this.logger.log(
          `Kalendarz urlopowy: sprawdzone ${wynik.sprawdzone}, poprawione ${wynik.poprawione}, błędy ${wynik.bledy}`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Kalendarz urlopowy — przebieg nieudany: ${err?.message}`);
    } finally {
      this.running = false;
    }
  }
}
