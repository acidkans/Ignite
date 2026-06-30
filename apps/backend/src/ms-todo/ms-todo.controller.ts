import { Controller, Get, Post, Delete, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MsTodoService } from './ms-todo.service';

// @anchor ms-todo-controller
@Controller('ms-todo')
@UseGuards(JwtAuthGuard)
export class MsTodoController {
  constructor(private readonly msTodo: MsTodoService) {}

  // @anchor ms-todo-get-status-endpoint
  @Get('status')
  getStatus(@Req() req: any) {
    return this.msTodo.getStatus(req.user.userId);
  }

  // @anchor ms-todo-get-lists-endpoint
  @Get('lists')
  getLists(@Req() req: any) {
    return this.msTodo.fetchLists(req.user.userId);
  }

  // @anchor ms-todo-disconnect-endpoint
  @Delete('disconnect')
  disconnect(@Req() req: any) {
    return this.msTodo.disconnect(req.user.userId);
  }

  // @anchor ms-todo-resync-endpoint
  // Placeholder — właściwa logika sync w Etap 5 (NotificationCronService.syncSingleUser)
  @Post('resync')
  async resync(@Req() req: any) {
    await this.msTodo.bootstrapSync(req.user.userId);
    return { queued: true };
  }
}
