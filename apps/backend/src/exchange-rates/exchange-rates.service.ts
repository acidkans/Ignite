import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

export type NbpRate = { rate: number; date: string };

// @anchor exchange-rates-service
@Injectable()
export class ExchangeRatesService implements OnModuleInit {
    private readonly logger = new Logger(ExchangeRatesService.name);

    // Waluty odświeżane w cronie i serwowane do UI (nagłówek Dashboardu).
    private static readonly TRACKED = ['EUR', 'USD'];

    // @anchor exchange-rates-cache — kursy w pamięci, odświeżane raz dziennie o północy.
    private cache: Record<string, NbpRate> = {};

    async onModuleInit(): Promise<void> {
        // Pierwsze pobranie przy starcie — żeby nagłówek nie był pusty do najbliższej północy.
        await this.refresh();
    }

    // @anchor exchange-rates-cron — codziennie o północy odświeża kursy z NBP.
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async refresh(): Promise<void> {
        for (const code of ExchangeRatesService.TRACKED) {
            const r = await this.fetchNbpRate(code);
            if (r) this.cache[code] = r;
        }
        this.logger.log(`[ExchangeRates] odświeżono kursy: ${JSON.stringify(this.cache)}`);
    }

    // @anchor exchange-rates-get — zwraca aktualnie zbuforowane kursy (EUR, USD).
    getRates(): Record<string, NbpRate> {
        return this.cache;
    }

    // @anchor fetch-nbp-rate — jedyne źródło kursu NBP; reużywane przez import ofert i cron.
    async fetchNbpRate(currency: string): Promise<NbpRate | null> {
        try {
            const res = await fetch(
                `https://api.nbp.pl/api/exchangerates/rates/a/${currency.toLowerCase()}/?format=json`,
                { headers: { Accept: 'application/json' } }
            );
            if (!res.ok) return null;
            const data: any = await res.json();
            const latest = data?.rates?.[0];
            return latest ? { rate: latest.mid, date: latest.effectiveDate } : null;
        } catch { return null; }
    }
}
