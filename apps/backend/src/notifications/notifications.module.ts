import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ExtraOrderNotifierService } from './extra-order-notifier.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';

@Module({
    imports: [PrismaModule, PushModule],
    controllers: [NotificationsController],
    providers: [NotificationsService, ExtraOrderNotifierService],
    exports: [NotificationsService, ExtraOrderNotifierService],
})
export class NotificationsModule {}
