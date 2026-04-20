import { Module } from '@nestjs/common';
import { HardwareService } from './hardware.service';
import { HardwareController } from './hardware.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [HardwareController],
    providers: [HardwareService],
})
export class HardwareModule { }
