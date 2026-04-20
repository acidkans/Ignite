import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { SubtasksService } from './subtasks.service';
import { CreateSubtaskDto, UpdateSubtaskDto, CreateTemplateDto } from './dto/subtask.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('subtasks')
@UseGuards(JwtAuthGuard)
export class SubtasksController {
    constructor(private readonly subtasksService: SubtasksService) { }

    @Post()
    create(@Body() dto: CreateSubtaskDto, @Req() req: any) {
        return this.subtasksService.create(dto, req.user);
    }

    @Get('assigned/me')
    findAllAssignedToMe(@Req() req: any) {
        return this.subtasksService.findAllAssignedToMe(req.user);
    }

    @Get('node/:nodeId')
    findAllByNode(@Param('nodeId') nodeId: string, @Req() req: any, @Query('versionId') versionId?: string) {
        return this.subtasksService.findAllByNode(nodeId, req.user, versionId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateSubtaskDto) {
        return this.subtasksService.update(id, dto);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.subtasksService.delete(id);
    }

    @Post('batch/:nodeId')
    batchUpsert(
        @Param('nodeId') nodeId: string,
        @Query('versionId') versionId: string,
        @Body() tasks: any[]
    ) {
        return this.subtasksService.batchUpsert(nodeId, versionId, tasks);
    }

    // Templates
    @Get('templates')
    findAllTemplates() {
        return this.subtasksService.findAllTemplates();
    }

    @Post('templates')
    createTemplate(@Body() dto: CreateTemplateDto) {
        return this.subtasksService.createTemplate(dto);
    }

    @Delete('templates/:id')
    deleteTemplate(@Param('id') id: string) {
        return this.subtasksService.deleteTemplate(id);
    }
}
