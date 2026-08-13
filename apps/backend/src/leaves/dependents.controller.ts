import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDependentDto, DependentsService, UpdateDependentDto } from './dependents.service';

// @anchor dependents-controller
@Controller('dependents')
@UseGuards(JwtAuthGuard)
export class DependentsController {
  constructor(private readonly dependents: DependentsService) {}

  // @anchor dependents-list-endpoint
  @Get()
  list(@Req() req: any, @Query('userId') userId?: string) {
    return this.dependents.list(req.user.userId, req.user.roles || [], userId);
  }

  // @anchor dependents-create-endpoint
  @Post()
  create(@Req() req: any, @Body() dto: CreateDependentDto) {
    return this.dependents.create(req.user.userId, req.user.roles || [], dto);
  }

  // @anchor dependents-update-endpoint
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDependentDto) {
    return this.dependents.update(req.user.userId, req.user.roles || [], id, dto);
  }

  // @anchor dependents-delete-endpoint
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.dependents.remove(req.user.userId, req.user.roles || [], id);
  }
}
