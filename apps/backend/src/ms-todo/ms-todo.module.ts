import { Module } from '@nestjs/common';
import { MsTodoService } from './ms-todo.service';
import { MsTodoController } from './ms-todo.controller';
import { OneDriveModule } from '../onedrive/onedrive.module';

// @anchor ms-todo-module
@Module({
  imports: [OneDriveModule],
  controllers: [MsTodoController],
  providers: [MsTodoService],
  exports: [MsTodoService],
})
export class MsTodoModule {}
