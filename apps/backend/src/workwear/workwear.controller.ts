import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WorkwearService } from './workwear.service';

// @anchor workwear-controller — moduł jest pod „Użytkownicy", więc tylko ADMIN.
@Controller('workwear')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class WorkwearController {
    constructor(private readonly workwear: WorkwearService) {}

    // @anchor workwear-overview-endpoint — GET /workwear/overview
    @Get('overview')
    overview() {
        return this.workwear.overview();
    }

    // @anchor workwear-add-item-endpoint — POST /workwear/items {name}
    @Post('items')
    addItem(@Body() body: { name: string }) {
        return this.workwear.addItem(body?.name);
    }

    // @anchor workwear-size-endpoint — PUT /workwear/users/:userId/items/:item {sizeScale, size}
    @Put('users/:userId/items/:item')
    setSize(@Param('userId') userId: string, @Param('item') item: string, @Body() body: { sizeScale: string; size: string | null }) {
        return this.workwear.setSize(userId, item, body?.sizeScale, body?.size ?? null);
    }
}
