import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeafActualsService } from './leaf-actuals.service';
import { LeafActualsController } from './leaf-actuals.controller';

// @anchor leaf-actuals-module
@Module({
    imports: [PrismaModule],
    controllers: [LeafActualsController],
    providers: [LeafActualsService],
    exports: [LeafActualsService],
})
export class LeafActualsModule { }
