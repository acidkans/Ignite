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
import { UPLOADS_ROOT, uploadPath } from '../common/uploads.util';
import { FINANCIAL_TAB_CATEGORIES, STANDARD_TAB_CATEGORIES, orderFolderPath } from '../onedrive/order-folders';
const PDFParser = require('pdf2json');
// Największy PDF parsowany lokalnie (pdf2json w procesie backendu), gdy parser-service nie odpowiada.
const LOCAL_PDF_FALLBACK_MAX_BYTES = 3 * 1024 * 1024;
// Maksymalny czas odpowiedzi parser-service przy indeksowaniu dokumentu.
const PARSER_TIMEOUT_MS = 3 * 60 * 1000;

// @anchor document-uploaded-event
export interface DocumentUploadedEvent {
    documentId: string;
    nodeId: string;
    fileName: string;
    mimeType: string;
    storagePath: string; // względem UPLOADS_ROOT
    category: string | null;
    folderKey?: string;
}

@Injectable()
export class DocumentsService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => VectorService))
        private vectorService: VectorService,
        private httpService: HttpService,
        private configService: ConfigService
    ) { }

    // ── Highlights ────────────────────────────────────────────────────────────
    async listHighlights(documentId: string) {
        return this.prisma.documentHighlight.findMany({
            where: { documentId },
            orderBy: [{ page: 'asc' }, { createdAt: 'asc' }],
        });
    }

    async createHighlight(documentId: string, authorId: string | null, data: { page: number; rects: any; color?: string; comment?: string | null }) {
        if (typeof data.page !== 'number' || !data.rects) {
            throw new BadRequestException('page and rects are required');
        }
        return this.prisma.documentHighlight.create({
            data: {
                documentId,
                authorId,
                page: data.page,
                rects: data.rects,
                color: data.color || 'yellow',
                comment: data.comment ?? null,
            },
        });
    }

    async updateHighlight(id: string, data: { color?: string; comment?: string | null }) {
        const patch: any = {};
        if (data.color !== undefined) patch.color = data.color;
        if (data.comment !== undefined) patch.comment = data.comment;
        return this.prisma.documentHighlight.update({ where: { id }, data: patch });
    }

    async deleteHighlight(id: string) {
        await this.prisma.documentHighlight.delete({ where: { id } });
        return { ok: true };
    }

    // @anchor document-uploaded-listeners
    // Subskrybenci uploadu dokumentu (OneDriveSyncService wysyła plik do folderu zamówienia).
    // Callback zamiast importu modułu — OneDriveModule już zależy od DocumentsModule.
    private readonly uploadListeners: Array<(e: DocumentUploadedEvent) => Promise<void> | void> = [];

    onDocumentUploaded(fn: (e: DocumentUploadedEvent) => Promise<void> | void) {
        this.uploadListeners.push(fn);
    }

    // `oneDriveFolderKey` — katalog OneDrive inny niż wynikający z kategorii (raport AI → `NO_ONEDRIVE_FOLDER`, bez kopii na OneDrive).
    // `options.skipIndex` — bez parsowania i embeddingów (dokument wygenerowany przez aplikację, np. Opis
    // zakresu prac: indeksowanie PDF trwało >100 s i kończyło żądanie timeoutem 524 na Cloudflare).
    async processDocument(file: Express.Multer.File, nodeId: string, category?: string, oneDriveFolderKey?: string, options?: { skipIndex?: boolean }) {
        if (!file) throw new BadRequestException('No file provided');
        if (!nodeId) throw new BadRequestException('No nodeId provided');

        // Fix Polish characters encoding if needed
        const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');

        // Physical storage
        const uploadDir = UPLOADS_ROOT;
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
            try { await this.vectorService.deleteDocumentChunks(fileNode.id); } catch (e) { console.warn(`[DOCS] Vector delete (re-upload) non-fatal: ${e.message}`); }
            // Stary plik fizyczny — po podmianie nikt go już nie wskazuje (przy każdym re-uploadzie,
            // np. raporcie Analizy AI nadpisywanym przy każdej analizie, zostawał sierotą w uploads/).
            const previousStorage = fileNode.storagePath;
            if (previousStorage && previousStorage !== storageFileName) {
                try { fs.unlinkSync(uploadPath(previousStorage)); } catch (e) { console.warn(`[DOCS] Usunięcie starego pliku ${previousStorage} nieudane (non-fatal): ${e.message}`); }
            }
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
            fileNode = await this.createDocumentNode({
                nodeId,
                name: fileName,
                storagePath: storageFileName,
                mimeType: file.mimetype,
                fileSize: file.size,
                documentCategory: category || null,
            });
        }

        const chunks = options?.skipIndex ? 0 : await this.indexDocumentBuffer(fileNode.id, nodeId, fileName, file.buffer, file.mimetype);

        const event: DocumentUploadedEvent = {
            documentId: fileNode.id, nodeId, fileName, mimeType: file.mimetype,
            storagePath: storageFileName, category: category || null, folderKey: oneDriveFolderKey,
        };
        for (const fn of this.uploadListeners) {
            Promise.resolve().then(() => fn(event)).catch((e) => console.warn(`[DOCS] Listener uploadu: ${e?.message || e}`));
        }

        return {
            success: true,
            nodeId: fileNode.id,
            chunks,
            message: "File indexed successfully"
        };
    }

    // @anchor create-document-node
    // Węzeł dokumentu pod gałęzią + wpisy w closure table (bez nich dokument nie jest widoczny w drzewie).
    async createDocumentNode(data: { nodeId: string; name: string; storagePath: string; mimeType: string | null; fileSize: number | null; documentCategory: string | null }) {
        const fileNode = await this.prisma.processNode.create({
            data: {
                name: data.name,
                type: 'document',
                parentId: data.nodeId,
                ownerId: null,
                storagePath: data.storagePath,
                mimeType: data.mimeType,
                fileSize: data.fileSize,
                documentCategory: data.documentCategory,
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
            WHERE "descendantId" = ${data.nodeId}
        `;
        return fileNode;
    }

    // @anchor clear-document-index
    // Usuwa fragmenty dokumentu z Qdrant przed ponownym indeksowaniem nowej treści.
    async clearDocumentIndex(documentId: string) {
        try { await this.vectorService.deleteDocumentChunks(documentId); } catch (e) { console.warn(`[DOCS] Vector delete non-fatal: ${e.message}`); }
    }

    // @anchor index-document-buffer
    // Wyciąga tekst z pliku (PDF przez parser-service z fallbackiem pdf2json, DOCX przez mammoth)
    // i zapisuje fragmenty w Qdrant pod `documentId`. Zwraca liczbę fragmentów.
    // Wspólne dla uploadu z aplikacji i synchronizacji OneDrive.
    // `strict` — błąd zapisu do Qdrant jest rzucany dalej (synchronizacja OneDrive musi wiedzieć, że indeks nie powstał).
    async indexDocumentBuffer(documentId: string, nodeId: string, fileName: string, buffer: Buffer, mimetype: string, strict = false): Promise<number> {
        const file = { buffer, mimetype: mimetype || 'application/octet-stream' };
        const fileNode = { id: documentId };

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
                // Limit czasu: parser przy ciężkim PDF potrafi utknąć na swoim limicie pamięci,
                // a bez timeoutu stała cała kolejka OneDrive.
                const response = await firstValueFrom(
                    this.httpService.post(`${parserUrl}/parse`, formData, { timeout: PARSER_TIMEOUT_MS })
                );

                const data = response.data;
                const pdfText = cleanPdfText(data.text || '');

                console.log(`[DOCS] Python Parser response length: ${pdfText.length}`);
                console.log(`[DOCS] PDF text preview: ${pdfText.substring(0, 200)}`);

                text = `[Dokument PDF: ${fileName}]\n${pdfText}`;
            } catch (e) {
                // @anchor local-pdf-fallback-limit — pdf2json działa w procesie backendu (limit kontenera 1 GB);
                // ciężki PDF (schematy 5–11 MB) zabijał cały serwer, a kolejka OneDrive brała go po restarcie
                // od nowa. Duże pliki czekają na parser-service: w trybie strict (OneDrive) błąd → ponowienie
                // później, przy uploadzie z aplikacji dokument zostaje bez treści w indeksie.
                if (file.buffer.length > LOCAL_PDF_FALLBACK_MAX_BYTES) {
                    const msg = `Parser PDF niedostępny (${e.message}); plik ${(file.buffer.length / 1048576).toFixed(1)} MB za duży na parsowanie lokalne`;
                    console.warn(`[DOCS] ${msg} — ${fileName}`);
                    if (strict) throw new Error(msg);
                    text = `[Dokument PDF: ${fileName}] (${msg})`;
                } else try {
                console.warn(`[DOCS] Python service failed or unavailable: ${e.message}. Falling back to pdf2json.`);
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
        try {
            await this.vectorService.upsertDocuments(documentsPayload);
            console.log(`[DOCS] All chunks indexed successfully.`);
        } catch (e) {
            if (strict) throw new Error(`Indeks AI: ${e.message}`);
            console.warn(`[DOCS] Vector indexing failed (non-fatal): ${e.message}`);
        }

        return chunks.length;
    }

    // ─── RE-INDEKSOWANIE BEZ PONOWNEGO UPLOADU ────────────────────────────────

    async reindexDocument(documentId: string) {
        const doc = await this.prisma.processNode.findUnique({ where: { id: documentId } });
        if (!doc || doc.type !== 'document') throw new BadRequestException('Document not found');
        if (!doc.storagePath) throw new BadRequestException('No physical file — cannot re-index');

        const filePath = uploadPath(doc.storagePath);
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
        // Kategorie z katalogów OneDrive (ORDER_FOLDERS) trafiają do tej zakładki, do której należy ich katalog.
        if (category === 'financial') {
            where.documentCategory = { in: FINANCIAL_TAB_CATEGORIES };
        } else if (category === 'offer') {
            where.documentCategory = 'offer';
        } else if (category === 'standard' || !category) {
            where.OR = [{ documentCategory: null }, { documentCategory: { in: STANDARD_TAB_CATEGORIES } }];
        }

        const documents = await this.prisma.processNode.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        const driveFiles = documents.length
            ? await this.prisma.driveFile.findMany({ where: { documentId: { in: documents.map(d => d.id) } }, select: { documentId: true, webUrl: true, folderKey: true, scope: true, supplierId: true } })
            : [];
        const driveByDoc = new Map(driveFiles.map(f => [f.documentId, f]));

        return documents.map(doc => {
            let parsedPositions: any[] | null = null;
            if (doc.parsedPositions) {
                // Pole zapisywane jest jako czysty JSON (approveParsedPositions); base64 to fallback dla starych rekordów
                try {
                    parsedPositions = JSON.parse(doc.parsedPositions);
                } catch {
                    try {
                        const decoded = Buffer.from(doc.parsedPositions, 'base64').toString('utf-8');
                        parsedPositions = JSON.parse(decoded);
                    } catch {}
                }
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
                oneDrive: driveByDoc.has(doc.id)
                    ? {
                        webUrl: driveByDoc.get(doc.id).webUrl,
                        folderPath: driveByDoc.get(doc.id).scope === 'sharedOffers' ? 'Wspólne oferty' : orderFolderPath(driveByDoc.get(doc.id).folderKey),
                        supplierId: driveByDoc.get(doc.id).supplierId,
                    }
                    : null,
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
            documentCategory: doc.documentCategory,
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

        const filePath = uploadPath(doc.storagePath);
        if (!fs.existsSync(filePath)) {
            throw new BadRequestException('Physical file not found on server');
        }

        return {
            stream: fs.createReadStream(filePath),
            fileName: doc.name,
            mimeType: doc.mimeType || 'application/octet-stream'
        };
    }

    async renameDocument(documentId: string, fileName: string) {
        const name = String(fileName || '').trim();
        if (!name) throw new BadRequestException('Nazwa pliku nie może być pusta');
        const existing = await this.prisma.processNode.findUnique({ where: { id: documentId }, select: { id: true } });
        if (!existing) throw new BadRequestException('Dokument nie istnieje');

        await this.prisma.processNode.update({ where: { id: documentId }, data: { name } });

        // Zsynchronizuj nazwę w indeksie wektorowym, aby agent AI nadal widział poprawne źródło
        try {
            await this.vectorService.updateDocumentFileName(documentId, name);
        } catch (err) {
            console.warn(`[DOCS] Nie udało się zaktualizować nazwy w Qdrant dla ${documentId}:`, err?.message || err);
        }

        return { success: true, id: documentId, fileName: name };
    }

    // `fromSync` — usunięcie wywołane synchronizacją (plik skasowany na OneDrive). Usunięcie przez
    // użytkownika oznacza plik OneDrive jako `ignored`, żeby następna synchronizacja go nie odtworzyła.
    async deleteDocument(documentId: string, fromSync = false) {
        try {
            if (!fromSync) {
                await this.prisma.driveFile.updateMany({ where: { documentId }, data: { ignored: true, documentId: null } });
            }

            // 1. Delete from Qdrant (all chunks)
            try {
                await this.vectorService.deleteDocumentChunks(documentId);
            } catch (e) {
                console.warn(`[DOCS] Vector delete failed (non-fatal): ${e.message}`);
            }

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

    async extractPageText(documentId: string, page: number): Promise<{ text: string; pageNum: number }> {
        const doc = await this.prisma.processNode.findUnique({ where: { id: documentId } });
        if (!doc || !doc.storagePath) throw new BadRequestException('Document not found');

        const filePath = uploadPath(doc.storagePath);
        if (!fs.existsSync(filePath)) throw new BadRequestException('Physical file not found');

        const fileBuffer = fs.readFileSync(filePath);
        const parserUrl = this.configService.get<string>('PARSER_SERVICE_URL') || 'http://parser-service:8000';

        const formData = new FormData();
        const blob = new Blob([fileBuffer as any], { type: 'application/pdf' });
        formData.append('file', blob, doc.name || 'document.pdf');
        formData.append('mode', 'text');
        formData.append('page', String(page - 1)); // UI is 1-indexed, parser is 0-indexed

        const response = await firstValueFrom(this.httpService.post(`${parserUrl}/parse`, formData));
        return { text: response.data.text || '', pageNum: page };
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
