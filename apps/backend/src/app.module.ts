import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';
import { ClsModule } from 'nestjs-cls';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit/audit.interceptor';

import { ProcessTreeModule } from './process-tree/process-tree.module';
import { AiModule } from './ai/ai.module';
import { DocumentsModule } from './documents/documents.module';
import { HardwareModule } from './hardware/hardware.module';
import { SiteModule } from './site/site.module';
import { CompanyModule } from './company/company.module';
import { TeamModule } from './team/team.module';
import { SubtasksModule } from './subtasks/subtasks.module';
import { OrderRequirementsModule } from './order-requirements/order-requirements.module';
import { SchematicsModule } from './schematics/schematics.module';
import { MaterialRequirementsModule } from './material-requirements/material-requirements.module';
import { MaterialsModule } from './materials/materials.module';
import { DefaultProjectItemsModule } from './default-project-items/default-project-items.module';
import { CommentsModule } from './comments/comments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PushModule } from './push/push.module';
import { OffersModule } from './offers/offers.module';
import { WbsNodesModule } from './wbs-nodes/wbs-nodes.module';
import { SmtpModule } from './smtp/smtp.module';
import { MailModule } from './mail/mail.module';
import { PdfModule } from './pdf/pdf.module';
import { OneDriveModule } from './onedrive/onedrive.module';
import { NotificationSettingsModule } from './notification-settings/notification-settings.module';
import { MsTodoModule } from './ms-todo/ms-todo.module';
import { UserTasksModule } from './user-tasks/user-tasks.module';
import { NotificationCronModule } from './notification-cron/notification-cron.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { SuppliersModule } from './suppliers/suppliers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
      guard: { mount: true },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AuditModule,
    ProcessTreeModule,
    AiModule,
    DocumentsModule,
    HardwareModule,
    SiteModule,
    CompanyModule,
    TeamModule,
    SubtasksModule,
    OrderRequirementsModule,
    SchematicsModule,
    MaterialRequirementsModule,
    MaterialsModule,
    DefaultProjectItemsModule,
    CommentsModule,
    NotificationsModule,
    PushModule,
    OffersModule,
    WbsNodesModule,
    SmtpModule,
    MailModule,
    PdfModule,
    OneDriveModule,
    NotificationSettingsModule,
    MsTodoModule,
    UserTasksModule,
    NotificationCronModule,
    ExchangeRatesModule,
    SuppliersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule { }
