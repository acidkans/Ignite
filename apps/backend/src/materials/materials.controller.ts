import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MaterialsService } from './materials.service';

@Controller('materials')
@UseGuards(JwtAuthGuard)
// @anchor materials-controller
export class MaterialsController {
    constructor(private readonly service: MaterialsService) {}

    // ─── KATALOG ──────────────────────────────────────────────────────────────

    // @anchor materials-get-all
    @Get()
    findAll() {
        return this.service.findAll();
    }

    // @anchor materials-get-database
    /** Materiały z kartą katalogową (dataSheetUrl != null) */
    @Get('database')
    findDatabase() {
        return this.service.findDatabase();
    }

    // @anchor materials-post-from-datasheet
    /** Upsert produktów z karty katalogowej */
    @Post('from-datasheet')
    createFromDatasheet(@Body() body: { documentId: string; nodeId: string; items: any[] }) {
        if (!body.documentId || !body.nodeId || !Array.isArray(body.items))
            throw new BadRequestException('documentId, nodeId i items wymagane');
        return this.service.createFromDatasheet(body.documentId, body.nodeId, body.items);
    }

    // @anchor materials-get-one
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    // @anchor materials-post-create
    @Post()
    create(@Body() body: any) {
        if (!body.manufacturer) throw new BadRequestException('manufacturer jest wymagany');
        return this.service.create(body);
    }

    // @anchor materials-patch-update
    @Patch(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body);
    }

    // @anchor materials-delete-one
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }

    // ─── STAN MAGAZYNOWY ──────────────────────────────────────────────────────

    // @anchor materials-get-stock
    @Get(':id/stock')
    findStock(@Param('id') id: string) {
        return this.service.findStock(id);
    }

    // @anchor materials-patch-stock
    @Patch(':id/stock')
    updateStock(@Param('id') id: string, @Body() body: { quantity: number; location?: string | null }) {
        if (body.quantity == null) throw new BadRequestException('quantity jest wymagane');
        return this.service.updateStock(id, body);
    }

    // ─── HISTORIA CEN ─────────────────────────────────────────────────────────

    // @anchor materials-get-proposals
    @Get(':id/proposals')
    findProposalHistory(@Param('id') id: string) {
        return this.service.findProposalHistory(id);
    }
}
