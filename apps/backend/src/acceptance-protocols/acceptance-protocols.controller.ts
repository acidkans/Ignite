import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AcceptanceProtocolsService } from './acceptance-protocols.service';
import { ProtokolOdbioruDto, ZapisProtokoluDto } from './acceptance-protocol.dto';

// @anchor acceptance-protocols-controller
// POST /acceptance-protocols/docx — protokół odbioru robót jako plik Word.
// Wariantu PDF tu NIE ma świadomie: front składa z tych samych danych HTML
// (`buildProtokolHtml`) i renderuje go przez `/pdf/render`, więc wydruk z przeglądarki
// i plik wysłany mailem wychodzą znak w znak takie same.
//
// Reszta tras to REJESTR odbiorów: co i za ile zostało już odebrane. Generowanie pliku
// i zapis odbioru są rozdzielone celowo — podgląd protokołu niczego nie odbiera.
@Controller('acceptance-protocols')
@UseGuards(JwtAuthGuard)
export class AcceptanceProtocolsController {
    constructor(private readonly service: AcceptanceProtocolsService) {}

    @Post('docx')
    async docx(@Body() body: ProtokolOdbioruDto & { filename?: string }, @Res() res: Response) {
        const buffer = await this.service.buildDocx(body);
        // Nazwa pliku w nagłówku HTTP musi zostać ASCII (polskie znaki wywracają
        // Content-Disposition); front i tak nadaje własną nazwę przy zapisie blobu.
        const filename = (body?.filename || 'protokol-odbioru.docx').replace(/[^\w.\-]+/g, '_');
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': String(buffer.length),
        });
        res.end(buffer);
    }

    // @anchor acceptance-protocols-status-endpoint
    @Get(':nodeId/status')
    status(@Param('nodeId') nodeId: string) {
        return this.service.getStatus(nodeId);
    }

    // @anchor acceptance-protocols-record-endpoint
    @Post(':nodeId/record')
    record(@Req() req: any, @Param('nodeId') nodeId: string, @Body() body: ZapisProtokoluDto) {
        return this.service.record(nodeId, body, req.user?.userId);
    }

    // @anchor acceptance-protocols-list-endpoint
    @Get(':nodeId')
    list(@Param('nodeId') nodeId: string) {
        return this.service.list(nodeId);
    }

    // @anchor acceptance-protocols-remove-endpoint
    @Delete(':nodeId/:protocolId')
    remove(@Param('nodeId') nodeId: string, @Param('protocolId') protocolId: string) {
        return this.service.remove(nodeId, protocolId);
    }
}
