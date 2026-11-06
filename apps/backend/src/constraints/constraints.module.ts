import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConstraintsService } from './constraints.service';
import { ConstraintsController } from './constraints.controller';
import { UserTasksModule } from '../user-tasks/user-tasks.module';

// @anchor constraints-module
@Module({
    imports: [PrismaModule, UserTasksModule],
    controllers: [ConstraintsController],
    providers: [ConstraintsService],
    exports: [ConstraintsService],
})
export class ConstraintsModule { }
