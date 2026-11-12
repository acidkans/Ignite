import { Module } from '@nestjs/common';
import { TrainingsController } from './trainings.controller';
import { TrainingsService } from './trainings.service';
import { TrainingAlertsService } from './training-alerts.service';
import { TrainingAlertsCronService } from './training-alerts-cron.service';
import { NotificationsModule } from '../notifications/notifications.module';

// @anchor trainings-module — szkolenia pracowników, wymagania zamówień i codzienne
// przypomnienia o wygasających zaświadczeniach (pracownik: mail + dzwonek; ADMIN-i: zbiorczy mail).
@Module({
    imports: [NotificationsModule],
    controllers: [TrainingsController],
    providers: [TrainingsService, TrainingAlertsService, TrainingAlertsCronService],
})
export class TrainingsModule {}
