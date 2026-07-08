import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OneDriveService } from './onedrive.service';
import { OneDriveController } from './onedrive.controller';

// @anchor onedrive-module
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OneDriveController],
  providers: [OneDriveService],
  exports: [OneDriveService],
})
export class OneDriveModule {}
