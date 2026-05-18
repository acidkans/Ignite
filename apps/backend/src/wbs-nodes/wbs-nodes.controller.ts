import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { WbsNodesService } from './wbs-nodes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// @anchor wbs-nodes-controller
@Controller('wbs-nodes')
@UseGuards(JwtAuthGuard)
export class WbsNodesController {
    constructor(private readonly service: WbsNodesService) {}

    /**
     * Zwraca pełne drzewo WBS z danymi budżetowymi i materiałowymi
     * jako płaską listę z parentId (frontend buduje hierarchię).
     */
    // @anchor wbs-nodes-unified-get
    @Get('unified/:nodeId')
    getUnified(@Param('nodeId') nodeId: string, @Query('versionId') versionId?: string) {
        return this.service.getUnifiedTree(nodeId, versionId);
    }

    /**
     * Zapisuje całe drzewo WBS do tabeli relacyjnej (zastępuje dual-write przez order-requirements).
     */
    // @anchor wbs-nodes-unified-post
    @Post('unified/:nodeId')
    saveTree(
        @Param('nodeId') nodeId: string,
        @Query('versionId') versionId: string | undefined,
        @Body() tree: { items: any[] },
    ) {
        return this.service.saveTree(nodeId, versionId, tree);
    }

    /**
     * Tworzy nowy węzeł WBS.
     */
    // @anchor wbs-nodes-create
    @Post()
    create(@Body() data: { nodeId: string; parentId?: string; versionId?: string; name: string; type?: string; tags?: string[] }) {
        return this.service.createNode(data);
    }

    /**
     * Aktualizuje pola węzła WBS (nazwa, typ, status, owner itd.).
     */
    // @anchor wbs-nodes-update
    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.service.updateNode(id, data);
    }

    /**
     * Aktualizuje pola budżetowe na węźle WBS (inline edit z tabeli).
     */
    // @anchor wbs-nodes-update-budget
    @Patch(':id/budget')
    updateBudget(@Param('id') id: string, @Body() data: any) {
        return this.service.updateBudgetFields(id, data);
    }

    /**
     * Usuwa węzeł WBS i wszystkie jego dzieci.
     */
    // @anchor wbs-nodes-delete
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.deleteNode(id);
    }
}
