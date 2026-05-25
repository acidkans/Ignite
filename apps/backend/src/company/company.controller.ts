import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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

  @Patch()
  update(@Body() dto: any) {
    return this.companyService.update(dto);
  }
}
