import { Module } from '@nestjs/common';
import { WbsNodesService } from './wbs-nodes.service';
import { WbsNodesController } from './wbs-nodes.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

// @anchor wbs-nodes-module
@Module({
    imports: [PrismaModule, NotificationsModule],
    controllers: [WbsNodesController],
    providers: [WbsNodesService],
    exports: [WbsNodesService],
})
export class WbsNodesModule {}
