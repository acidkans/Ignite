import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe } from '@nestjs/common';
import { HardwareService } from './hardware.service';
import { CreateHardwareDto } from './dto/create-hardware.dto';
import { UpdateHardwareDto } from './dto/update-hardware.dto';

@Controller('hardware')
export class HardwareController {
    constructor(private readonly hardwareService: HardwareService) { }

    @Post()
    create(@Body() createHardwareDto: CreateHardwareDto) {
        return this.hardwareService.create(createHardwareDto);
    }

    @Get('site/:siteId')
    findAllBySite(@Param('siteId', ParseUUIDPipe) siteId: string) {
        return this.hardwareService.findAllBySite(siteId);
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.hardwareService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id', ParseUUIDPipe) id: string, @Body() updateHardwareDto: UpdateHardwareDto) {
        return this.hardwareService.update(id, updateHardwareDto);
    }

    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.hardwareService.remove(id);
    }
}
