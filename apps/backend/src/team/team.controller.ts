
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { TeamService } from './team.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@Controller('teams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TeamController {
    constructor(private readonly teamService: TeamService) { }

    @Permissions('USER_READ') // Assuming basic user read permission is enough to see teams
    @Get()
    findAll() {
        return this.teamService.findAll();
    }

    @Permissions('USER_EDIT') // Assuming user edit permission allows managing teams
    @Post()
    create(@Body() createTeamDto: { name: string }) {
        return this.teamService.create(createTeamDto);
    }

    @Permissions('USER_EDIT')
    @Patch(':id')
    update(@Param('id') id: string, @Body() updateTeamDto: { name: string }) {
        return this.teamService.update(id, updateTeamDto);
    }

    @Permissions('USER_EDIT')
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.teamService.remove(id);
    }
}
