import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

// @anchor back-endpoint-company
// /company → singleton „mojej firmy" dla całej organizacji.
@Controller('company')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  get() {
    return this.companyService.get();
  }

  // @anchor company-update-endpoint
  /// Dane firmy edytuje wyłącznie ADMIN — odczyt zostaje dla wszystkich zalogowanych,
  /// bo nagłówki eksportów i ofert biorą stąd nazwę i adres.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch()
  update(@Body() dto: any) {
    return this.companyService.update(dto);
  }
}
