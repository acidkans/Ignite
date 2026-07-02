import { Module } from '@nestjs/common';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';

@Module({
    controllers: [ExchangeRatesController],
    providers: [ExchangeRatesService],
    exports: [ExchangeRatesService],
})
// @anchor exchange-rates-module
export class ExchangeRatesModule { }
