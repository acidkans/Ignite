import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
// @anchor orders-controller
export class OrdersController {
    constructor(private readonly service: OrdersService) { }

    // @anchor orders-acceptance-endpoint — GET /orders/:nodeId/acceptance → stan akceptacji.
    @Get(':nodeId/acceptance')
    getAcceptance(@Param('nodeId') nodeId: string) {
        return this.service.getAcceptance(nodeId);
    }

    // @anchor orders-accept-preview-endpoint — GET /orders/:nodeId/accept-preview?versionId=
    // → suma budżetu wersji + zamrożone wyceny do modala potwierdzenia.
    @Get(':nodeId/accept-preview')
    acceptPreview(@Param('nodeId') nodeId: string, @Query('versionId') versionId: string) {
        if (!versionId) throw new BadRequestException('versionId wymagane');
        return this.service.acceptPreview(nodeId, versionId);
    }

    // @anchor orders-comparison-endpoint — GET /orders/:nodeId/comparison →
    // wiersze baseline↔żywe (parowanie po sourceRequirementId) + KPI (Δ, prognoza,
    // pokrycie, rozkład odchyleń); {accepted:false} gdy brak zaakceptowanej wersji.
    @Get(':nodeId/comparison')
    comparison(@Param('nodeId') nodeId: string) {
        return this.service.comparison(nodeId);
    }

    // @anchor orders-accept-endpoint — POST /orders/:nodeId/accept {versionId, quickQuoteId?}
    // — tylko manager/admin; jedna transakcja (pointer + etap + BASELINE + AuditLog).
    @Post(':nodeId/accept')
    @Roles('ADMIN', 'MANAGER')
    accept(
        @Param('nodeId') nodeId: string,
        @Body() body: { versionId: string; quickQuoteId?: string | null },
        @Req() req: any,
    ) {
        if (!body?.versionId) throw new BadRequestException('versionId wymagane');
        return this.service.accept(nodeId, body.versionId, body.quickQuoteId, req.user?.email);
    }

    // @anchor orders-revoke-accept-endpoint — POST /orders/:nodeId/revoke-accept {reason}
    // — osobna głośna akcja z powodem; tylko manager/admin.
    @Post(':nodeId/revoke-accept')
    @Roles('ADMIN', 'MANAGER')
    revokeAccept(@Param('nodeId') nodeId: string, @Body() body: { reason: string }, @Req() req: any) {
        return this.service.revokeAccept(nodeId, body?.reason ?? '', req.user?.email);
    }
}
