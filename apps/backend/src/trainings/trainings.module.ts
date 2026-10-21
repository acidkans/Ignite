import { Module } from '@nestjs/common';
import { TrainingsController } from './trainings.controller';
import { TrainingsService } from './trainings.service';
import { TrainingAlertsService } from './training-alerts.service';
import { TrainingAlertsCronService } from './training-alerts-cron.service';

// @anchor trainings-module — szkolenia pracowników, przypisanie do zamówień i codzienne
// alerty e-mail do ADMIN-ów o wygasających szkoleniach w aktywnych zamówieniach.
@Module({
    controllers: [TrainingsController],
    providers: [TrainingsService, TrainingAlertsService, TrainingAlertsCronService],
})
export class TrainingsModule {}
