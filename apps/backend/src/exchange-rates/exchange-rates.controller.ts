import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExchangeRatesService } from './exchange-rates.service';

@Controller('exchange-rates')
@UseGuards(JwtAuthGuard)
// @anchor exchange-rates-controller
export class ExchangeRatesController {
    constructor(private readonly service: ExchangeRatesService) { }

    // @anchor exchange-rates-endpoint — GET /exchange-rates → { EUR: {rate,date}, USD: {rate,date} }
    @Get()
    getRates() {
        return this.service.getRates();
    }
}
