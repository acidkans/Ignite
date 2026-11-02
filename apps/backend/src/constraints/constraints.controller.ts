import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ConstraintsService, ConstraintInput } from './constraints.service';

// @anchor constraints-controller
// Blokery realizacji — czyta każdy zalogowany (drzewo i Kokpit), zapisuje manager i logistyk.
@Controller('constraints')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConstraintsController {
    constructor(private readonly service: ConstraintsService) { }

    // @anchor constraints-list-endpoint — GET /constraints/order/:nodeId
    @Get('order/:nodeId')
    list(@Param('nodeId') nodeId: string) {
        return this.service.listByOrder(nodeId);
    }

    // @anchor constraints-create-endpoint — POST /constraints/order/:nodeId
    @Post('order/:nodeId')
    @Roles('ADMIN', 'MANAGER', 'LOGISTYK')
    create(@Param('nodeId') nodeId: string, @Body() body: ConstraintInput, @Req() req: any) {
        return this.service.create(nodeId, body, req.user);
    }

    // @anchor constraints-update-endpoint — PATCH /constraints/:id
    @Patch(':id')
    @Roles('ADMIN', 'MANAGER', 'LOGISTYK')
    update(@Param('id') id: string, @Body() body: ConstraintInput, @Req() req: any) {
        return this.service.update(id, body, req.user);
    }

    // @anchor constraints-remove-endpoint — DELETE /constraints/:id
    @Delete(':id')
    @Roles('ADMIN', 'MANAGER', 'LOGISTYK')
    remove(@Param('id') id: string, @Req() req: any) {
        return this.service.remove(id, req.user);
    }
}
