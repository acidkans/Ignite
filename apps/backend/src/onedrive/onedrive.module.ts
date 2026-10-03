import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OneDriveService } from './onedrive.service';
import { OneDriveController } from './onedrive.controller';
import { OneDriveSyncService } from './onedrive-sync.service';
import { DocumentsModule } from '../documents/documents.module';

// @anchor onedrive-module
@Module({
  imports: [
    DocumentsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OneDriveController],
  providers: [OneDriveService, OneDriveSyncService],
  exports: [OneDriveService, OneDriveSyncService],
})
export class OneDriveModule {}
