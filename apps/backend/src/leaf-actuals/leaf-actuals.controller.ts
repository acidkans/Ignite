import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LeafActualsService, LeafActualInput } from './leaf-actuals.service';

// @anchor leaf-actuals-controller
// Wpisy realizacji liścia — czytać może każdy zalogowany (panel porównawczy jest
// wspólny), dopisywać logistyk i manager. Kto może zmienić cudzy wpis, pilnuje
// serwis, bo to zależy od autora, nie od samej roli.
@Controller('leaf-actuals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeafActualsController {
    constructor(private readonly service: LeafActualsService) { }

    // @anchor leaf-actuals-list-endpoint — GET /leaf-actuals/order/:nodeId
    @Get('order/:nodeId')
    listByOrder(@Param('nodeId') nodeId: string, @Req() req: any) {
        return this.service.listByOrder(nodeId, req.user);
    }

    // @anchor leaf-actuals-create-endpoint — POST /leaf-actuals
    @Post()
    @Roles('ADMIN', 'MANAGER', 'LOGISTYK')
    create(@Body() body: LeafActualInput, @Req() req: any) {
        return this.service.create(body, req.user);
    }

    // @anchor leaf-actuals-update-endpoint — PATCH /leaf-actuals/:id
    @Patch(':id')
    @Roles('ADMIN', 'MANAGER', 'LOGISTYK')
    update(@Param('id') id: string, @Body() body: LeafActualInput, @Req() req: any) {
        return this.service.update(id, body, req.user);
    }

    // @anchor leaf-actuals-remove-endpoint — DELETE /leaf-actuals/:id
    @Delete(':id')
    @Roles('ADMIN', 'MANAGER', 'LOGISTYK')
    remove(@Param('id') id: string, @Req() req: any) {
        return this.service.remove(id, req.user);
    }

    // @anchor leaf-actuals-close-endpoint — PATCH /leaf-actuals/close/:wbsNodeId {closed}
    @Patch('close/:wbsNodeId')
    @Roles('ADMIN', 'MANAGER', 'LOGISTYK')
    setClosed(@Param('wbsNodeId') wbsNodeId: string, @Body() body: { closed?: boolean }, @Req() req: any) {
        return this.service.setClosed(wbsNodeId, !!body?.closed, req.user);
    }
}
