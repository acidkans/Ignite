import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ScopeDocumentsService } from './scope-documents.service';

// „Opis zakresu prac" (załącznik do oferty) — docs/PLAN-opis-zakresu-oferty.md.
// `:nodeId` = zamówienie (ProcessNode type='order'); `versionId` = wersja WBS (domyślnie aktywna).
// @anchor scope-documents-controller
@Controller('scope-documents')
@UseGuards(JwtAuthGuard)
export class ScopeDocumentsController {
    constructor(private readonly service: ScopeDocumentsService) { }

    // @anchor scope-documents-get-endpoint — stan dokumentu + model wyliczony z drzewa (podgląd).
    @Get(':nodeId')
    get(@Param('nodeId') nodeId: string, @Query('versionId') versionId?: string) {
        return this.service.get(nodeId, versionId);
    }

    // @anchor scope-documents-patch-endpoint — edycja: teksty sekcji, układ, ważność, gwarancja, czas prac.
    @Patch(':nodeId')
    update(@Param('nodeId') nodeId: string, @Body() body: any) {
        return this.service.update(nodeId, body);
    }

    // @anchor scope-documents-detect-layout-endpoint — AI: pakiety vs lokalizacje (propozycja do zatwierdzenia).
    @Post(':nodeId/detect-layout')
    detectLayout(@Param('nodeId') nodeId: string, @Body() body: any) {
        return this.service.detectLayout(nodeId, body?.versionId);
    }

    // @anchor scope-documents-generate-endpoint — AI: sekcje opisowe; `only` = sekcje do nadpisania.
    @Post(':nodeId/generate')
    generate(@Param('nodeId') nodeId: string, @Body() body: any) {
        return this.service.generateSections(nodeId, body?.versionId, Array.isArray(body?.only) ? body.only : undefined);
    }

    // @anchor scope-documents-suggest-items-endpoint — AI: kluczowe pozycje → showInScope=true.
    @Post(':nodeId/suggest-items')
    suggestItems(@Param('nodeId') nodeId: string, @Body() body: any) {
        return this.service.suggestScopeItems(nodeId, body?.versionId);
    }

    // @anchor scope-documents-preview-endpoint — HTML dokumentu do podglądu (bez zapisu, bez numeru).
    @Get(':nodeId/preview')
    async preview(@Param('nodeId') nodeId: string, @Query('versionId') versionId: string | undefined, @Res() res: Response) {
        const html = await this.service.renderHtml(nodeId, versionId);
        res.type('html').send(html);
    }

    // @anchor scope-documents-pdf-endpoint — zapis PDF do dokumentów zamówienia (+ numer oferty, wersja).
    @Post(':nodeId/pdf')
    savePdf(@Param('nodeId') nodeId: string, @Body() body: any, @Req() _req: any) {
        return this.service.savePdf(nodeId, body?.versionId);
    }
}
