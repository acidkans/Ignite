import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
    // AiModule wnosi `VersioningService` — kciuk robi zamrożoną KOPIĘ akceptowanej wersji
    // (`createFrozenCopy`), więc potrzebuje tej samej maszynerii klonowania co wersjonowanie.
    imports: [PrismaModule, AiModule],
    controllers: [OrdersController],
    providers: [OrdersService],
    exports: [OrdersService],
})
// @anchor orders-module
export class OrdersModule { }
