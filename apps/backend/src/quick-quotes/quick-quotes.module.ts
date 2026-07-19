import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { QuickQuotesController } from './quick-quotes.controller';
import { QuickQuotesService } from './quick-quotes.service';
import { SUPPLIER_GATEWAYS } from './supplier-gateway';

@Module({
    imports: [PrismaModule, ExchangeRatesModule],
    controllers: [QuickQuotesController],
    providers: [
        QuickQuotesService,
        // Adaptery API dostawców — pierwszy adapter dojdzie po wyborze dostawcy
        // startowego (otwarta decyzja F3); pusta lista = kanały STOCK/MANUAL działają.
        { provide: SUPPLIER_GATEWAYS, useValue: [] },
    ],
    exports: [QuickQuotesService],
})
// @anchor quick-quotes-module
export class QuickQuotesModule { }
