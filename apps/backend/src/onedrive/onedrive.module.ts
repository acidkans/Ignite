import { Module } from '@nestjs/common';
import { OneDriveService } from './onedrive.service';
import { OneDriveController } from './onedrive.controller';

// @anchor onedrive-module
@Module({
  controllers: [OneDriveController],
  providers: [OneDriveService],
  exports: [OneDriveService],
})
export class OneDriveModule {}
