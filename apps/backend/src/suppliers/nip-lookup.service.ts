import { Injectable, Logger } from '@nestjs/common';

// @anchor nip-lookup-result
export type NipLookupResult = {
    name: string;
    address: string | null;
    regon: string | null;
    vatStatus: string | null; // "Czynny" | "Zwolniony" | null
};

// @anchor nip-lookup-service
// Klon wzorca ExchangeRatesService (NBP): jedno źródło danych o podatniku
// z Białej listy podatników VAT (wl-api.mf.gov.pl, REST, bez klucza).
@Injectable()
export class NipLookupService {
    private readonly logger = new Logger(NipLookupService.name);

    // @anchor normalize-nip — usuwa separatory i prefiks PL; zwraca 10 cyfr albo null.
    normalizeNip(raw: string): string | null {
        if (!raw) return null;
        const digits = raw.replace(/^PL/i, '').replace(/[\s-]/g, '');
        return /^\d{10}$/.test(digits) ? digits : null;
    }

    // @anchor validate-nip-checksum — suma kontrolna NIP (wagi 6,5,7,2,3,4,5,6,7 mod 11).
    validateNipChecksum(nip: string): boolean {
        const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
        const digits = nip.split('').map(Number);
        const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
        return sum % 11 === digits[9];
    }

    // @anchor nip-lookup-fetch — jedyne źródło danych z Białej listy VAT; reużywane przez CRUD dostawców.
    async lookup(nip: string): Promise<NipLookupResult | null> {
        try {
            const date = new Date().toISOString().slice(0, 10);
            const res = await fetch(
                `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`,
                { headers: { Accept: 'application/json' } }
            );
            if (!res.ok) {
                this.logger.warn(`Biała lista VAT: HTTP ${res.status} dla NIP ${nip}`);
                return null;
            }
            const data: any = await res.json();
            const subject = data?.result?.subject;
            if (!subject?.name) return null;
            return {
                name: subject.name,
                address: subject.workingAddress || subject.residenceAddress || null,
                regon: subject.regon || null,
                vatStatus: subject.statusVat || null,
            };
        } catch (e: any) {
            this.logger.warn(`Biała lista VAT niedostępna dla NIP ${nip}: ${e?.message}`);
            return null;
        }
    }
}
