import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserTasksService, CreateUserTaskDto, UpdateUserTaskDto } from './user-tasks.service';
import { TaskSyncService } from './task-sync.service';

// @anchor user-tasks-controller
@Controller('my-tasks')
@UseGuards(JwtAuthGuard)
export class UserTasksController {
  constructor(
    private readonly userTasks: UserTasksService,
    private readonly taskSync: TaskSyncService,
  ) {}

  // @anchor user-tasks-get-endpoint
  @Get()
  list(@Req() req: any, @Query('status') status?: string) {
    return this.userTasks.listForUser(req.user.userId, status);
  }

  // @anchor user-tasks-create-endpoint
  @Post()
  create(@Req() req: any, @Body() dto: CreateUserTaskDto) {
    return this.userTasks.create(req.user.userId, dto);
  }

  // @anchor user-tasks-update-endpoint
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateUserTaskDto) {
    return this.userTasks.update(req.user.userId, id, dto);
  }

  // @anchor user-tasks-delete-endpoint
  @Delete(':id')
  softDelete(@Req() req: any, @Param('id') id: string) {
    return this.userTasks.softDelete(req.user.userId, id);
  }

  // @anchor user-tasks-reminders-due-endpoint
  @Get('reminders/due')
  getDueReminders(@Req() req: any) {
    return this.userTasks.getDueReminders(req.user.userId);
  }

  // @anchor user-tasks-reminder-handle-endpoint
  @Patch('reminders/:reminderId')
  handleReminder(
    @Req() req: any,
    @Param('reminderId') reminderId: string,
    @Body() body: { action: 'dismiss' | 'snooze'; minutes?: number },
  ) {
    return this.userTasks.handleReminder(req.user.userId, reminderId, body.action, body.minutes);
  }

  // @anchor user-tasks-reminder-delete-endpoint
  @Delete('reminders/:reminderId')
  deleteReminder(@Req() req: any, @Param('reminderId') reminderId: string) {
    return this.userTasks.deleteReminder(req.user.userId, reminderId);
  }

  // @anchor user-tasks-reminders-list-endpoint
  @Get(':id/reminders')
  listReminders(@Req() req: any, @Param('id') id: string) {
    return this.userTasks.getRemindersForTask(req.user.userId, id);
  }

  // @anchor user-tasks-reminder-create-endpoint
  @Post(':id/reminders')
  createReminder(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { start?: string; end?: string; intervalMinutes?: number },
  ) {
    return this.userTasks.createReminder(req.user.userId, id, body);
  }
}
