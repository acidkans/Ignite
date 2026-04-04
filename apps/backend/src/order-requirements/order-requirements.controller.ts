import { Controller, Get, Post, Param, Body, UseGuards, Query } from '@nestjs/common';
import { OrderRequirementsService } from './order-requirements.service';
import { UpsertOrderRequirementsDto } from './dto/order-requirements.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('order-requirements')
@UseGuards(JwtAuthGuard)
export class OrderRequirementsController {
    constructor(private readonly service: OrderRequirementsService) { }

    @Get(':nodeId')
    findByNodeId(@Param('nodeId') nodeId: string, @Query('versionId') versionId: string) {
        return this.service.findByNodeId(nodeId, versionId);
    }

    @Post()
    upsert(@Body() dto: UpsertOrderRequirementsDto) {
        return this.service.upsert(dto);
    }
}
