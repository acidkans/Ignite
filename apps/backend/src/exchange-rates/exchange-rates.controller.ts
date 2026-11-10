import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
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

    // @anchor exchange-rates-cross-endpoint — GET /exchange-rates/cross?from=EUR&to=PLN&date=YYYY-MM-DD
    // → { rate, date }: podgląd przeliczenia w formularzu zakupu (ten sam kurs liczy potem zapis wpisu).
    @Get('cross')
    async getCross(@Query('from') from: string, @Query('to') to: string, @Query('date') date?: string) {
        if (!/^[A-Za-z]{3}$/.test(from || '') || !/^[A-Za-z]{3}$/.test(to || '')) throw new BadRequestException('Kod waluty: 3 litery');
        const day = date ? new Date(`${date}T00:00:00Z`) : new Date();
        if (Number.isNaN(day.getTime())) throw new BadRequestException('Zła data');
        const r = await this.service.getCrossRate(from, to, day);
        if (!r) throw new BadRequestException(`Brak kursu NBP dla ${from}/${to}`);
        return r;
    }
}
