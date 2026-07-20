import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
    imports: [PrismaModule],
    controllers: [OrdersController],
    providers: [OrdersService],
    exports: [OrdersService],
})
// @anchor orders-module
export class OrdersModule { }
