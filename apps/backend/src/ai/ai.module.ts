import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VectorService } from './vector.service';
import { ProcessTreeModule } from '../process-tree/process-tree.module';
import { AiController } from './ai.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsModule } from '../documents/documents.module';
import { VersioningService } from './versioning.service';
import { BudgetService } from './budget.service';
import { DocxService } from './docx.service';
import { AiService } from './ai.service';

@Module({
    imports: [ConfigModule, ProcessTreeModule, PrismaModule, forwardRef(() => DocumentsModule)],
    controllers: [AiController],
    providers: [VectorService, VersioningService, BudgetService, DocxService, AiService],
    exports: [VectorService, VersioningService, BudgetService, DocxService, AiService],
})
export class AiModule { }
