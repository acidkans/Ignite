import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OffersService } from './offers.service';

@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
    constructor(private readonly service: OffersService) {}

    @Post()
    create(@Body() body: { nodeId: string; fileName: string; positions: any[]; documentId?: string }, @Req() req: any) {
        return this.service.create(body.nodeId, body.fileName, body.positions, body.documentId, req.user?.email || req.user?.sub);
    }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get('node/:nodeId')
    findByNode(@Param('nodeId') nodeId: string) {
        return this.service.findByNode(nodeId);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.service.delete(id);
    }
}
