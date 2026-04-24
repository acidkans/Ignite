import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { HfInference } from '@huggingface/inference';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { randomUUID, createHash } from 'crypto';

// Generuje deterministyczny UUID v4-format z prefiksu i ID
function makeUUID(prefix: string, id: string): string {
    const hash = createHash('md5').update(`${prefix}:${id}`).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

@Injectable()
export class VectorService implements OnModuleInit {
    private readonly logger = new Logger(VectorService.name);
    private genAI: GoogleGenerativeAI;
    private hf: HfInference;
    private groq: Groq;
    private openai: OpenAI;
    private qdrant: QdrantClient;
    private readonly collectionName = 'erp_documents';
    private embeddingModel: string;

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
        @Inject(forwardRef(() => DocumentsService))
        private documentsService: DocumentsService,
    ) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        const hfKey = this.configService.get<string>('HUGGING_FACE_API_KEY');
        const groqKey = this.configService.get<string>('GROQ_API_KEY');
        const openaiKey = this.configService.get<string>('OPENAI_API_KEY') || this.configService.get<string>('CHATGPT_API_KEY');
        const qdrantUrl = this.configService.get<string>('VECTOR_DB_URL');
        const qdrantApiKey = this.configService.get<string>('VECTOR_DB_API_KEY');

        this.embeddingModel = this.configService.get<string>('EMBEDDING_MODEL') || 'text-embedding-004';

        if (apiKey) this.genAI = new GoogleGenerativeAI(apiKey);
        if (hfKey) this.hf = new HfInference(hfKey);
        if (groqKey) this.groq = new Groq({ apiKey: groqKey });
        if (openaiKey) this.openai = new OpenAI({ apiKey: openaiKey });

        this.qdrant = new QdrantClient({
            url: qdrantUrl,
            apiKey: qdrantApiKey,
            timeout: 60000, // 60s timeout
        });
    }

    async onModuleInit() {
        const isNew = await this.ensureCollectionExists();
        if (isNew) {
            this.logger.log('[Init] Nowa kolekcja — uruchamiam reindex-all dokumentów...');
            this.documentsService.reindexAll().then(r =>
                this.logger.log(`[Init] Reindex zakończony: ${r.reindexed}/${r.total}`)
            ).catch(e =>
                this.logger.error(`[Init] Reindex błąd: ${e.message}`)
            );
        }
    }

    /**
     * Zwraca aktualną konfigurację AI (nazwy modeli)
     */
    getConfig() {
        return {
            aiModel: this.configService.get<string>('AI_MODEL') || 'unknown',
            embeddingModel: this.embeddingModel,
        };
    }

    private async ensureCollectionExists(): Promise<boolean> {
        try {
            const collections = await this.qdrant.getCollections();
            const exists = collections.collections.some(c => c.name === this.collectionName);

            const isGeminiNew = this.embeddingModel.includes('gemini-embedding');
            const isGoogleLegacy = this.embeddingModel.includes('text-embedding-004');
            const isOpenAI = this.embeddingModel.includes('text-embedding-3') || this.embeddingModel.includes('ada-002');

            let dim = 384;
            if (isGeminiNew) dim = 3072;
            if (isGoogleLegacy) dim = 768;
            if (isOpenAI) dim = 1536;

            if (!exists) {
                this.logger.log(`Creating Qdrant collection: ${this.collectionName} (dim: ${dim})`);
                await this.qdrant.createCollection(this.collectionName, {
                    vectors: { size: dim, distance: 'Cosine' },
                });
                this.logger.log(`Creating payload index for 'text' field...`);
                await this.qdrant.createPayloadIndex(this.collectionName, { field_name: 'text', field_schema: 'keyword' });
                this.logger.log(`Creating payload index for 'nodeId' field...`);
                await this.qdrant.createPayloadIndex(this.collectionName, { field_name: 'nodeId', field_schema: 'keyword' });
                this.logger.log(`Creating payload index for 'parentId' field...`);
                await this.qdrant.createPayloadIndex(this.collectionName, { field_name: 'parentId', field_schema: 'keyword' });
                this.logger.log(`Payload indexes created successfully`);
                return true;
            } else {
                const collectionInfo = await this.qdrant.getCollection(this.collectionName);
                // @ts-ignore
                const existingDim = collectionInfo.config?.params?.vectors?.size || collectionInfo.config?.params?.vectors?.default?.size;

                if (existingDim && existingDim !== dim) {
                    this.logger.warn(`Collection ${this.collectionName} exists but dimension mismatch (Existing: ${existingDim}, Required: ${dim}). Recreating...`);
                    await this.qdrant.deleteCollection(this.collectionName);
                    await this.qdrant.createCollection(this.collectionName, {
                        vectors: { size: dim, distance: 'Cosine' },
                    });
                    await this.qdrant.createPayloadIndex(this.collectionName, { field_name: 'text', field_schema: 'keyword' });
                    this.logger.log(`Collection recreated with correct dimensions.`);
                    return true;
                } else {
                    this.logger.log(`Collection ${this.collectionName} verified (dim: ${dim}).`);
                    try {
                        await this.qdrant.createPayloadIndex(this.collectionName, { field_name: 'text', field_schema: 'keyword' });
                        await this.qdrant.createPayloadIndex(this.collectionName, { field_name: 'nodeId', field_schema: 'keyword' });
                        await this.qdrant.createPayloadIndex(this.collectionName, { field_name: 'parentId', field_schema: 'keyword' });
                    } catch (err) {
                        // Index might already exist
                    }
                    return false;
                }
            }
        } catch (error) {
            this.logger.error('Failed to connect to Qdrant or create collection', error.stack);
            return false;
        }
    }

    /**
     * Generuje embedding (wektor)
     */
    async generateEmbedding(text: string): Promise<number[]> {
        this.logger.log(`[Embedding] Generating for text length: ${text.length}, Model: ${this.embeddingModel}`);

        // OpenAI
        if ((this.embeddingModel.includes('text-embedding-3') || this.embeddingModel.includes('ada-002'))) {
            if (this.openai) {
                try {
                    const response = await this.openai.embeddings.create({
                        model: this.embeddingModel,
                        input: text,
                    });
                    const embedding = response.data[0].embedding;
                    this.logger.log(`[Embedding] Generated vector dim: ${embedding.length} via OpenAI`);
                    return embedding;
                } catch (err) {
                    this.logger.error(`[Embedding] OpenAI Error: ${err.message}`);
                    throw err;
                }
            } else {
                this.logger.error(`[Embedding] OpenAI model selected but client NOT initialized! Key missing?`);
            }
        }

        // Google (text-embedding-004 przemianowany na gemini-embedding-001)
        if ((this.embeddingModel.includes('text-embedding-004') || this.embeddingModel.includes('gemini-embedding')) && this.genAI) {
            try {
                const model = this.genAI.getGenerativeModel({ model: this.embeddingModel }, { apiVersion: 'v1beta' });
                const result = await model.embedContent(text);
                return result.embedding.values;
            } catch (err) {
                this.logger.error(`[Google Embedding] Error with ${this.embeddingModel}: ${err.message}`);
                throw err;
            }
        }

        // Hugging Face
        if (this.hf) {
            const result = await this.hf.featureExtraction({
                model: this.embeddingModel,
                inputs: text,
            });
            // Result can be nested array or flat. Usually flat for single string.
            // HF types are loosely typed, cast as needed.
            return result as unknown as number[];
        }
        throw new Error('No valid embedding provider configured.');
    }

    /**
     * Zapisuje fragment dokumentu w bazie wektorowej
     */
    async upsertDocument(params: {
        id: string; // UUID dokumentu/fragmentu
        text: string;
        metadata: {
            nodeId: string;
            fileName: string;
            chunkIndex: number;
            [key: string]: any;
        };
    }) {
        const vector = await this.generateEmbedding(params.text);

        await this.qdrant.upsert(this.collectionName, {
            wait: true,
            points: [
                {
                    id: params.id,
                    vector: vector,
                    payload: {
                        text: params.text,
                        ...params.metadata,
                    },
                },
            ],
        });
    }

    /**
     * Batch upsert documents
     */
    async upsertDocuments(items: Array<{
        id: string;
        text: string;
        metadata: any;
    }>) {
        if (items.length === 0) return;

        await this.ensureCollectionExists();

        // Generate embeddings in parallel
        const points = await Promise.all(items.map(async (item) => {
            const vector = await this.generateEmbedding(item.text);
            return {
                id: item.id,
                vector: vector,
                payload: {
                    text: item.text,
                    ...item.metadata,
                }
            };
        }));

        await this.qdrant.upsert(this.collectionName, {
            wait: true,
            points: points,
        });
    }

    /**
     * Aktualizuje nazwę pliku w payloadzie wszystkich chunków dokumentu (po rename).
     * Dzięki temu agent AI nadal widzi właściwą nazwę bez pełnej reindeksacji.
     */
    async updateDocumentFileName(documentId: string, fileName: string) {
        try {
            await this.qdrant.setPayload(this.collectionName, {
                wait: true,
                payload: { fileName },
                filter: {
                    must: [{ key: 'nodeId', match: { value: documentId } }],
                },
            });
            this.logger.log(`[Qdrant] Updated fileName for document ${documentId} → ${fileName}`);
        } catch (error) {
            this.logger.error(`[Qdrant] Failed to update fileName for ${documentId}`, error.stack);
            throw error;
        }
    }

    /**
     * Usuwa wszystkie chunki dokumentu z bazy wektorowej
     */
    async deleteDocumentChunks(documentId: string) {
        try {
            await this.qdrant.delete(this.collectionName, {
                filter: {
                    must: [
                        { key: 'nodeId', match: { value: documentId } }  // Changed from documentId to nodeId
                    ]
                }
            });
            this.logger.log(`[Qdrant] Deleted all chunks for document: ${documentId}`);
        } catch (error) {
            this.logger.error(`[Qdrant] Failed to delete chunks for document ${documentId}`, error.stack);
            throw error;
        }
    }

    /**
     * Usuwa WSZYSTKIE chunki z kolekcji (czyszczenie bazy)
     */
    async deleteAllChunks() {
        try {
            // Delete entire collection and recreate it
            await this.qdrant.deleteCollection(this.collectionName);
            this.logger.log(`[Qdrant] Deleted collection: ${this.collectionName}`);

            // Recreate collection
            await this.ensureCollectionExists();
            this.logger.log(`[Qdrant] Recreated collection: ${this.collectionName}`);

            return { success: true, message: 'All chunks deleted successfully' };
        } catch (error) {
            this.logger.error(`[Qdrant] Failed to delete all chunks`, error.stack);
            throw error;
        }
    }

    /**
     * Scrolluje WSZYSTKIE chunki dla podanych nodeId (bez limitu semantycznego).
     * Używane do ekstrakcji — nie pomija żadnych fragmentów dokumentów.
     */
    async scrollAllChunksByNodes(nodeIds: string[], excludeTypes: string[] = []): Promise<any[]> {
        const allPoints: any[] = [];
        let offset: string | number | Record<string, unknown> | null = null;
        const batchSize = 100;

        do {
            const result = await this.qdrant.scroll(this.collectionName, {
                filter: {
                    must: [{ key: 'nodeId', match: { any: nodeIds } }],
                    must_not: excludeTypes.length > 0
                        ? [{ key: 'sourceType', match: { any: excludeTypes } }]
                        : [],
                },
                limit: batchSize,
                offset: offset ?? undefined,
                with_payload: true,
                with_vector: false,
            });
            allPoints.push(...(result.points || []));
            offset = result.next_page_offset ?? null;
        } while (offset !== null && offset !== undefined);

        this.logger.log(`[ScrollAll] Pobrano ${allPoints.length} chunków dla ${nodeIds.length} węzłów`);
        return allPoints;
    }

    /**
     * Wywołuje model AI z surowym promptem — bez opakowywania w kontekst ERP.
     * Używane do ekstrakcji JSON i innych zadań strukturalnych.
     */
    async generateRaw(prompt: string): Promise<string> {
        const modelName = this.configService.get<string>('AI_MODEL');
        this.logger.log(`[GenerateRaw] model: ${modelName}, prompt length: ${prompt.length}`);

        if (modelName.startsWith('gpt') && this.openai) {
            const completion = await this.openai.chat.completions.create({
                model: modelName,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 16000,
                temperature: 0.1,
            });
            return completion.choices[0].message.content || '';
        }

        if ((modelName.includes('gemini') || modelName.includes('text-embedding')) && this.genAI) {
            const model = this.genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return result.response.text();
        }

        if ((modelName.startsWith('llama') || modelName.startsWith('mixtral') || modelName.startsWith('openai/') || modelName.startsWith('qwen/')) && this.groq) {
            const completion = await this.groq.chat.completions.create({
                model: modelName,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 16000,
                temperature: 0.1,
            });
            return completion.choices[0]?.message?.content || '';
        }

        throw new Error(`Brak obsługiwanego providera AI dla modelu: ${modelName}`);
    }

    /**
     * Pobiera sąsiednie chunki (X-1 i X+1) dla wyników wyszukiwania.
     * Uzupełnia kontekst AI gdy specyfikacja jest podzielona między fragmenty.
     */
    async fetchNeighborChunks(results: any[]): Promise<any[]> {
        const neighbors: any[] = [];
        const existingIds = new Set(results.map(r => String(r.id)));

        // Grupuj po nodeId — każdy dokument ma swój nodeId
        const docGroups = new Map<string, { nodeId: string; fileName: string; indices: Set<number> }>();

        for (const r of results) {
            const { nodeId, fileName, chunkIndex } = r.payload || {};
            if (chunkIndex === undefined || chunkIndex === null) continue;
            const key = `${nodeId}::${fileName}`;
            if (!docGroups.has(key)) {
                docGroups.set(key, { nodeId, fileName, indices: new Set() });
            }
            docGroups.get(key)!.indices.add(Number(chunkIndex));
        }

        for (const [, group] of docGroups) {
            try {
                // Pobierz wszystkie chunki danego dokumentu (filtr po nodeId — jest indeksowany)
                const scrollResult = await this.qdrant.scroll(this.collectionName, {
                    filter: { must: [{ key: 'nodeId', match: { value: group.nodeId } }] },
                    limit: 100,
                    with_payload: true,
                    with_vector: false,
                });

                const allChunks = (scrollResult.points || []).filter(
                    p => p.payload?.fileName === group.fileName
                );

                // Wyznacz indeksy sąsiadów
                const targetIndices = new Set<number>();
                for (const idx of group.indices) {
                    if (idx > 0) targetIndices.add(idx - 1);
                    targetIndices.add(idx + 1);
                }

                for (const chunk of allChunks) {
                    const ci = Number(chunk.payload?.chunkIndex);
                    if (targetIndices.has(ci) && !existingIds.has(String(chunk.id))) {
                        neighbors.push({ ...chunk, score: 0, isNeighbor: true });
                        existingIds.add(String(chunk.id));
                    }
                }
            } catch (err) {
                this.logger.warn(`[Neighbors] Błąd pobierania sąsiadów dla ${group.fileName}: ${err.message}`);
            }
        }

        this.logger.log(`[Neighbors] Dodano ${neighbors.length} sąsiednich chunków`);
        return neighbors;
    }

    /**
     * Wyszukuje najbardziej pasujące fragmenty dokumentów
     */
    async searchSimilar(query: string, filter?: any, limit = 5) {
        const vector = await this.generateEmbedding(query);

        return this.qdrant.search(this.collectionName, {
            vector: vector,
            filter: filter,
            limit: limit,
            with_payload: true,
        });
    }

    /**
     * Ekstrahuje słowa kluczowe z tekstu (usuwa stop words)
     */
    private extractKeywords(text: string): string[] {
        // Polskie stop words
        const stopWords = new Set([
            'jest', 'dla', 'jaki', 'który', 'która', 'które', 'czy', 'w', 'na', 'z', 'do', 'i', 'a', 'o',
            'się', 'że', 'to', 'jak', 'ale', 'by', 'być', 'po', 'od', 'ze', 'za', 'przy', 'lub', 'oraz',
            'co', 'gdy', 'jeśli', 'jeżeli', 'może', 'można', 'musi', 'powinien', 'ma', 'są', 'będzie'
        ]);

        // Tokenizacja i filtracja
        const words = text.toLowerCase()
            .replace(/[^\w\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c\s\/\-]/gi, ' ') // Zostaw /, - dla "2006/4/EC"
            .split(/\s+/)
            .filter(w => w.length > 0) // Usuń puste
            .filter(w => !stopWords.has(w)); // Usuń stop words

        // Dodaj również oryginalne słowa z wielkich liter (mogą być akronimy)
        const upperCaseWords = text.match(/\b[A-Z]{2,}\b/g) || [];
        const technicalTerms = text.match(/\b(GTX|RTX|GeForce|Milestone|IP|GPU)\b/gi) || [];

        const allKeywords = [...words, ...upperCaseWords.map(w => w.toLowerCase()), ...technicalTerms.map(w => w.toLowerCase())];

        return [...new Set(allKeywords)]; // Deduplikacja
    }

    /**
     * Wyszukiwanie keyword (pełnotekstowe) w Qdrant
     */
    async keywordSearch(keywords: string[], filter?: any, limit = 5) {
        if (keywords.length === 0) {
            return [];
        }

        try {
            // Filtr MUSI AND-ować: (branch constraint) AND (co najmniej jeden keyword w tekście)
            // Poprzednio wszystko było w `should`, co powodowało logikę OR: scroll zwracał dowolne
            // chunki z gałęzi, niezależnie od keywords — co faktycznie wyłączało wyszukiwanie po słowach.
            const mustClauses: any[] = [...(filter?.must || [])];

            // Jeśli filter zewnętrzny używa `should` (np. nodeId/parentId z AI Chat),
            // zapakuj je w nested should aby wymusić logikę "któreś z nich musi być true".
            if (filter?.should && filter.should.length > 0) {
                mustClauses.push({ should: filter.should });
            }

            // Wymagamy co najmniej jednego keyword match
            mustClauses.push({
                should: keywords.map(keyword => ({
                    key: 'text',
                    match: { text: keyword },
                })),
            });

            const result = await this.qdrant.scroll(this.collectionName, {
                filter: {
                    must: mustClauses,
                    must_not: filter?.must_not || [],
                },
                limit: limit,
                with_payload: true,
                with_vector: false,
            });

            return result.points || [];
        } catch (error) {
            this.logger.warn('Keyword search failed, falling back to vector only', error);
            return [];
        }
    }

    /**
     * Wyszukiwanie hybrydowe (wektor + keyword) z algorytmem RRF
     */
    async hybridSearch(query: string, filter?: any, limit = 10) {
        this.logger.log(`[Hybrid Search] Query: "${query}"`);

        // 1. Vector search
        const vectorResults = await this.searchSimilar(query, filter, limit);
        this.logger.log(`[Hybrid Search] Vector results: ${vectorResults.length}`);

        // 2. Exact phrase search (critical for technical terms like "2006/4/EC")
        const phraseResults = await this.keywordSearch([query], filter, limit);
        this.logger.log(`[Hybrid Search] Exact phrase results: ${phraseResults.length}`);

        // 3. Keyword search (fallback)
        const keywords = this.extractKeywords(query);
        this.logger.log(`[Hybrid Search] Keywords: ${keywords.join(', ')}`);

        const keywordResults = await this.keywordSearch(keywords, filter, limit);
        this.logger.log(`[Hybrid Search] Keyword results: ${keywordResults.length}`);

        // 3. Merge i deduplikacja
        const merged = new Map();

        // Dodaj wyniki wektorowe
        vectorResults.forEach((r, idx) => {
            merged.set(r.id, {
                id: r.id,
                score: r.score,
                payload: r.payload,
                vectorScore: r.score,
                vectorRank: idx,
                phraseScore: 0,
                phraseRank: 999,
                keywordScore: 0,
                keywordRank: 999
            });
        });

        // Dodaj wyniki exact phrase (NAJWYŻSZY PRIORYTET)
        phraseResults.forEach((r, idx) => {
            if (merged.has(r.id)) {
                const existing = merged.get(r.id);
                existing.phraseScore = 1.0;
                existing.phraseRank = idx;
            } else {
                merged.set(r.id, {
                    id: r.id,
                    score: 0,
                    payload: r.payload,
                    vectorScore: 0,
                    vectorRank: 999,
                    phraseScore: 1.0,
                    phraseRank: idx,
                    keywordScore: 0,
                    keywordRank: 999
                });
            }
        });

        // Dodaj wyniki keyword
        keywordResults.forEach((r, idx) => {
            if (merged.has(r.id)) {
                // Już jest - update score
                const existing = merged.get(r.id);
                existing.keywordScore = 1.0;
                existing.keywordRank = idx;
            } else {
                // Nowy wynik
                merged.set(r.id, {
                    id: r.id,
                    score: 0,
                    payload: r.payload,
                    vectorScore: 0,
                    vectorRank: 999,
                    keywordScore: 1.0,
                    keywordRank: idx
                });
            }
        });

        // 4. Ranking - phrase gets 100x, keyword 20x, vector 1x
        const k = 60; // RRF constant
        const ranked = Array.from(merged.values()).map(r => ({
            ...r,
            finalScore: (1 / (r.vectorRank + k)) + (20 / (r.keywordRank + k)) + (100 / (r.phraseRank + k))
        }));

        // 5. Sortuj i zwróć top N
        const results = ranked
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, limit);

        this.logger.log(`[Hybrid Search] Final results: ${results.length}, top score: ${results[0]?.finalScore.toFixed(4)}`);

        return results;
    }

    /**
     * Synchronizuje dane strukturalne z bazy PostgreSQL do Qdrant
     * Indeksuje: węzły drzewa, stacje (Site), sprzęt (Hardware), użytkowników, zespoły
     */
    @Cron(CronExpression.EVERY_5_MINUTES, { name: 'sync-db-to-vector' })
    @Cron(CronExpression.EVERY_5_MINUTES, { name: 'sync-db-to-vector' })
    async syncDatabaseToVector(): Promise<{ indexed: number; errors: number }> {
        this.logger.log('[Sync] Starting database → vector sync...');
        const items: Array<{ id: string; text: string; metadata: any }> = [];

        // 1. Nodes
        try {
            const nodes = await this.prisma.processNode.findMany({
                include: {
                    owner: { select: { firstName: true, lastName: true, email: true } },
                    site: true,
                    hardware: true,
                    parent: { select: { id: true, name: true } },
                }
            });
            this.logger.log(`[Sync] Found ${nodes.length} nodes`);
            for (const node of nodes) {
                const parts = [
                    `Węzeł: ${node.name}`,
                    `Typ: ${node.customTypeLabel || node.type}`,
                    node.parent ? `Nadrzędny: ${node.parent.name}` : 'Węzeł główny (root)',
                    node.owner ? `Właściciel: ${node.owner.firstName} ${node.owner.lastName} (${node.owner.email})` : '',
                    node.address ? `Adres: ${node.address}` : '',
                    node.nip ? `NIP: ${node.nip}` : '',
                    node.region ? `Region: ${node.region}` : '',
                    node.contactPerson ? `Osoba kontaktowa: ${node.contactPerson}` : '',
                    `Widoczność: ${node.isPublic ? 'publiczny' : node.visibility}`,
                    `Utworzony: ${node.createdAt.toISOString().split('T')[0]}`,
                ];
                if (node.site) {
                    const s = node.site;
                    parts.push(
                        `Stacja nr: ${s.number || '—'}`,
                        s.addressCity ? `Miasto: ${s.addressCity}` : '',
                        s.addressStreet ? `Ulica: ${s.addressStreet}` : '',
                        s.addressZipCode ? `Kod pocztowy: ${s.addressZipCode}` : '',
                    );
                }
                items.push({
                    id: makeUUID('node', node.id),
                    text: parts.filter(Boolean).join('\n'),
                    metadata: {
                        nodeId: node.id,
                        fileName: `[Struktura] ${node.name}`,
                        chunkIndex: 0,
                        sourceType: 'node',
                    }
                });
            }
        } catch (e) {
            this.logger.error(`[Sync] Error in nodes phase: ${e.message}`);
        }

        // 2. Hardware
        try {
            const hardware = await this.prisma.hardware.findMany({
                include: { site: { select: { id: true, name: true } } }
            });
            this.logger.log(`[Sync] Found ${hardware.length} hardware items`);
            for (const h of hardware) {
                const siteName = h.site?.name || 'Nieznana lokalizacja';
                const text = [
                    `Sprzęt: ${h.name}`,
                    `Model: ${h.model || '—'}`,
                    `Producent: ${h.manufacturer || '—'}`,
                    `Lokalizacja (węzeł): ${siteName}`,
                ].join('\n');
                items.push({
                    id: makeUUID('hw', h.id),
                    text,
                    metadata: {
                        nodeId: h.site?.id || 'unknown',
                        fileName: `[Sprzęt] ${h.name}`,
                        chunkIndex: 0,
                        sourceType: 'hardware',
                    }
                });
            }
        } catch (e) {
            this.logger.error(`[Sync] Error in hardware phase: ${e.message}`);
        }

        // 5. Subtasks
        try {
            const subtasks = await this.prisma.subtask.findMany({
                include: {
                    assignedUser: { select: { firstName: true, lastName: true, email: true } },
                    node: { select: { name: true } },
                    version: { select: { label: true } }
                }
            });
            this.logger.log(`[Sync] Found ${subtasks.length} subtasks`);
            for (const s of subtasks) {
                const text = [
                    `Podzadanie: ${s.name}`,
                    s.version ? `Wersja: ${s.version.label}` : '',
                    s.description ? `Opis: ${s.description}` : '',
                    `Status: ${s.status}`,
                    `Węzeł (lokalizacja): ${s.node?.name}`,
                    s.assignedUser ? `Przypisany: ${s.assignedUser.firstName} ${s.assignedUser.lastName}` : 'Nieprzypisane',
                ].filter(Boolean).join('\n');
                items.push({
                    id: makeUUID('subtask', s.id),
                    text,
                    metadata: {
                        nodeId: s.nodeId,
                        versionId: s.versionId,
                        versionLabel: s.version?.label,
                        fileName: `[Podzadanie] ${s.name}`,
                        chunkIndex: 0,
                        sourceType: 'subtask',
                        subtaskId: s.id,
                    }
                });
            }
        } catch (e) {
            this.logger.error(`[Sync] Error in subtasks phase: ${e.message}`);
        }

        // 7. Budget Items
        try {
            const budgetItems = await this.prisma.budgetLineItem.findMany({
                include: {
                    version: { select: { label: true, nodeId: true } },
                    subtask: { select: { name: true } }
                }
            });
            this.logger.log(`[Sync] Found ${budgetItems.length} budget items`);
            for (const b of budgetItems) {
                const versionLabel = b.version?.label || 'Brak wersji';
                const text = [
                    `Pozycja budżetowa: ${b.description}`,
                    `Wersja projektu: ${versionLabel}`,
                    `Typ: ${b.type}`,
                    `Ilość: ${b.quantity} ${b.unit}`,
                    `Koszt jedn.: ${b.unitCost.toFixed(2)}`,
                    `Suma kosztów: ${b.totalCost.toFixed(2)}`,
                    `Marża: ${b.margin}%`,
                    `Suma sprzedaży: ${b.totalPrice.toFixed(2)}`,
                ].filter(Boolean).join('\n');
                items.push({
                    id: makeUUID('budget', b.id),
                    text,
                    metadata: {
                        nodeId: b.version?.nodeId || 'unknown',
                        versionId: b.versionId,
                        versionLabel: versionLabel,
                        fileName: `[Budżet] ${b.description}`,
                        chunkIndex: 0,
                        sourceType: 'budget_item',
                        budgetItemId: b.id,
                    }
                });
            }
        } catch (e) {
            this.logger.error(`[Sync] Error in budget phase: ${e.message}`);
        }

        // 8. Order Requirements (Informacje o zamówieniu)
        try {
            const reqs = await this.prisma.orderRequirements.findMany({
                include: { node: { select: { name: true } } }
            });
            this.logger.log(`[Sync] Found ${reqs.length} order requirements`);
            for (const r of reqs) {
                const parts = [
                    `[INFORMACJE O ZAMÓWIENIU]`,
                    `Projekt: ${r.node?.name || '—'}`,
                    `Cel projektu: ${r.projectGoal || '—'}`,
                    r.clientProjectManager ? `Project Manager (PM): ${r.clientProjectManager}` : '',
                    r.clientProjectManagerPhone ? `Telefon PM: ${r.clientProjectManagerPhone}` : '',
                    r.clientProjectManagerEmail ? `E-mail PM: ${r.clientProjectManagerEmail}` : '',
                    r.offerDeadline ? `Termin złożenia oferty: ${r.offerDeadline.toISOString().split('T')[0]} ${r.offerDeadline.toISOString().split('T')[1].substring(0, 5)}` : '',
                    r.projectStart ? `Planowany start: ${r.projectStart.toISOString().split('T')[0]}` : '',
                    r.projectEnd ? `Planowany koniec: ${r.projectEnd.toISOString().split('T')[0]}` : '',
                ];

                if (r.projectItems) {
                    try {
                        const items = JSON.parse(r.projectItems);
                        // Jeśli to obiekt z kategoriami, spróbujmy to ładnie sformatować
                        let itemsText = "";
                        Object.entries(items).forEach(([cat, list]: [string, any]) => {
                            if (list && Array.isArray(list) && list.length > 0) {
                                itemsText += `\n- Kategoria ${cat}: ` + list.map(i => `${i.name}${i.description ? ' (' + i.description + ')' : ''}`).join(', ');
                            }
                        });
                        if (itemsText) parts.push(`Wykaz/Przedmioty Projektu:${itemsText}`);
                    } catch (e) {
                        parts.push(`Szczegóły/Wykaz: ${r.projectItems}`);
                    }
                }

                if (r.clientContacts) {
                    try {
                        const contacts = JSON.parse(r.clientContacts);
                        if (Array.isArray(contacts)) {
                            const cText = contacts.map(c => `${c.role}: ${c.name} ${c.surname} (${c.phone}, ${c.email})`).join('\n');
                            parts.push(`Dodatkowe kontakty:\n${cText}`);
                        }
                    } catch (e) {
                        parts.push(`Dodatkowe kontakty: ${r.clientContacts}`);
                    }
                }

                items.push({
                    id: makeUUID('req', r.id),
                    text: parts.filter(Boolean).join('\n'),
                    metadata: {
                        nodeId: r.nodeId,
                        versionId: r.versionId,
                        fileName: `[Wymagania] ${r.node?.name || 'Zlecenie'}`,
                        chunkIndex: 0,
                        sourceType: 'order_requirement',
                        reqId: r.id,
                    }
                });
            }
        } catch (e) {
            this.logger.error(`[Sync] Error in order requirements phase: ${e.message}`);
        }

        this.logger.log(`[Sync] Prepared final ${items.length} entries for indexing`);

        let indexed = 0;
        let errors = 0;
        const batchSize = 20;
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            try {
                await this.upsertDocuments(batch);
                indexed += batch.length;
                this.logger.log(`[Sync] Progress: ${indexed}/${items.length}`);
            } catch (err) {
                this.logger.error(`[Sync] Error indexing batch ${i}-${i + batch.length}: ${err.message}`);
                errors += batch.length;
            }
        }

        this.logger.log(`[Sync] Finished. Indexed: ${indexed}, Errors: ${errors}`);
        return { indexed, errors };
    }

    /**
     * Zadaje pytanie do modelu AI
     */
    async askGemini(question: string, context: string[], conversationHistory: Array<{ role: string; content: string }> = []) {
        const modelName = this.configService.get('AI_MODEL');
        let prompt: string;
        const nowWarsaw = new Date().toLocaleString('pl-PL', {
            timeZone: 'Europe/Warsaw',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });

        // Truncate context to ~60k chars to stay within 30k TPM OpenAI limit
        const MAX_CONTEXT_CHARS = 60000;
        let truncatedContext = context;
        let totalChars = context.reduce((sum, c) => sum + c.length, 0);
        if (totalChars > MAX_CONTEXT_CHARS) {
            truncatedContext = [];
            let used = 0;
            for (const chunk of context) {
                if (used + chunk.length > MAX_CONTEXT_CHARS) break;
                truncatedContext.push(chunk);
                used += chunk.length;
            }
            this.logger.warn(`[Ask] Context truncated: ${context.length} → ${truncatedContext.length} chunks (${totalChars} → ${used} chars)`);
        }

        if (truncatedContext.length > 0) {
            prompt = `Jesteś inteligentnym asystentem ERP systemu GIGATEL.
Aktualna data i godzina (strefa Warsaw): ${nowWarsaw}

Masz dostęp do czterech rodzajów danych:
- [Struktura] - dane strukturalne systemu: węzły drzewa projektów, stacje bazowe, sprzęt, użytkownicy, zespoły.
- [Podzadanie] - konkretne zadania techniczne lub organizacyjne (WBS) przypisane do wersji projektu.
- [Budżet] - pozycje kosztowe i marżowe przypisane do konkretnej wersji projektu.
- [Dokumenty] - zaimportowane pliki PDF i inne dokumenty.

ZADANIE:
Odpowiedz na pytanie użytkownika na podstawie dostarczonych poniżej fragmentów (sekcja DANE).

INSTRUKCJE:
1. Twoim priorytetem jest wierność danym. Nie wymyślaj informacji.
2. [WERSJONOWANIE]: Dane mogą zawierać informację o wersji (np. "ver01", "ver02"). Jeśli użytkownik pyta o konkretną wersję, skup się na niej. Jeśli nie wspomina o wersji, używaj najnowszych dostępnych danych lub wspomnij o różnicach między wersjami.
3. [BUDŻET I KOSZTY]: Jeśli pytanie dotyczy wyceny, kosztów lub rentowności (ROI) - szukaj w danych [Budżet]. Zwracaj uwagę na sumy kosztów, sprzedaży i marże.
4. [STREFA KRYTYCZNA - PODZADANIA (WBS)]: Jeśli użytkownik pyta o planowanie lub zakres prac (WBS):
   - Wymień WSZYSTKIE podzadania z kategorii [Podzadanie] dla danego węzła i wersji.
   - PRZEANALIZUJ hierarchię w danych [Struktura]. Jeśli dany obszar (np. "Poznań") posiada węzły podrzędne (potomków), to podzadania przypisane do tych potomków RÓWNIEŻ należą do tego obszaru i musisz je wymienić w odpowiedzi.
   - Nie pomijaj żadnego podzadania widocznego w sekcji DANE.
3. Dane z etykietą [Struktura] to aktualne dane z bazy systemu ERP - traktuj je jako wiarygodne i aktualne. Wykorzystuj je do rozumienia relacji nadrzędny-podrzędny między węzłami.
4. Jeśli pytanie dotyczy składu zespołu, użytkowników, węzłów, stacji lub sprzętu - szukaj w danych [Struktura].
5. Jeśli pytanie dotyczy dokumentów technicznych, procedur lub specyfikacji - szukaj w danych [Dokumenty].
6. Odpowiadaj w języku polskim, zwięźle i precyzyjnie.
7. Jeśli informacji nie ma w całej sekcji DANE, powiedz to wyraźnie.

DANE:
${truncatedContext.join('\n\n---\n\n')}`;
            // Debug: log first chunk to verify content
            this.logger.log(`[Ask] Context chunks: ${truncatedContext.length}`);
            if (truncatedContext.length > 0) {
                this.logger.log(`[Ask] First chunk preview: ${truncatedContext[0].substring(0, 200)}`);
                // Check if any chunk contains the query
                const matchingChunks = truncatedContext.filter(c => c.toLowerCase().includes(question.toLowerCase()));
                this.logger.log(`[Ask] Chunks containing query "${question}": ${matchingChunks.length}`);
                if (matchingChunks.length > 0) {
                    const matchIndex = truncatedContext.findIndex(c => c.toLowerCase().includes(question.toLowerCase()));
                    this.logger.log(`[Ask] First match at index: ${matchIndex}`);
                    this.logger.log(`[Ask] Match preview: ${truncatedContext[matchIndex].substring(0, 300)}`);
                }
            }
        } else {
            prompt = `Jesteś asystentem technicznym.
            
PYTANIE: ${question}

ODPOWIEDŹ: Brak dokumentów. Prześlij pliki aby uzyskać odpowiedź.`;
        }

        this.logger.log(`[Ask] prompt length: ${prompt.length}, model: ${modelName}`);

        if (modelName.startsWith('gpt') && this.openai) {
            this.logger.log(`[Ask] Using OpenAI for model: ${modelName}`);
            try {
                // Build messages array with history
                const messages: any[] = [
                    { role: 'system', content: prompt }
                ];

                // Add conversation history
                if (conversationHistory && conversationHistory.length > 0) {
                    this.logger.log(`[Ask] Adding ${conversationHistory.length} history messages`);
                    messages.push(...conversationHistory);
                }

                // Add current question
                messages.push({ role: 'user', content: question });

                const completion = await this.openai.chat.completions.create({
                    model: modelName,
                    messages: messages,
                    max_tokens: 1000,
                    temperature: 0.1
                });
                const responseText = completion.choices[0].message.content || 'Brak odpowiedzi.';
                this.logger.log(`[Ask] OpenAI response length: ${responseText.length}`);
                return responseText;
            } catch (error) {
                this.logger.error(`[Ask] OpenAI Error: ${error.message}`);
                throw error;
            }
        }

        if (modelName.startsWith('gemini') && this.genAI) {
            // Google Gemini
            const model = this.genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();

        } else if (modelName.startsWith('llama') || modelName.startsWith('mixtral') || modelName.startsWith('openai/') || modelName.startsWith('qwen/') || modelName.startsWith('moonshotai/')) {
            // Groq (OpenAI-compatible API)
            const groqMessages: any[] = [{ role: 'system', content: prompt }];
            if (conversationHistory && conversationHistory.length > 0) {
                groqMessages.push(...conversationHistory);
            }
            groqMessages.push({ role: 'user', content: question });

            const completion = await this.groq.chat.completions.create({
                model: modelName,
                messages: groqMessages,
                max_tokens: 1000,
                temperature: 0.1 // Low temperature to reduce hallucinations
            });

            // Log całej odpowiedzi Groq
            this.logger.log(`[AI] Groq completion:`, JSON.stringify({
                finish_reason: completion.choices[0]?.finish_reason,
                message_role: completion.choices[0]?.message?.role,
                content_length: completion.choices[0]?.message?.content?.length || 0
            }));

            let answer = completion.choices[0]?.message?.content;

            // Walidacja odpowiedzi
            if (!answer || answer.trim().length === 0) {
                this.logger.error('[AI] Empty response from Groq');
                return 'Przepraszam, nie udało mi się wygenerować odpowiedzi. Spróbuj ponownie lub przeformułuj pytanie.';
            }

            // Log długości i podglądu odpowiedzi
            this.logger.log(`[AI] Response length: ${answer.length} characters`);
            this.logger.log(`[AI] Response preview: ${answer.substring(0, 150).replace(/\n/g, ' ')}`);

            // Sprawdź czy odpowiedź nie jest dziwna (same podkreślenia, białe kwadraty, etc)
            const underscoreRatio = (answer.match(/_/g) || []).length / answer.length;
            const whiteSquareRatio = (answer.match(/□/g) || []).length / answer.length;

            if (underscoreRatio > 0.5 || whiteSquareRatio > 0.1) {
                this.logger.error(`[AI] Suspicious response detected!`);
                this.logger.error(`[AI] Underscores: ${(underscoreRatio * 100).toFixed(1)}%, White squares: ${(whiteSquareRatio * 100).toFixed(1)}%`);
                this.logger.error(`[AI] Full response: ${answer}`);
                return 'Przepraszam, wystąpił problem z generowaniem odpowiedzi. Spróbuj zadać pytanie w inny sposób.';
            }

            return answer;

        } else if (this.hf) {
            // Hugging Face
            // Use chatCompletion which is more robust for Instruct/Chat models and supported by more providers
            const result = await this.hf.chatCompletion({
                model: modelName,
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: 500
            });
            return result.choices[0].message.content;
        }

        throw new Error('No valid AI Chat provider configured.');
    }
}
