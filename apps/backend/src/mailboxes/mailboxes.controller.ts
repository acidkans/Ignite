import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MailboxesService } from './mailboxes.service';

// @anchor mail-domains-controller
// Domeny pocztowe. Lista dla każdego zalogowanego (wybór domeny w skrzynce i w zamówieniu),
// zmiany tylko ADMIN.
@Controller('mail-domains')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MailDomainsController {
  constructor(private readonly mailboxes: MailboxesService) {}

  // @anchor get-mail-domains
  @Get()
  list(@Query('all') all?: string) {
    return this.mailboxes.listDomains(all === 'true');
  }

  // @anchor get-mail-domain-coverage
  @Get(':id/coverage')
  coverage(@Param('id') id: string) {
    return this.mailboxes.coverage(id);
  }

  // @anchor post-mail-domains
  @Post()
  @Roles('ADMIN')
  create(@Body() dto: any) {
    return this.mailboxes.createDomain(dto);
  }

  // @anchor patch-mail-domain
  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.mailboxes.updateDomain(id, dto);
  }

  // @anchor delete-mail-domain
  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.mailboxes.deleteDomain(id);
  }
}

// @anchor mailboxes-controller
// Skrzynki zalogowanego użytkownika — każdy zarządza tylko swoimi.
@Controller('mailboxes/me')
@UseGuards(JwtAuthGuard)
export class MailboxesController {
  constructor(private readonly mailboxes: MailboxesService) {}

  // @anchor get-my-mailboxes
  @Get()
  list(@Req() req: any) {
    return this.mailboxes.listMine(req.user.userId);
  }

  // @anchor post-my-mailbox
  @Post()
  create(@Req() req: any, @Body() dto: any) {
    return this.mailboxes.createMine(req.user.userId, dto);
  }

  // @anchor patch-my-mailbox
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.mailboxes.updateMine(req.user.userId, id, dto);
  }

  // @anchor delete-my-mailbox
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.mailboxes.deleteMine(req.user.userId, id);
  }

  // @anchor post-my-mailbox-test
  @Post(':id/test')
  test(@Req() req: any, @Param('id') id: string) {
    return this.mailboxes.testMine(req.user.userId, id);
  }
}
