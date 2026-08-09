import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { WbsLeafDefaultsService } from './wbs-leaf-defaults.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('wbs-leaf-defaults')
@UseGuards(JwtAuthGuard)
export class WbsLeafDefaultsController {
    constructor(private readonly service: WbsLeafDefaultsService) { }

    @Get(':nodeId')
    findByNode(@Param('nodeId') nodeId: string) {
        return this.service.findByNode(nodeId);
    }

    @Put(':nodeId')
    upsert(@Param('nodeId') nodeId: string, @Body() body: { data: Record<string, any> }) {
        return this.service.upsert(nodeId, body?.data ?? {});
    }
}
