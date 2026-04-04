import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN', 'MANAGER') // Removed to allow USER access with filtering
  @Get()
  async findAll(@Request() req) {
    const userRoles = req.user.roles || [];
    const isAdminOrManager = userRoles.some(role => ['ADMIN', 'MANAGER'].includes(role));

    if (isAdminOrManager) {
      return this.usersService.findAll();
    } else {
      // Return only self, wrapped in array
      const user = await this.usersService.findById(req.user.userId);
      return user ? [user] : [];
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() userData: any) {
    return this.usersService.create(userData);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() userData: any) {
    // Both ADMIN and MANAGER can update users
    return this.usersService.update(id, userData);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('by-role/:roleName')
  findByRole(@Param('roleName') roleName: string) {
    return this.usersService.findByRole(roleName);
  }
}
