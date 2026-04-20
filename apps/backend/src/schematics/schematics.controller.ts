import { Controller, Post, Get, Delete, Body, Param, UseInterceptors, UploadedFile, BadRequestException, Patch, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SchematicsService } from './schematics.service';
import { Response } from 'express';
import * as path from 'path';

@Controller('schematics')
export class SchematicsController {
  constructor(private readonly schematicsService: SchematicsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('nodeId') nodeId: string,
    @Body('subtaskId') subtaskId?: string,
  ) {
    if (!file) throw new BadRequestException('Brak pliku');
    if (!nodeId) throw new BadRequestException('Brak nodeId');
    return this.schematicsService.uploadSchematic(file, nodeId, subtaskId);
  }

  @Get('node/:nodeId')
  async getSchematicsByNode(@Param('nodeId') nodeId: string) {
    return this.schematicsService.getSchematicsByNode(nodeId);
  }

  @Get('subtask/:subtaskId')
  async getSchematicsBySubtask(@Param('subtaskId') subtaskId: string) {
    return this.schematicsService.getSchematicsBySubtask(subtaskId);
  }

  @Get(':id')
  async getSchematic(@Param('id') id: string) {
    return this.schematicsService.getSchematic(id);
  }

  @Get('file/:fileName')
  async getSchematicFile(@Param('fileName') fileName: string, @Res() res: Response) {
      return this.schematicsService.getFile(fileName, res);
  }

  // --- Markers ---
  @Post(':schematicId/markers')
  async createMarker(
    @Param('schematicId') schematicId: string,
    @Body() data: { type?: string; x: number; y: number; x2?: number; y2?: number; pageNumber: number; note?: string; name?: string }
  ) {
    return this.schematicsService.createMarker(schematicId, data);
  }

  @Patch('markers/:markerId')
  async updateMarker(
    @Param('markerId') markerId: string,
    @Body() data: { type?: string; x?: number; y?: number; x2?: number; y2?: number; pageNumber?: number; note?: string; name?: string; subtaskId?: string | null }
  ) {
    return this.schematicsService.updateMarker(markerId, data);
  }

  @Delete('markers/:markerId')
  async deleteMarker(@Param('markerId') markerId: string) {
    return this.schematicsService.deleteMarker(markerId);
  }

  // --- Attachments ---
  @Post('markers/:markerId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
      @Param('markerId') markerId: string,
      @UploadedFile() file: Express.Multer.File,
  ) {
      if (!file) throw new BadRequestException('Brak pliku');
      return this.schematicsService.uploadMarkerAttachment(markerId, file);
  }

  @Patch('attachments/:attachmentId')
  async updateAttachment(@Param('attachmentId') attachmentId: string, @Body() data: { note: string }) {
      return this.schematicsService.updateMarkerAttachment(attachmentId, data);
  }

  @Delete('attachments/:attachmentId')
  async deleteAttachment(@Param('attachmentId') attachmentId: string) {
      return this.schematicsService.deleteMarkerAttachment(attachmentId);
  }

  @Delete(':id')
  async deleteSchematic(@Param('id') id: string) {
    return this.schematicsService.deleteSchematic(id);
  }

  // --- WBS Marker Links ---
  @Get('wbs-node-markers/:wbsNodeId')
  async getMarkersForWbsNode(@Param('wbsNodeId') wbsNodeId: string) {
    return this.schematicsService.getMarkersForWbsNode(wbsNodeId);
  }

  @Get('marker-wbs-links/:markerId')
  async getWbsLinksForMarker(@Param('markerId') markerId: string) {
    return this.schematicsService.getWbsLinksForMarker(markerId);
  }

  @Get('process-node-markers/:processNodeId')
  async getAllMarkersForProcessNode(@Param('processNodeId') processNodeId: string) {
    return this.schematicsService.getAllMarkersForProcessNode(processNodeId);
  }

  @Post('wbs-node-markers')
  async linkMarkerToWbsNode(@Body() data: { wbsNodeId: string; markerId: string }) {
    return this.schematicsService.linkMarkerToWbsNode(data.wbsNodeId, data.markerId);
  }

  @Delete('wbs-node-markers/:linkId')
  async unlinkMarkerFromWbsNode(@Param('linkId') linkId: string) {
    return this.schematicsService.unlinkMarkerFromWbsNode(linkId);
  }
}
