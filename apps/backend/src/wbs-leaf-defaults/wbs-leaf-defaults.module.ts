import { Module } from '@nestjs/common';
import { WbsLeafDefaultsService } from './wbs-leaf-defaults.service';
import { WbsLeafDefaultsController } from './wbs-leaf-defaults.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [WbsLeafDefaultsController],
    providers: [WbsLeafDefaultsService],
})
export class WbsLeafDefaultsModule { }
