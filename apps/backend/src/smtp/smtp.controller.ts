import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SmtpService } from './smtp.service';

// @anchor smtp-controller
// Konfiguracja SMTP — tylko ADMIN. GET nie ujawnia hasła (zob. SmtpService.get).
@Controller('smtp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SmtpController {
  constructor(private readonly smtpService: SmtpService) {}

  @Get()
  get() {
    return this.smtpService.get();
  }

  @Patch()
  update(@Body() dto: any) {
    return this.smtpService.update(dto);
  }

  @Post('test')
  test(@Body() body: { to: string }) {
    return this.smtpService.sendTest(body?.to);
  }
}
