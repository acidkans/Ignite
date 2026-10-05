import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { DocumentsModule } from '../documents/documents.module';
import { PdfModule } from '../pdf/pdf.module';
import { ScopeDocumentsController } from './scope-documents.controller';
import { ScopeDocumentsService } from './scope-documents.service';

// @anchor scope-documents-module
@Module({
    imports: [PrismaModule, forwardRef(() => AiModule), forwardRef(() => DocumentsModule), PdfModule],
    controllers: [ScopeDocumentsController],
    providers: [ScopeDocumentsService],
})
export class ScopeDocumentsModule { }
