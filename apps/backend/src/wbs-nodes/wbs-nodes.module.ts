import { Module } from '@nestjs/common';
import { WbsNodesService } from './wbs-nodes.service';
import { WbsNodesController } from './wbs-nodes.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [WbsNodesController],
    providers: [WbsNodesService],
    exports: [WbsNodesService],
})
export class WbsNodesModule {}
