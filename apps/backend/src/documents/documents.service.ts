import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VectorService } from '../ai/vector.service';
import { v4 as uuidv4 } from 'uuid';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as mammoth from 'mammoth';
import * as fs from 'fs';
import * as path from 'path';
const PDFParser = require('pdf2json');

@Injectable()
export class DocumentsService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => VectorService))
        private vectorService: VectorService,
        private httpService: HttpService,
        private configService: ConfigService
    ) { }

    async processDocument(file: Express.Multer.File, nodeId: string, category?: string) {
        if (!file) throw new BadRequestException('No file provided');
        if (!nodeId) throw new BadRequestException('No nodeId provided');

        // Fix Polish characters encoding if needed
        const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');

        // Physical storage
        const uploadDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const fileExtension = path.extname(fileName);
        const storageFileName = `${uuidv4()}${fileExtension}`;
        const storagePath = path.join(uploadDir, storageFileName);
        
        // Save file physically
        fs.writeFileSync(storagePath, file.buffer);

        // 1. Check if logical node already exists for this exact file under this project
        let fileNode = await this.prisma.processNode.findFirst({
            where: {
                name: fileName,
                type: 'document',
                parentId: nodeId,
            }
        });

        if (fileNode) {
            console.log(`[DOCS] Found existing file node: ${fileNode.id}, deleting its old chunks.`);
            await this.vectorService.deleteDocumentChunks(fileNode.id);
            // Update storage path, mime, size and category in case they changed
            await this.prisma.processNode.update({
                where: { id: fileNode.id },
                data: {
                    storagePath: storageFileName,
                    mimeType: file.mimetype,
                    fileSize: file.size,
                    documentCategory: category || null,
                }
            });
        } else {
            console.log(`[DOCS] Creating new file node for: ${fileName}`);
            fileNode = await this.prisma.processNode.create({
                data: {
                    name: fileName,
                    type: 'document',
                    parentId: nodeId,
                    ownerId: null,
                    storagePath: storageFileName,
                    mimeType: file.mimetype,
                    fileSize: file.size,
                    documentCategory: category || null,
                }
            });

            await this.prisma.processNodeClosure.create({
                data: { ancestorId: fileNode.id, descendantId: fileNode.id, depth: 0 }
            });

            // Connect to parent nodes
            await this.prisma.$executeRaw`
                INSERT INTO process_node_closure ("ancestorId", "descendantId", "depth")
                SELECT "ancestorId", ${fileNode.id}, "depth" + 1
                FROM process_node_closure
                WHERE "descendantId" = ${nodeId}
            `;
        }

        // 2. Extract text
        let text = '';
        if (file.mimetype === 'application/pdf') {
            try {
                const parserUrl = this.configService.get<string>('PARSER_SERVICE_URL') || 'http://parser-service:8000';

                // Prepare form data
                const formData = new FormData();
                const blob = new Blob([file.buffer as any], { type: file.mimetype });
                formData.append('file', blob, fileName);
                formData.append('mode', 'table'); // table mode preserves row/column structure

                // Call Python service
                const response = await firstValueFrom(
                    this.httpService.post(`${parserUrl}/parse`, formData)
                );

                const data = response.data;
                const pdfText = cleanPdfText(data.text || '');

                console.log(`[DOCS] Python Parser response length: ${pdfText.length}`);
                console.log(`[DOCS] PDF text preview: ${pdfText.substring(0, 200)}`);

                text = `[Dokument PDF: ${fileName}]\n${pdfText}`;
            } catch (e) {
                console.warn(`[DOCS] Python service failed or unavailable: ${e.message}. Falling back to pdf2json.`);
                try {
                    const parsedDataStr = await new Promise<string>((resolve, reject) => {
                        const pdfParser = new PDFParser(this, 1); // 1 is TEXT_ONLY mode
                        let isResolved = false;

                        pdfParser.on("pdfParser_dataError", errData => {
                            if (!isResolved) {
                                isResolved = true;
                                reject(errData.parserError);
                            }
                        });

                        pdfParser.on("pdfParser_dataReady", () => {
                            if (!isResolved) {
                                isResolved = true;
                                resolve(pdfParser.getRawTextContent() || '');
                            }
                        });

                        pdfParser.parseBuffer(file.buffer);
                    });

                    const pdfText = cleanPdfText(parsedDataStr);
                    text = `[Dokument PDF: ${fileName}]\n${pdfText}`;
                    console.log(`[DOCS] pdf2json fallback successful. Length: ${pdfText.length}`);
                } catch (fallbackError) {
                    console.error(`[DOCS] pdf2json fallback failed:`, fallbackError.message || fallbackError);
                    text = `[Dokument PDF: ${fileName}] (Błąd parsowania lokalnego: ${fallbackError.message || fallbackError})`;
                }
            }
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.mimetype === 'application/msword') {
            try {
                const result = await mammoth.extractRawText({ buffer: file.buffer });
                const docText = cleanPdfText(result.value || '');
                text = `[Dokument Word: ${fileName}]\n${docText}`;
                console.log(`[DOCS] mammoth extraction successful. Length: ${docText.length}`);
            } catch (e) {
                console.error(`[DOCS] mammoth parsing failed:`, e.message);
                text = `[Dokument Word: ${fileName}] (Błąd parsowania DOCX: ${e.message})`;
            }
        } else if (file.mimetype.startsWith('image/')) {
            text = `[Obraz: ${fileName}] (Brak treści tekstowej do indeksowania)`;
            console.log(`[DOCS] Skipping text extraction for image: ${fileName}`);
        } else {
            text = file.buffer.toString('utf-8');
        }

        console.log(`[DOCS] Indexing ${text.length} chars for node ${nodeId}`);

        // 3. Chunk and Index — paragraph-aware, larger chunks for better AI context
        const isImage = file.mimetype.startsWith('image/');
        const CHUNK_SIZE = 3000;
        const OVERLAP = 300;
        const chunks: string[] = [];

        if (isImage) {
            chunks.push(text);
        } else {
            // Paragraph-aware chunking: split at paragraph boundaries first
            const paragraphs = text.split(/\n\n+/);
            let current = '';
            for (const para of paragraphs) {
                const candidate = current ? `${current}\n\n${para}` : para;
                if (candidate.length <= CHUNK_SIZE) {
                    current = candidate;
                } else {
                    if (current) {
                        chunks.push(current);
                        // Overlap: keep tail of previous chunk as start of next
                        current = current.slice(-OVERLAP) + '\n\n' + para;
                    } else {
                        // Single paragraph longer than CHUNK_SIZE — split by chars
                        for (let i = 0; i < para.length; i += (CHUNK_SIZE - OVERLAP)) {
                            chunks.push(para.slice(i, i + CHUNK_SIZE));
                            if (i + CHUNK_SIZE >= para.length) break;
                        }
                        current = '';
                    }
                }
            }
            if (current.trim()) chunks.push(current);
        }


        const documentsPayload = chunks.map((chunk, i) => ({
            id: uuidv4(),
            text: chunk,
            metadata: {
                nodeId: fileNode.id,
                parentId: nodeId,
                fileId: fileNode.id,
                fileName: fileName,
                chunkIndex: i
            }
        }));

        console.log(`[DOCS] Upserting ${documentsPayload.length} chunks to Qdrant...`);
        await this.vectorService.upsertDocuments(documentsPayload);
        console.log(`[DOCS] All chunks indexed successfully.`);

        return {
            success: true,
            nodeId: fileNode.id,
            chunks: chunks.length,
            message: "File indexed successfully"
        };
    }

    // ─── RE-INDEKSOWANIE BEZ PONOWNEGO UPLOADU ────────────────────────────────

    async reindexDocument(documentId: string) {
        const doc = await this.prisma.processNode.findUnique({ where: { id: documentId } });
        if (!doc || doc.type !== 'document') throw new BadRequestException('Document not found');
        if (!doc.storagePath) throw new BadRequestException('No physical file — cannot re-index');

        const filePath = path.join(process.cwd(), 'uploads', doc.storagePath);
        if (!fs.existsSync(filePath)) throw new BadRequestException('Physical file not found on disk');

        const fileBuffer = fs.readFileSync(filePath);
        const mimeType = doc.mimeType || 'application/pdf';
        const fileName = doc.name;

        // Symuluj Express.Multer.File
        const fakeFile: Express.Multer.File = {
            buffer: fileBuffer,
            mimetype: mimeType,
            originalname: Buffer.from(fileName, 'utf-8').toString('latin1'),
            fieldname: 'file',
            encoding: '7bit',
            size: fileBuffer.length,
            stream: null as any,
            destination: '',
            filename: '',
            path: filePath,
        };

        console.log(`[DOCS] Re-indexing document: ${fileName} (${fileBuffer.length} bytes)`);
        await this.vectorService.deleteDocumentChunks(documentId);

        // Wyciągnij tekst
        let text = '';
        if (mimeType === 'application/pdf') {
            try {
                const parserUrl = this.configService.get<string>('PARSER_SERVICE_URL') || 'http://parser-service:8000';
                const formData = new FormData();
                const blob = new Blob([fileBuffer as any], { type: mimeType });
                formData.append('file', blob, fileName);
                formData.append('mode', 'table');
                const response = await firstValueFrom(this.httpService.post(`${parserUrl}/parse`, formData));
                const pdfText = cleanPdfText(response.data.text || '');
                text = `[Dokument PDF: ${fileName}]\n${pdfText}`;
                console.log(`[DOCS] Re-index parser response: ${pdfText.length} znaków`);
            } catch (e) {
                console.warn(`[DOCS] Re-index parser failed: ${e.message}`);
                text = `[Dokument PDF: ${fileName}] (Błąd parsowania)`;
            }
        } else if (mimeType.includes('word')) {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            text = `[Dokument Word: ${fileName}]\n${cleanPdfText(result.value || '')}`;
        } else {
            text = fileBuffer.toString('utf-8');
        }

        // Chunk paragraph-aware
        const CHUNK_SIZE = 3000;
        const OVERLAP = 300;
        const chunks: string[] = [];
        const paragraphs = text.split(/\n\n+/);
        let current = '';
        for (const para of paragraphs) {
            const candidate = current ? `${current}\n\n${para}` : para;
            if (candidate.length <= CHUNK_SIZE) {
                current = candidate;
            } else {
                if (current) { chunks.push(current); current = current.slice(-OVERLAP) + '\n\n' + para; }
                else {
                    for (let i = 0; i < para.length; i += (CHUNK_SIZE - OVERLAP)) {
                        chunks.push(para.slice(i, i + CHUNK_SIZE));
                        if (i + CHUNK_SIZE >= para.length) break;
                    }
                    current = '';
                }
            }
        }
        if (current.trim()) chunks.push(current);

        const documentsPayload = chunks.map((chunk, i) => ({
            id: require('uuid').v4(),
            text: chunk,
            metadata: { nodeId: documentId, parentId: doc.parentId, fileId: documentId, fileName, chunkIndex: i }
        }));

        console.log(`[DOCS] Re-index: upserting ${chunks.length} chunks`);
        await this.vectorService.upsertDocuments(documentsPayload);

        return { success: true, documentId, chunks: chunks.length, message: 'Re-indexed successfully' };
    }

    async reindexAllByNode(nodeId: string) {
        const docs = await this.prisma.processNode.findMany({
            where: { parentId: nodeId, type: 'document', storagePath: { not: null } },
        });
        const results = [];
        for (const doc of docs) {
            try {
                const r = await this.reindexDocument(doc.id);
                results.push({ documentId: doc.id, name: doc.name, ...r });
            } catch (e) {
                results.push({ documentId: doc.id, name: doc.name, success: false, error: e.message });
            }
        }
        return { reindexed: results.filter(r => r.success).length, total: docs.length, results };
    }

    async reindexAll() {
        const docs = await this.prisma.processNode.findMany({
            where: { type: 'document', storagePath: { not: null } },
        });
        const results = [];
        for (const doc of docs) {
            try {
                const r = await this.reindexDocument(doc.id);
                results.push({ documentId: doc.id, name: doc.name, ...r });
                await new Promise(res => setTimeout(res, 3000)); // avoid rate limits
            } catch (e) {
                results.push({ documentId: doc.id, name: doc.name, success: false, error: e.message });
                await new Promise(res => setTimeout(res, 5000)); // longer wait after error
            }
        }
        return { reindexed: results.filter(r => r.success).length, total: docs.length, results };
    }

    async getDocumentsByNode(nodeId: string, category?: string) {
        const where: any = { parentId: nodeId, type: 'document' };
        if (category === 'financial') {
            where.documentCategory = 'financial';
        } else if (category === 'offer') {
            where.documentCategory = 'offer';
        } else if (category === 'standard' || !category) {
            where.OR = [{ documentCategory: null }, { documentCategory: 'standard' }, { documentCategory: '' }];
        }

        const documents = await this.prisma.processNode.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        return documents.map(doc => {
            let parsedPositions: any[] | null = null;
            if (doc.parsedPositions) {
                try {
                    const decoded = Buffer.from(doc.parsedPositions, 'base64').toString('utf-8');
                    parsedPositions = JSON.parse(decoded);
                } catch {}
            }
            return {
                id: doc.id,
                fileName: doc.name,
                uploadedAt: doc.createdAt,
                nodeId: doc.id,
                mimeType: doc.mimeType,
                fileSize: doc.fileSize,
                documentCategory: doc.documentCategory,
                parsedPositions,
            };
        });
    }

    async getDocumentsByNodeTree(nodeId: string) {
        // All descendants of this node (including itself) via closure table
        const closureEntries = await this.prisma.processNodeClosure.findMany({
            where: { ancestorId: nodeId },
            select: { descendantId: true },
        });
        const ids = closureEntries.map(e => e.descendantId);

        // Find all document nodes that are descendants
        const documents = await this.prisma.processNode.findMany({
            where: { id: { in: ids }, type: 'document' },
            include: { parent: { select: { id: true, name: true, type: true, customTypeLabel: true } } },
            orderBy: { createdAt: 'desc' },
        });

        return documents.map(doc => ({
            id: doc.id,
            fileName: doc.name,
            uploadedAt: doc.createdAt,
            nodeId: doc.id,
            mimeType: doc.mimeType,
            fileSize: doc.fileSize,
            nodeName: (doc.parent as any)?.name || null,
            nodeType: (doc.parent as any)?.type || null,
            nodeCustomLabel: (doc.parent as any)?.customTypeLabel || null,
            nodeParentId: doc.parentId,
        }));
    }

    async getFileStream(documentId: string) {
        const doc = await this.prisma.processNode.findUnique({
            where: { id: documentId }
        });

        if (!doc || !doc.storagePath) {
            throw new BadRequestException('Document not found or has no storage path');
        }

        const filePath = path.join(process.cwd(), 'uploads', doc.storagePath);
        if (!fs.existsSync(filePath)) {
            throw new BadRequestException('Physical file not found on server');
        }

        return {
            stream: fs.createReadStream(filePath),
            fileName: doc.name,
            mimeType: doc.mimeType || 'application/octet-stream'
        };
    }

    async deleteDocument(documentId: string) {
        try {
            // 1. Delete from Qdrant (all chunks)
            await this.vectorService.deleteDocumentChunks(documentId);

            // 2. Delete from closure table (foreign key constraint)
            await this.prisma.processNodeClosure.deleteMany({
                where: {
                    OR: [
                        { ancestorId: documentId },
                        { descendantId: documentId }
                    ]
                }
            });

            // 3. Delete from database
            await this.prisma.processNode.delete({
                where: { id: documentId }
            });

            return {
                success: true,
                message: 'Document deleted successfully'
            };
        } catch (error) {
            console.error(`[DOCS] Failed to delete document ${documentId}:`, error);
            throw new BadRequestException(`Failed to delete document: ${error.message}`);
        }
    }

    async getParsedPositions(documentId: string) {
        const doc = await this.prisma.processNode.findUnique({ where: { id: documentId }, select: { parsedPositions: true } });
        if (!doc) return null;
        if (!doc.parsedPositions) return null;
        try { return JSON.parse(doc.parsedPositions); } catch { return null; }
    }

    async approveParsedPositions(documentId: string, positions: any[]) {
        const posJson = JSON.stringify(positions);
        await this.prisma.processNode.update({
            where: { id: documentId },
            data: { parsedPositions: posJson },
        });
        // Synchronizuj pozycje (z dataSheetUrl) do powiązanego rekordu Offer
        await this.prisma.offer.updateMany({
            where: { documentId },
            data: { positions: posJson },
        }).catch(() => {});
        return { ok: true };
    }

    async resetDatabase() {
        try {
            console.log('[DOCS] Resetting Qdrant database...');
            await this.vectorService.deleteAllChunks();

            return {
                success: true,
                message: 'All vector data has been wiped.'
            };
        } catch (error) {
            console.error(`[DOCS] Failed to reset database:`, error);
            throw new BadRequestException(`Failed to reset database: ${error.message}`);
        }
    }
}



/**
 * Clean and normalize text extracted from PDFs.
 * - Unicode normalization (NFKC)
 * - Removes control characters
 * - Normalizes whitespace
 * - Fixes common UTF-8 mojibake (Polish + German) ONLY if detected
 */
export function cleanPdfText(input: string): string {
    if (!input) return '';

    let text = input;

    /* ----------------------------------
     * 1. Unicode normalization
     * ---------------------------------- */
    try {
        text = text.normalize('NFKC');
    } catch {
        // older Node versions – ignore
    }

    /* ----------------------------------
     * 2. Remove control characters & Artifacts
     * ---------------------------------- */
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Remove sequences of dots (tables of contents) and underscores
    text = text.replace(/\.{3,}/g, ' ');
    text = text.replace(/_{3,}/g, ' ');

    /* ----------------------------------
     * 3. Normalize whitespace
     * ---------------------------------- */
    text = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    /* ----------------------------------
     * 4. Detect mojibake (heuristic)
     * ---------------------------------- */
    const mojibakePattern = /[ÃÅÂÄ]/;
    if (!mojibakePattern.test(text)) {
        return text;
    }

    /* ----------------------------------
     * 5. Fix common UTF-8 mojibake
     * (Polish + German)
     * ---------------------------------- */
    const fixes: Record<string, string> = {
        // Polish
        'Å¼': 'ż', 'Å»': 'Ż',
        'Å‚': 'ł', 'Å ': 'Ł',
        'Å›': 'ś', 'Åš': 'Ś',
        'Ä…': 'ą', 'Ä„': 'Ą',
        'Ä‡': 'ć', 'Ä†': 'Ć',
        'Ä™': 'ę', 'Ä˜': 'Ę',
        'Å„': 'ń',
        'Åƒ': 'Ń', 'Ã³': 'ó',
        'Ã“': 'Ó',

        // German
        'Ã¤': 'ä', 'Ã„': 'Ä',
        'Ã¶': 'ö', 'Ã–': 'Ö',
        'Ã¼': 'ü', 'Ãœ': 'Ü',
        'ÃŸ': 'ß',
    };

    for (const [bad, good] of Object.entries(fixes)) {
        text = text.split(bad).join(good);
    }

    return text;
}
