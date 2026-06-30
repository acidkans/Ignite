import { Module } from '@nestjs/common';
import { UserTasksService } from './user-tasks.service';
import { UserTasksController } from './user-tasks.controller';
import { TaskSyncService } from './task-sync.service';
import { MsTodoModule } from '../ms-todo/ms-todo.module';

// @anchor user-tasks-module
@Module({
  imports: [MsTodoModule],
  controllers: [UserTasksController],
  providers: [UserTasksService, TaskSyncService],
  exports: [UserTasksService, TaskSyncService],
})
export class UserTasksModule {}
