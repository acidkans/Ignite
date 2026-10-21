import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TrainingsService, TrainingTypeDto, UserTrainingDto, BulkUserTrainingDto } from './trainings.service';
import { TrainingAlertsService } from './training-alerts.service';

// @anchor trainings-controller — moduł Szkoleń jest pod „Użytkownicy", więc tylko ADMIN.
@Controller('trainings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class TrainingsController {
    constructor(
        private readonly trainings: TrainingsService,
        private readonly alerts: TrainingAlertsService,
    ) {}

    // @anchor trainings-overview-endpoint — GET /trainings/overview
    @Get('overview')
    overview() {
        return this.trainings.overview();
    }

    // @anchor trainings-types-endpoints — POST/PATCH/DELETE /trainings/types
    @Post('types')
    createType(@Body() dto: TrainingTypeDto) {
        return this.trainings.createType(dto);
    }

    @Patch('types/:id')
    updateType(@Param('id') id: string, @Body() dto: TrainingTypeDto) {
        return this.trainings.updateType(id, dto);
    }

    @Delete('types/:id')
    deleteType(@Param('id') id: string) {
        return this.trainings.deleteType(id);
    }

    // @anchor trainings-user-trainings-endpoints — PUT /trainings/user-trainings (upsert), DELETE /trainings/user-trainings/:id
    @Put('user-trainings')
    upsertUserTraining(@Body() dto: UserTrainingDto) {
        return this.trainings.upsertUserTraining(dto);
    }

    // @anchor trainings-bulk-endpoint — PUT /trainings/user-trainings/bulk {userIds, trainingTypeIds, completedAt, validUntil?, certificateNo?}
    @Put('user-trainings/bulk')
    bulkUpsertUserTrainings(@Body() dto: BulkUserTrainingDto) {
        return this.trainings.bulkUpsertUserTrainings(dto);
    }

    @Delete('user-trainings/:id')
    deleteUserTraining(@Param('id') id: string) {
        return this.trainings.deleteUserTraining(id);
    }

    // @anchor trainings-user-orders-endpoint — PUT /trainings/users/:userId/orders {orderIds}
    @Put('users/:userId/orders')
    setUserOrders(@Param('userId') userId: string, @Body() body: { orderIds: string[] }) {
        return this.trainings.setUserOrders(userId, body?.orderIds);
    }

    // @anchor trainings-alerts-endpoints — ustawienia, podgląd, historia, test i wysyłka ręczna
    @Get('alerts/settings')
    alertSettings() {
        return this.alerts.getSettings();
    }

    @Patch('alerts/settings')
    updateAlertSettings(@Body() dto: any) {
        return this.alerts.updateSettings(dto);
    }

    @Get('alerts/preview')
    alertPreview() {
        return this.alerts.preview();
    }

    @Get('alerts/runs')
    alertRuns() {
        return this.alerts.runs();
    }

    @Post('alerts/send-test')
    sendTest(@Req() req: any) {
        return this.alerts.sendTest(req.user.userId);
    }

    @Post('alerts/run')
    runNow() {
        return this.alerts.run('MANUAL');
    }
}
