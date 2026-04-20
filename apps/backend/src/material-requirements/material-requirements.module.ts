import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ConfigModule } from '@nestjs/config';
import { ProcessTreeModule } from '../process-tree/process-tree.module';
import { MaterialRequirementsController } from './material-requirements.controller';
import { MaterialRequirementsService } from './material-requirements.service';

@Module({
    imports: [PrismaModule, forwardRef(() => AiModule), ConfigModule, ProcessTreeModule],
    controllers: [MaterialRequirementsController],
    providers: [MaterialRequirementsService],
    exports: [MaterialRequirementsService],
})
export class MaterialRequirementsModule { }
