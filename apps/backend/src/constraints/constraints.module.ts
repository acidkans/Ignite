import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConstraintsService } from './constraints.service';
import { ConstraintsController } from './constraints.controller';

// @anchor constraints-module
@Module({
    imports: [PrismaModule],
    controllers: [ConstraintsController],
    providers: [ConstraintsService],
    exports: [ConstraintsService],
})
export class ConstraintsModule { }
