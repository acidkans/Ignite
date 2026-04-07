import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, Query, UseGuards, Req, Res,
    UseInterceptors, UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MaterialRequirementsService } from './material-requirements.service';

@Controller('material-requirements')
@UseGuards(JwtAuthGuard)
export class MaterialRequirementsController {
    constructor(private readonly service: MaterialRequirementsService) { }

    // ─── BAZA GLOBALNA ─────────────────────────────────────────────────────────

    /** Wszystkie materiały z wypełnionym producentem i kartą katalogową */
    @Get('database')
    findGlobalDatabase() {
        return this.service.findGlobalDatabase();
    }

    /** Wszystkie materiały z producentem (bez wymagania karty katalogowej) */
    @Get('all-materials')
    findAllMaterials() {
        return this.service.findAllMaterials();
    }

    /** Wszystkie materiały zaimportowane z kart katalogowych (globalnie) */
    @Get('datasheets')
    findAllDatasheetItems() {
        return this.service.findAllDatasheetItems();
    }

    /** Materiały zaimportowane z kart katalogowych dla danego węzła */
    @Get('datasheets/:nodeId')
    findDatasheetItems(@Param('nodeId') nodeId: string) {
        return this.service.findDatasheetItems(nodeId);
    }

    /** Wszystkie materiały z przypisanym numerem oferty */
    @Get('with-offers')
    findAllWithOffers() {
        return this.service.findAllWithOffers();
    }

    // ─── CRUD ──────────────────────────────────────────────────────────────────

    /** Lista wymagań dla węzła (opcjonalnie filtrowana wersją / listą) */
    @Get('node/:nodeId')
    findAll(
        @Param('nodeId') nodeId: string,
        @Query('versionId') versionId?: string,
        @Query('listId') listId?: string,
    ) {
        return this.service.findAllByNode(nodeId, versionId, listId);
    }

    // ─── LISTY WYMAGAŃ MATERIAŁOWYCH ─────────────────────────────────────────

    /** Pobierz wszystkie listy dla węzła */
    @Get('lists/node/:nodeId')
    findLists(@Param('nodeId') nodeId: string) {
        return this.service.findListsByNode(nodeId);
    }

    /** Pobierz lub utwórz domyślną listę dla węzła */
    @Post('lists/node/:nodeId/default')
    getOrCreateDefault(@Param('nodeId') nodeId: string, @Req() req: any) {
        return this.service.getOrCreateDefaultList(nodeId, req.user?.email || req.user?.sub);
    }

    /** Utwórz nową listę */
    @Post('lists')
    createList(@Body() body: { nodeId: string; name: string }, @Req() req: any) {
        if (!body.nodeId || !body.name) throw new BadRequestException('nodeId i name są wymagane');
        return this.service.createList(body.nodeId, body.name, req.user?.email || req.user?.sub);
    }

    /** Zmień nazwę listy */
    @Patch('lists/:listId')
    renameList(@Param('listId') listId: string, @Body() body: { name: string }) {
        return this.service.renameList(listId, body.name);
    }

    /** Usuń niezatwierdzoną listę wraz z wymaganiami */
    @Delete('lists/:listId')
    deleteList(@Param('listId') listId: string) {
        return this.service.deleteList(listId);
    }

    /** Zatwierdź listę (zablokuj edycję) */
    @Post('lists/:listId/lock')
    lockList(@Param('listId') listId: string, @Req() req: any) {
        return this.service.lockList(listId, req.user?.email || req.user?.sub);
    }

    /** Utwórz nową wersję listy (dziedziczącą z bieżącej) */
    @Post('lists/:listId/new-version')
    newVersion(@Param('listId') listId: string, @Body() body: { name: string }) {
        if (!body.name) throw new BadRequestException('name jest wymagane');
        return this.service.createNewVersion(listId, body.name);
    }

    /** Usunięcie wszystkich wymagań dla węzła */
    @Delete('node/:nodeId/all')
    removeAll(@Param('nodeId') nodeId: string) {
        return this.service.removeAllByNode(nodeId);
    }

    /** Czyszczenie przypisań do usuniętych węzłów WBS */
    @Post('clear-assignments')
    clearAssignments(@Body() body: { nodeId: string; deletedWbsNodeIds: string[] }) {
        if (!body.nodeId || !Array.isArray(body.deletedWbsNodeIds)) {
            throw new BadRequestException('nodeId i deletedWbsNodeIds są wymagane');
        }
        return this.service.clearAssignments(body.nodeId, body.deletedWbsNodeIds);
    }

    /** Szczegóły jednego wymagania */
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    /** Ręczne dodanie wymagania */
    @Post()
    create(@Body() body: {
        nodeId: string;
        versionId?: string;
        listId?: string;
        productName?: string;
        type: string;
        quantity: number;
        unit: string;
        technicalSpec?: string;
        sourceDocument?: string;
        name?: string;
        materialId?: string;
        stockStatus?: number;
    }) {
        if (!body.nodeId) throw new BadRequestException('nodeId jest wymagane');
        return this.service.create(body);
    }

    /** Aktualizacja wymagania (dane produktu, przypisanie WBS, status) */
    @Patch(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body);
    }

    /** Usunięcie wymagania */
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }

    // ─── UPLOAD PLIKÓW ─────────────────────────────────────────────────────────

    /** Upload karty katalogowej (PDF) */
    @Post(':id/upload-datasheet')
    @UseInterceptors(FileInterceptor('file'))
    uploadDatasheet(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Brak pliku');
        return this.service.uploadFile(id, file, 'datasheet');
    }

    /** Upload karty zgodności (PDF) */
    @Post(':id/upload-compliance')
    @UseInterceptors(FileInterceptor('file'))
    uploadCompliance(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Brak pliku');
        return this.service.uploadFile(id, file, 'compliance');
    }

    /** Upload print screenu / zdjęcia urządzenia */
    @Post(':id/upload-image')
    @UseInterceptors(FileInterceptor('file'))
    uploadImage(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Brak pliku');
        return this.service.uploadImage(id, file);
    }

    /** Pobierz obraz urządzenia */
    @Get(':id/datasheet')
    async getDatasheet(@Param('id') id: string, @Res() res: Response) {
        const { stream, name } = await this.service.getDatasheetStream(id);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"` });
        stream.pipe(res);
    }

    @Get(':id/compliance')
    async getCompliance(@Param('id') id: string, @Res() res: Response) {
        const { stream, name } = await this.service.getComplianceStream(id);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"` });
        stream.pipe(res);
    }

    @Get(':id/image')
    async getImage(@Param('id') id: string, @Res() res: Response) {
        const { stream, mimeType } = await this.service.getImageStream(id);
        res.set({ 'Content-Type': mimeType });
        stream.pipe(res);
    }

    /** Parsowanie pozycji z PDF oferty */
    @Post('parse-offer')
    parseOffer(@Body() body: { documentId: string }) {
        if (!body.documentId) throw new BadRequestException('documentId wymagane');
        return this.service.parseOfferDocument(body.documentId);
    }

    /** Parsowanie karty katalogowej — zwraca producent, nazwa, model */
    @Post('parse-datasheet')
    parseDatasheet(@Body() body: { documentId: string }) {
        if (!body.documentId) throw new BadRequestException('documentId wymagane');
        return this.service.parseDatasheetDocument(body.documentId);
    }

    /** Zapisuje pozycje z karty katalogowej jako MaterialRequirement */
    @Post('save-datasheet-items')
    saveDatasheetItems(@Body() body: { documentId: string; nodeId: string; items: any[] }) {
        if (!body.documentId || !body.nodeId || !Array.isArray(body.items))
            throw new BadRequestException('documentId, nodeId i items wymagane');
        return this.service.saveDatasheetItems(body.documentId, body.nodeId, body.items);
    }

    // ─── EKSTRAKCJA AI ────────────────────────────────────────────────────────

    /**
     * Wyciąga urządzenia i materiały z dokumentów PDF zaimportowanych do węzła.
     * AI zwraca ustrukturyzowaną listę z wstępnymi przypisaniami do WBS.
     */
    @Post('extract/:nodeId')
    extract(
        @Param('nodeId') nodeId: string,
        @Query('versionId') versionId?: string,
        @Query('listId') listId?: string,
    ) {
        return this.service.extractFromDocuments(nodeId, versionId, listId);
    }

    // ─── TABELA ZGODNOŚCI ────────────────────────────────────────────────────

    /** Ocena zgodności produktów z wymaganiami przez AI */
    @Post(':id/evaluate-compliance')
    evaluateCompliance(@Param('id') id: string) {
        return this.service.evaluateCompliance(id);
    }

    // ─── PROPOZYCJE PRODUKTÓW ─────────────────────────────────────────────────

    /**
     * Wyszukuje propozycje produktów przez Google Search API.
     * Zabezpieczone przed prompt injection — AI dostaje tylko snippety, nie pełny HTML.
     */
    @Post(':id/search-products')
    searchProducts(@Param('id') id: string) {
        return this.service.searchProducts(id);
    }

    /** Zaznacza wybraną propozycję i przepisuje dane produktu do wymagania */
    @Patch('proposals/:proposalId/select')
    selectProposal(@Param('proposalId') proposalId: string) {
        return this.service.selectProposal(proposalId);
    }

    /** Ręczne dodanie propozycji produktu */
    @Post(':id/proposals')
    addProposal(
        @Param('id') id: string,
        @Body() body: { productName: string; manufacturer: string; model?: string; sourceUrl?: string },
    ) {
        return this.service.addManualProposal(id, { productName: body.productName || '', manufacturer: body.manufacturer || '', model: body.model, sourceUrl: body.sourceUrl });
    }

    /** Aktualizacja propozycji */
    @Patch('proposals/:proposalId')
    updateProposal(@Param('proposalId') proposalId: string, @Body() body: any) {
        return this.service.updateProposal(proposalId, body);
    }

    /** Upload karty katalogowej dla propozycji */
    @Post('proposals/:proposalId/upload-datasheet')
    @UseInterceptors(FileInterceptor('file'))
    uploadProposalDatasheet(@Param('proposalId') proposalId: string, @UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Brak pliku');
        return this.service.uploadProposalFile(proposalId, file, 'datasheet');
    }

    /** Upload karty zgodności dla propozycji */
    @Post('proposals/:proposalId/upload-compliance')
    @UseInterceptors(FileInterceptor('file'))
    uploadProposalCompliance(@Param('proposalId') proposalId: string, @UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Brak pliku');
        return this.service.uploadProposalFile(proposalId, file, 'compliance');
    }

    /** Upload obrazu dla propozycji */
    @Post('proposals/:proposalId/upload-image')
    @UseInterceptors(FileInterceptor('file'))
    uploadProposalImage(@Param('proposalId') proposalId: string, @UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Brak pliku');
        return this.service.uploadProposalImage(proposalId, file);
    }

    /** Pobierz obraz propozycji */
    @Get('proposals/:proposalId/image')
    async getProposalImage(@Param('proposalId') proposalId: string, @Res() res: Response) {
        const { stream, mimeType } = await this.service.getProposalImageStream(proposalId);
        res.set({ 'Content-Type': mimeType });
        stream.pipe(res);
    }

    /** Usunięcie propozycji */
    @Delete('proposals/:proposalId')
    deleteProposal(@Param('proposalId') proposalId: string) {
        return this.service.deleteProposal(proposalId);
    }
}
