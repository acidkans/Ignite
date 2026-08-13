import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { resolveSmtpProfile, SmtpService } from './smtp.service';

// @anchor smtp-controller
// Konfiguracja SMTP — tylko ADMIN. GET nie ujawnia hasła (zob. SmtpService.get).
// Parametr `profile` wybiera zestaw ustawień: brak / 'singleton' = globalny, 'leaves' = Urlopy.
@Controller('smtp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SmtpController {
  constructor(private readonly smtpService: SmtpService) {}

  @Get()
  get(@Query('profile') profile?: string) {
    return this.smtpService.get(resolveSmtpProfile(profile));
  }

  @Patch()
  update(@Body() dto: any, @Query('profile') profile?: string) {
    return this.smtpService.update(dto, resolveSmtpProfile(profile));
  }

  @Post('test')
  test(@Body() body: { to: string }, @Query('profile') profile?: string) {
    return this.smtpService.sendTest(body?.to, resolveSmtpProfile(profile));
  }
}
