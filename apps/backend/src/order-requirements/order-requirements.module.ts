import { Module } from '@nestjs/common';
import { OrderRequirementsService } from './order-requirements.service';
import { OrderRequirementsController } from './order-requirements.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WbsNodesModule } from '../wbs-nodes/wbs-nodes.module';

@Module({
    imports: [PrismaModule, WbsNodesModule],
    controllers: [OrderRequirementsController],
    providers: [OrderRequirementsService],
    exports: [OrderRequirementsService],
})
export class OrderRequirementsModule { }
