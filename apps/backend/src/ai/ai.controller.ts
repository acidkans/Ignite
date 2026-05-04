import { Controller, Post, Body, Get, Query, Param, Delete, Patch, Res, BadRequestException, UseInterceptors, UploadedFile, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VectorService } from './vector.service';
import { ProcessTreeService } from '../process-tree/process-tree.service';
import { VersioningService } from './versioning.service';
import { BudgetService } from './budget.service';
import { DocxService } from './docx.service';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

import { AiService } from './ai.service';
import { DocumentsService } from '../documents/documents.service';

@Controller('ai')
export class AiController {
    constructor(
        private readonly vectorService: VectorService,
        private readonly processTreeService: ProcessTreeService,
        private readonly versioningService: VersioningService,
        private readonly budgetService: BudgetService,
        private readonly docxService: DocxService,
        private readonly aiService: AiService,
        @Inject(forwardRef(() => DocumentsService))
        private readonly documentsService: DocumentsService
    ) { }

    /**
     * Endpoint do pobierania aktualnej konfiguracji AI (modele)
     */
    @Get('config')
    getConfig() {
        return this.vectorService.getConfig();
    }

    /**
     * Endpoint do zadawania pytań asystentowi AI
     */
    @Post('chat')
    async chat(@Body() body: { question: string; nodeId?: string; conversationHistory?: Array<{ role: string; content: string }> }) {
        if (!body.question) {
            throw new BadRequestException('Question is required');
        }

        // 1. Jeśli przekazano nodeId, budujemy filtr hierarchiczny
        console.log(`[AI Chat] Received question: "${body.question}", nodeId: "${body.nodeId}"`);

        let filter;

        if (body.nodeId) {
            // Sprawdź typ węzła — area = widok globalny, głębiej = filtr gałęzi
            const selectedNode = await this.processTreeService.getNode(body.nodeId);
            const isAreaLevel = selectedNode?.type === 'area';

            if (isAreaLevel) {
                // Obszar = wyszukiwanie globalne po całej bazie (brak filtra)
                console.log(`[AI Chat] Node ${body.nodeId} is type 'area' — using global search.`);
            } else {
                // Field / order / site = ograniczone do tej gałęzi i potomków
                const descendants = await this.processTreeService.getAllDescendantIds(body.nodeId);
                console.log(`[AI Chat] Node ${body.nodeId} (type: ${selectedNode?.type}) has ${descendants.length} descendants — applying branch filter.`);

                filter = {
                    should: [
                        {
                            key: "nodeId",
                            match: { any: descendants }
                        },
                        {
                            key: "parentId",
                            match: { any: descendants }
                        }
                    ]
                };
            }
        }

        console.log(`[AI Chat] Search filter params set.`);

        // 2. Wyszukiwanie hybrydowe (keyword + vector) - keyword ma priorytet dla exact matches
        const searchResults = await this.vectorService.hybridSearch(body.question, filter, 30);

        // 2b. Dorzuć sąsiednie chunki (X-1 i X+1) dla fragmentów PDF
        //     — naprawia problem z danymi technicznymi podzielonymi między chunki
        const neighborChunks = await this.vectorService.fetchNeighborChunks(searchResults);
        const allResults = [...searchResults, ...neighborChunks];

        console.log(`[AI Chat] Found ${searchResults.length} relevant chunks + ${neighborChunks.length} neighbors = ${allResults.length} total`);
        allResults.slice(0, 5).forEach((r, i) => {
            const text = r.payload.text as string;
            console.log(`[${i}] ID: ${r.id}, Sc: ${r.score?.toFixed(3)}, Tx: ${text.substring(0, 40).replace(/\n/g, ' ')}...`);
        });

        // 3. Wyciągamy teksty z wyników
        const context = allResults.map((res, idx) => {
            const text = res.payload.text as string;
            return `[Fragment ${idx + 1} (Źródło: ${res.payload.fileName}, str. ${res.payload.pageNumber || '?'}, ID: ${res.id})]:\n${text}`;
        });

        // 4. Jeśli nie znaleziono kontekstu, a wybrano konkretny projekt/węzeł
        if (context.length === 0 && !body.nodeId) {
            // Możemy wyszukać ogólnie jeśli użytkownik nic nie zaznaczył
            console.log('[AI Chat] No context found with filter, ignoring filter not implemented yet.');
        }

        // 5. Wysyłamy pytanie wraz z kontekstem do Gemini
        const answer = await this.vectorService.askGemini(body.question, context, body.conversationHistory || []);

        return {
            answer,
            sources: allResults.map(res => ({
                fileName: res.payload.fileName,
                nodeId: res.payload.nodeId,
                score: res.score
            }))
        };
    }

    /**
     * Endpoint do synchronizacji danych strukturalnych z bazy do Qdrant
     * Indeksuje: węzły drzewa, stacje, sprzęt, użytkowników, zespoły
     */
    @Post('sync-db')
    async syncDatabase() {
        const result = await this.vectorService.syncDatabaseToVector();
        return {
            success: true,
            message: `Zsynchronizowano ${result.indexed} rekordów (błędy: ${result.errors})`,
            ...result
        };
    }

    /**
     * Endpoint do testowego dodania tekstu (zastąpiony później przez automatyczną ingestję)
     */
    @Post('ingest')
    async ingest(@Body() body: { text: string; nodeId: string; fileName: string }) {
        await this.vectorService.upsertDocument({
            id: randomUUID(),
            text: body.text,
            metadata: {
                nodeId: body.nodeId,
                fileName: body.fileName,
                chunkIndex: 0
            }
        });

        return { success: true };
    }

    /**
     * Wersjonowanie
     */
    @Get('versions/:nodeId')
    getVersions(@Param('nodeId') nodeId: string) {
        return this.versioningService.getVersions(nodeId);
    }

    @Post('versions')
    createVersion(@Body() body: { nodeId: string; label: string; sourceVersionId?: string }) {
        if (!body.nodeId || !body.label) throw new BadRequestException('NodeId and label are required');
        return this.versioningService.createVersion(body.nodeId, body.label, body.sourceVersionId);
    }

    @Patch('versions/:id/activate')
    activateVersion(@Param('id') id: string) {
        return this.versioningService.setActiveVersion(id);
    }

    @Patch('versions/:id/label')
    renameVersion(@Param('id') id: string, @Body() body: { label: string }) {
        if (!body.label?.trim()) throw new BadRequestException('Label is required');
        return this.versioningService.renameVersion(id, body.label.trim());
    }

    @Delete('versions/:id')
    deleteVersion(@Param('id') id: string) {
        return this.versioningService.deleteVersion(id);
    }

    /**
     * Budżet
     */
    @Get('budget/:versionId')
    getBudget(@Param('versionId') versionId: string) {
        return this.budgetService.getBudget(versionId);
    }

    @Post('budget/:versionId')
    addBudgetItem(@Param('versionId') versionId: string, @Body() body: any) {
        return this.budgetService.addLineItem(versionId, body);
    }

    @Patch('budget/item/:id')
    updateBudgetItem(@Param('id') id: string, @Body() body: any) {
        return this.budgetService.updateLineItem(id, body);
    }

    @Delete('budget/item/:id')
    deleteBudgetItem(@Param('id') id: string) {
        return this.budgetService.deleteLineItem(id);
    }

    /**
     * AI Estimation & Analysis
     */
    @Post('estimate/:nodeId/:versionId')
    async estimate(@Param('nodeId') nodeId: string, @Param('versionId') versionId: string) {
        return this.aiService.estimateProject(nodeId, versionId);
    }

    @Post('propose-wbs/:nodeId')
    async proposeWbs(@Param('nodeId') nodeId: string, @Query('versionId') versionId: string, @Body() body: any) {
        return (this.aiService as any).proposeWbs(nodeId, versionId, body?.projectItems);
    }

    @Post('analyze-plan/:nodeId/:versionId')
    async analyzePlan(@Param('nodeId') nodeId: string, @Param('versionId') versionId: string) {
        return this.aiService.analyzePlan(nodeId, versionId);
    }

    @Post('apply-estimation/:nodeId/:versionId')
    async applyEstimation(@Param('nodeId') nodeId: string, @Param('versionId') versionId: string, @Body() data: any) {
        return this.aiService.applyEstimation(nodeId, versionId, data);
    }

    /**
     * DOCX Export
     */
    @Get('export/docx/:versionId')
    async exportDocx(@Param('versionId') versionId: string, @Res() res: Response) {
        const buffer = await this.docxService.generateProjectDoc(versionId);

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename=Project_Report_${versionId}.docx`,
            'Content-Length': buffer.length,
        });

        res.end(buffer);
    }

    /**
     * Zautomatyzowany Workflow Projektowy z Wbudowaną Przeglądarką (AI Auto-Deploy)
     * Pobiera plik, wyciąga tekst, generuje wymagania, wywołuje WBS i Budżet.
     */
    @Post('workflow/auto-generate')
    @UseInterceptors(FileInterceptor('file'))
    async autoGenerateWorkflow(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { nodeId: string; versionId: string }
    ) {
        if (!file) throw new BadRequestException('Brak załączonego pliku wymagań.');
        if (!body.nodeId || !body.versionId) throw new BadRequestException('Brak przypisania do projektu (nodeId/versionId).');

        console.log(`[AI WORKFLOW] Rozpoczynam generację struktur dla węzła ${body.nodeId}, wersja ${body.versionId}`);

        try {
            //KROK 0: Przekazanie do normalnego processDocument by zaindeksować i ewentualnie odczytać raw text (mimetype / python parser)
            //Ponieważ upload odświeży też "pliki", użyjemy documentsService
            const docResult = await this.documentsService.processDocument(file, body.nodeId);
            const internalFileNodeId = (docResult as any)?.nodeId;

            //KROK 1: Analiza wymagań 
            //(pobieranie świeżo zgranych wektorów przez similarity dla podsumowania z nazwy pliku albo raw tekst, ułatwiając: prosimy model o streszczenie pierwszego strzału)
            // Użyjmy dedykowanej funkcji w AiService, by rozdzielić logikę.
            const workflowResult = await this.aiService.runAutoDeployWorkflow(body.nodeId, body.versionId, file, internalFileNodeId);

            return {
                success: true,
                message: 'Zautomatyzowany ciąg wyceny AI i generowania WBS został zakończony pomyślnie.',
                result: workflowResult
            };

        } catch (error) {
            console.error('[AI WORKFLOW] Wystąpił błąd:', error);
            throw new BadRequestException(`Błąd podczas przeprowadzania cyklu AI: ${error.message}`);
        }
    }
}
