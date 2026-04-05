import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { WbsNodesService } from './wbs-nodes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('wbs-nodes')
@UseGuards(JwtAuthGuard)
export class WbsNodesController {
    constructor(private readonly service: WbsNodesService) {}

    /**
     * Zwraca pełne drzewo WBS z danymi budżetowymi i materiałowymi
     * jako płaską listę z parentId (frontend buduje hierarchię).
     */
    @Get('unified/:nodeId')
    getUnified(@Param('nodeId') nodeId: string, @Query('versionId') versionId?: string) {
        return this.service.getUnifiedTree(nodeId, versionId);
    }

    /**
     * Tworzy nowy węzeł WBS.
     */
    @Post()
    create(@Body() data: { nodeId: string; parentId?: string; versionId?: string; name: string; type?: string; tags?: string[] }) {
        return this.service.createNode(data);
    }

    /**
     * Aktualizuje pola węzła WBS (nazwa, typ, status, owner itd.).
     */
    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.service.updateNode(id, data);
    }

    /**
     * Aktualizuje pola budżetowe na węźle WBS (inline edit z tabeli).
     */
    @Patch(':id/budget')
    updateBudget(@Param('id') id: string, @Body() data: any) {
        return this.service.updateBudgetFields(id, data);
    }

    /**
     * Usuwa węzeł WBS i wszystkie jego dzieci.
     */
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.deleteNode(id);
    }
}
