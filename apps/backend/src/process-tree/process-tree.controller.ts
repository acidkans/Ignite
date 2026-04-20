import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ProcessTreeService } from './process-tree.service';
import { CreateNodeDto, UpdateNodeDto, MoveNodeDto, UpdateNodePermissionsDto } from './dto/process-tree.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@Controller('process-tree')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProcessTreeController {
    constructor(private readonly processTreeService: ProcessTreeService) { }

    @Get()
    getTree(@Req() req: any) {
        return this.processTreeService.getTree(undefined, req.user);
    }

    @Permissions('TREE_EDIT')
    @Post('snapshot')
    takeSnapshot() {
        return this.processTreeService.takeSnapshot();
    }

    @Get(':id/info')
    getNodeInfo(@Param('id') id: string) {
        return this.processTreeService.getNodeInfo(id);
    }

    @Get(':id')
    getNode(@Param('id') id: string, @Req() req: any) {
        return this.processTreeService.getNode(id, req.user);
    }

    @Get(':id/path')
    getPath(@Param('id') id: string, @Req() req: any) {
        return this.processTreeService.getPath(id, req.user);
    }

    @Permissions('TREE_EDIT')
    @Post()
    create(@Body() dto: CreateNodeDto, @Req() req: any) {
        return this.processTreeService.create(dto, req.user);
    }

    @Permissions('TREE_EDIT')
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateNodeDto, @Req() req: any) {
        return this.processTreeService.update(id, dto, req.user);
    }

    @Permissions('TREE_EDIT')
    @Patch(':id/move')
    move(@Param('id') id: string, @Body() dto: MoveNodeDto, @Req() req: any) {
        return this.processTreeService.move(id, dto, req.user);
    }

    @Permissions('TREE_EDIT')
    @Delete(':id')
    delete(@Param('id') id: string, @Req() req: any) {
        console.log(`[ProcessTreeController] Deleting node ${id}`);
        return this.processTreeService.delete(id, req.user);
    }

    // Permission Management Endpoints
    @Permissions('TREE_VIEW')
    @Get(':id/permissions')
    getNodePermissions(@Param('id') id: string) {
        return this.processTreeService.getNodePermissions(id);
    }

    @Permissions('TREE_EDIT')
    @Patch(':id/permissions')
    updateNodePermissions(@Param('id') id: string, @Body() dto: UpdateNodePermissionsDto, @Req() req: any) {
        return this.processTreeService.updateNodePermissions(id, dto, req.user);
    }

    @Permissions('TREE_EDIT')
    @Patch('permissions/bulk')
    bulkUpdatePermissions(@Body() dto: any) {
        return this.processTreeService.bulkUpdatePermissions(dto);
    }
}
