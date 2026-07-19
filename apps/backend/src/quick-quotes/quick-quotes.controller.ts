import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuickQuoteItemInput, QuickQuotesService } from './quick-quotes.service';

@Controller('quick-quotes')
@UseGuards(JwtAuthGuard)
// @anchor quick-quotes-controller
export class QuickQuotesController {
    constructor(private readonly service: QuickQuotesService) { }

    private user(req: any): string | undefined {
        return req.user?.email || req.user?.sub;
    }

    // @anchor quick-quotes-get-endpoint — GET /quick-quotes[?nodeId=] → nagłówki wycen.
    @Get()
    list(@Query('nodeId') nodeId?: string) {
        return this.service.list(nodeId || undefined);
    }

    // @anchor quick-quotes-get-one-endpoint — GET /quick-quotes/:id → wycena z pozycjami.
    @Get(':id')
    get(@Param('id') id: string) {
        return this.service.get(id);
    }

    // @anchor quick-quotes-post-endpoint
    @Post()
    create(@Body() body: { nodeId: string; name: string }, @Req() req: any) {
        if (!body.nodeId || !body.name?.trim()) throw new BadRequestException('nodeId i name wymagane');
        return this.service.create(body.nodeId, body.name.trim(), this.user(req));
    }

    // @anchor quick-quotes-patch-endpoint
    @Patch(':id')
    update(@Param('id') id: string, @Body() body: { name?: string; validUntil?: string | null }) {
        return this.service.update(id, body);
    }

    // @anchor quick-quotes-delete-endpoint
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }

    // @anchor quick-quotes-status-endpoint — PATCH /quick-quotes/:id/status {status};
    // LOCKED uruchamia re-walidację magazynu + zapis budżetu wymagań.
    @Patch(':id/status')
    changeStatus(@Param('id') id: string, @Body() body: { status: string }, @Req() req: any) {
        if (!body.status) throw new BadRequestException('status wymagany');
        return this.service.changeStatus(id, body.status, this.user(req));
    }

    // @anchor quick-quotes-new-version-endpoint
    @Post(':id/new-version')
    newVersion(@Param('id') id: string, @Req() req: any) {
        return this.service.createNewVersion(id, this.user(req));
    }

    // @anchor quick-quotes-post-item-endpoint
    @Post(':id/items')
    addItem(@Param('id') id: string, @Body() body: QuickQuoteItemInput, @Req() req: any) {
        return this.service.addItem(id, body || {}, this.user(req));
    }

    // @anchor quick-quotes-patch-item-endpoint
    @Patch(':id/items/:itemId')
    updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: QuickQuoteItemInput) {
        return this.service.updateItem(id, itemId, body || {});
    }

    // @anchor quick-quotes-delete-item-endpoint
    @Delete(':id/items/:itemId')
    removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
        return this.service.removeItem(id, itemId);
    }

    // @anchor quick-quotes-stock-endpoint — POST /quick-quotes/:id/items/from-stock →
    // kandydaci z magazynu (pełne pokrycie, wycena wg Material.priceNetto).
    @Post(':id/items/from-stock')
    addStockItems(@Param('id') id: string, @Req() req: any) {
        return this.service.addStockItems(id, this.user(req));
    }

    // @anchor quick-quotes-query-api-endpoint — POST /quick-quotes/:id/items/query-api
    // {supplierId, materialRequirementId?, query?} → pozycje z adaptera API dostawcy.
    @Post(':id/items/query-api')
    queryApi(
        @Param('id') id: string,
        @Body() body: { supplierId: string; materialRequirementId?: string | null; query?: string },
        @Req() req: any,
    ) {
        if (!body?.supplierId) throw new BadRequestException('supplierId wymagany');
        return this.service.queryApi(id, body, this.user(req));
    }
}
