// Test generatora protokołu odbioru prac — składa DOCX z danymi ze wzoru Airtela
// (ZDC1_2026_PPOŻ_21.08.2026) i zapisuje go obok, do ręcznego porównania z oryginałem.
// Uruchomienie: cd apps/backend && npx ts-node ../../test/generuj-protokol-testowy.ts

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AcceptanceProtocolsService } from '../apps/backend/src/acceptance-protocols/acceptance-protocols.service';
import { ProtokolOdbioruDto } from '../apps/backend/src/acceptance-protocols/acceptance-protocol.dto';

const publicDir = join(__dirname, '..', 'apps', 'frontend', 'public');
const dataUrl = (plik: string) => {
    const p = join(publicDir, plik);
    if (!existsSync(p)) { console.warn(`[test] brak ${plik} — dokument bez obrazka`); return ''; }
    return `data:image/png;base64,${readFileSync(p).toString('base64')}`;
};

const dane: ProtokolOdbioruDto = {
    numer: 'Protokół odbioru prac -CMC- Serwerownia ZDC1-K9_2026 instalacje HVAC 30.08.2026',
    data: '21.08.2026',
    umowa: 'Oferta z dnia 15.05.2026',
    zamawiajacy: { nazwa: 'Airtel Services sp. z o.o.', adres: 'Pawliczka 25, 41-800 Zabrze, Polska', nip: '6412533849' },
    wykonawca: { nazwa: 'NETFORMERS SP. Z O.O.', adres: 'ul. Przykladowa 1, 00-001 Warszawa', nip: '5272876750' },
    wartosci: [
        {
            zakres: 'Uszczelnienie i oznaczenie przejść instalacyjnych PPOŻ',
            wartosc: 5100,
            pozycje: [
                { nazwa: 'Usunięcie niecertyfikowanych pianek montażowych z przepustów', wartosc: 1200 },
                { nazwa: 'Wypełnienie przejść masą ogniochronną', wartosc: 3100 },
                { nazwa: 'Etykiety informacyjne na zabezpieczonych przejściach', wartosc: 800 },
            ],
        },
        {
            zakres: 'Doposażenie drzwi serwerowni w samozamykacze I uszczelkę',
            wartosc: 1900,
            pozycje: [
                { nazwa: 'Samozamykacze 2 szt.', wartosc: 1400 },
                { nazwa: 'Uszczelka samoopadająca nawierzchniowa 1 szt.', wartosc: 500 },
            ],
        },
    ],
    suma: 7000,
    odbior: 'CALOSCIOWY',
    wynik: 'POZYTYWNY',
    wady: '',
    protokolUsterkowy: false,
    uwagi: '',
    zalaczniki: '',
    dataPodpisuAirtel: '24.08.2026',
    dataPodpisuPodwykonawcy: '21.08.2026',
    dataPodpisuInspektora: '26.08.2026',
    przedstawicielAirtel: 'Andrzej Romanowicz',
    przedstawicielPodwykonawcy: 'Marek Zawadzki',
    inspektorNadzoru: 'Tomasz Król',
    logoDataUrl: dataUrl('airtel-logo-services.png'),
    podpisDataUrl: dataUrl('podpis-airtel.png'),
};

(async () => {
    // Serwis wymaga PrismaService (rejestr odbiorów), ale `buildDocx` bazy nie dotyka —
    // dla samego generowania dokumentu wystarczy atrapa.
    const buf = await new AcceptanceProtocolsService(null as any).buildDocx(dane);
    const out = join(__dirname, 'protokol-testowy.docx');
    writeFileSync(out, buf);
    console.log(`[test] zapisano ${out} — ${(buf.length / 1024).toFixed(1)} kB`);
})().catch((e) => { console.error('[test] BŁĄD:', e); process.exit(1); });
