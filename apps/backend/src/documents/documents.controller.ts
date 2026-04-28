import { Controller, Post, Get, Delete, Patch, UseInterceptors, UploadedFile, Body, Param, Query, UseGuards, Res, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { Multer } from 'multer';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('documents')
export class DocumentsController {
    constructor(private readonly documentsService: DocumentsService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @Body('nodeId') nodeId: string,
        @Body('category') category?: string
    ) {
        console.log(`[UPLOAD] Processing file: ${file.originalname} for node: ${nodeId}, category: ${category}`);
        return this.documentsService.processDocument(file, nodeId, category);
    }

    @Get('node/:nodeId')
    async getNodeDocuments(@Param('nodeId') nodeId: string, @Query('category') category?: string) {
        return this.documentsService.getDocumentsByNode(nodeId, category);
    }

    @Get('tree/:nodeId')
    async getTreeDocuments(@Param('nodeId') nodeId: string) {
        return this.documentsService.getDocumentsByNodeTree(nodeId);
    }

    @Get('download/:id')
    async downloadDocument(@Param('id') id: string, @Res() res: Response) {
        const { stream, fileName, mimeType } = await this.documentsService.getFileStream(id);

        const encodedFileName = encodeURIComponent(fileName);
        res.set({
            'Content-Type': mimeType,
            'Content-Disposition': `inline; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`,
        });

        stream.on('error', (err) => {
            console.error('[DOWNLOAD] Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'File stream error' });
            }
        });

        stream.pipe(res);
    }

    @Post('reindex/:id')
    async reindexDocument(@Param('id') id: string) {
        return this.documentsService.reindexDocument(id);
    }

    @Post('reindex-all/:nodeId')
    async reindexAll(@Param('nodeId') nodeId: string) {
        return this.documentsService.reindexAllByNode(nodeId);
    }

    @Post('reindex-all')
    async reindexAllGlobal() {
        return this.documentsService.reindexAll();
    }

    @Delete('reset/all')
    async resetAll() {
        console.log('[DELETE] Resetting database...');
        return this.documentsService.resetDatabase();
    }

    @Get(':id/parsed-positions')
    async getParsedPositions(@Param('id') id: string) {
        return this.documentsService.getParsedPositions(id);
    }

    // ── Highlights ────────────────────────────────────────────────────────────
    @Get(':id/highlights')
    async listHighlights(@Param('id') id: string) {
        return this.documentsService.listHighlights(id);
    }

    @Post(':id/highlights')
    @UseGuards(JwtAuthGuard)
    async createHighlight(
        @Param('id') id: string,
        @Body() body: { page: number; rects: any; color?: string; comment?: string | null },
        @Request() req: any,
    ) {
        return this.documentsService.createHighlight(id, req?.user?.userId ?? null, body);
    }

    @Patch(':id/highlights/:hid')
    @UseGuards(JwtAuthGuard)
    async updateHighlight(
        @Param('hid') hid: string,
        @Body() body: { color?: string; comment?: string | null },
    ) {
        return this.documentsService.updateHighlight(hid, body);
    }

    @Delete(':id/highlights/:hid')
    @UseGuards(JwtAuthGuard)
    async deleteHighlight(@Param('hid') hid: string) {
        return this.documentsService.deleteHighlight(hid);
    }

    @Patch(':id/parsed-positions')
    async approveParsedPositions(@Param('id') id: string, @Body('positions') positions: any[]) {
        return this.documentsService.approveParsedPositions(id, positions);
    }

    @Patch(':id')
    async renameDocument(@Param('id') id: string, @Body('fileName') fileName: string) {
        return this.documentsService.renameDocument(id, fileName);
    }

    @Delete(':id')
    async deleteDocument(@Param('id') id: string) {
        if (id === 'reset') {
            console.log('[DELETE] Resetting database...');
            return this.documentsService.resetDatabase();
        }
        console.log(`[DELETE] Deleting document: ${id}`);
        return this.documentsService.deleteDocument(id);
    }
}
