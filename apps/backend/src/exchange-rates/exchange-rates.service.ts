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

    // @anchor exchange-rates-dated-cache — kursy historyczne per (waluta, dzień zdarzenia); tabela A się nie zmienia
    private dated: Record<string, NbpRate> = {};

    // @anchor fetch-nbp-rate-before — kurs średni NBP (tabela A) z ostatniego dnia roboczego PRZED `day`
    // (reguła jak w księgowości). Zakres 10 dni wstecz pokrywa weekendy i święta; brak danych w zakresie
    // (np. data z przyszłości) → najnowszy opublikowany kurs.
    async fetchNbpRateBefore(currency: string, day: Date): Promise<NbpRate | null> {
        const code = currency.toUpperCase();
        if (code === 'PLN') return { rate: 1, date: ymd(day) };
        const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - 1));
        const start = new Date(end.getTime() - 10 * 86400000);
        const key = `${code}|${ymd(end)}`;
        if (this.dated[key]) return this.dated[key];
        if (end.getTime() > Date.now()) return this.fetchNbpRate(code);
        try {
            const res = await fetch(
                `https://api.nbp.pl/api/exchangerates/rates/a/${code.toLowerCase()}/${ymd(start)}/${ymd(end)}/?format=json`,
                { headers: { Accept: 'application/json' } }
            );
            if (res.ok) {
                const data: any = await res.json();
                const last = data?.rates?.[data.rates.length - 1];
                if (last) return (this.dated[key] = { rate: last.mid, date: last.effectiveDate });
            }
        } catch { /* sieć — spada na najnowszy kurs */ }
        return this.fetchNbpRate(code);
    }

    // @anchor exchange-rate-cross — kurs `from` → `to` na dzień zdarzenia. NBP podaje wszystko względem PLN,
    // więc para obca↔obca (USD→EUR) to iloraz dwóch kursów. Zwraca null, gdy NBP nie odpowiada.
    async getCrossRate(from: string, to: string, day: Date): Promise<NbpRate | null> {
        const f = from.toUpperCase();
        const t = to.toUpperCase();
        if (f === t) return { rate: 1, date: ymd(day) };
        const [rf, rt] = await Promise.all([this.fetchNbpRateBefore(f, day), this.fetchNbpRateBefore(t, day)]);
        if (!rf || !rt) return null;
        const date = f === 'PLN' ? rt.date : rf.date;
        return { rate: Math.round((rf.rate / rt.rate) * 1e6) / 1e6, date };
    }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
