import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { DefaultProjectItemsService } from './default-project-items.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('default-project-items')
@UseGuards(JwtAuthGuard)
export class DefaultProjectItemsController {
    constructor(private readonly service: DefaultProjectItemsService) { }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Post()
    create(@Body() body: { category: string; name: string; description?: string; sortOrder?: number }) {
        return this.service.create(body);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: { category?: string; name?: string; description?: string; sortOrder?: number }) {
        return this.service.update(id, body);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
