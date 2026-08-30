// Uzupełnia dane firm wykonawczych zamówienia „CMC- Serwerownia ZDC1-K9_2026":
//   1) wpisuje firmy do rejestru `suppliers` (dedup po NIP — ten sam rejestr obsługuje
//      dostawców materiału i wykonawców robót),
//   2) dopisuje NIP do kontaktów zamówienia (`order_requirements`), skąd protokół odbioru
//      bierze wiersz „Wykonawca".
//
// NIP-y pochodzą z Białej listy podatników VAT (wl-api.mf.gov.pl) — skrypt POBIERA je
// ponownie przy każdym uruchomieniu i przerywa, jeśli NIP nie odpowiada firmie z listy.
// Nazwa i adres w rejestrze zawsze z Białej listy, nigdy z ręki.
//
// Uruchomienie: cd apps/backend && npx ts-node --compiler-options '{"module":"commonjs"}' ../../test/uzupelnij-firmy-cmc.ts
// Podgląd bez zapisu: dopisz argument --dry

import { writeFileSync } from 'fs';
import { join } from 'path';
// Klient Prisma leży w node_modules BACKENDU, a skrypt w /test (zasada projektu) — stąd
// require po ścieżce zamiast importu; z /test `@prisma/client` się nie rozwiązuje.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require(join(__dirname, '..', 'apps', 'backend', 'node_modules', '@prisma', 'client'));

const prisma: any = new PrismaClient();
const DRY = process.argv.includes('--dry');
const NODE_ID = '219f64a5-515e-45a3-b1c0-0ded85e2a85d'; // CMC- Serwerownia ZDC1-K9_2026

// Mapowanie „firma z kontaktu zamówienia" → NIP. Klucz jest DOKŁADNIE taki, jak w polu
// `company` kontaktu / etykiecie właściciela gałęzi WBS, bo po nim skrypt dopina NIP.
const FIRMY: Record<string, string> = {
    'Netformers': '7010482978',                    // PM zamówienia (Adam Burek)
    'Supon': '6572333444',
    'Airclean': '6272738527',
    'Delta': '9512115082',
    'Elnets': '6511437758',
    'Sitarstwo z Drutu i Tworzywa': '6920208162',
    'T-KOM': '6251145549',
    'Quantum Engineering': '6783194152',
    'Ingram Micro': '5212931906',                  // dystrybutor IT, nie wykonawca — do rejestru wchodzi tak samo
    // 'B-S net' — NIP nieustalony: firma nie ma działającej strony ani wpisu do znalezienia po nazwie.
};

type Podatnik = { name: string; address: string | null; vatStatus: string | null };

async function zBialejListy(nip: string): Promise<Podatnik | null> {
    const date = new Date().toISOString().slice(0, 10);
    const res = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`, {
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const s = data?.result?.subject;
    if (!s?.name) return null;
    return { name: s.name, address: s.workingAddress || s.residenceAddress || null, vatStatus: s.statusVat || null };
}

(async () => {
    // WSZYSTKIE wiersze zamówienia, nie tylko globalny (`versionId: null`): kontakty per wersja
    // bywają inne (Elnets i T-KOM siedzą tylko w wersjonowanych), a NIP ma być wszędzie tam,
    // gdzie stoi firma — inaczej protokół wystawiony z innej wersji znów nie zna wykonawcy.
    const rekordy = await prisma.orderRequirements.findMany({ where: { nodeId: NODE_ID } });
    if (!rekordy.length) throw new Error('Brak order_requirements dla zamówienia CMC');

    // Backup PRZED zapisem — bez niego nie ma jak cofnąć nadpisanego JSON-a z kontaktami.
    const kopia = join(__dirname, `backup-kontakty-cmc-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(kopia, JSON.stringify({
        rekordy: rekordy.map((r: any) => ({
            id: r.id,
            versionId: r.versionId,
            clientProjectManagerNip: r.clientProjectManagerNip,
            clientContacts: r.clientContacts,
        })),
        suppliers: await prisma.supplier.findMany({ where: { nip: { in: Object.values(FIRMY) } } }),
    }, null, 2), 'utf8');
    console.log(`[backup] ${kopia} (${rekordy.length} wierszy)`);

    // Kontakt do rejestru bierzemy z DOWOLNEGO wiersza, w którym firma występuje — osoba,
    // telefon i mail są w rejestrze firm dodatkiem, nie kluczem.
    const wszystkieKontakty: any[] = rekordy.flatMap((r: any) => {
        try { return JSON.parse(r.clientContacts || '[]'); } catch { return []; }
    });

    for (const [firma, nip] of Object.entries(FIRMY)) {
        const podatnik = await zBialejListy(nip);
        if (!podatnik) { console.log(`[POMIJAM] ${firma} (${nip}) — brak w Białej liście VAT`); continue; }

        const kontakt = wszystkieKontakty.find((k) => String(k.company || '').trim() === firma);
        const dane = {
            name: podatnik.name,
            nip,
            address: podatnik.address,
            vatStatus: podatnik.vatStatus,
            verifiedAt: new Date(),
            contactPerson: kontakt?.name?.replace(/\s+/g, ' ').trim() || null,
            contactEmail: kontakt?.email || null,
            contactPhone: kontakt?.phone?.trim() || null,
        };

        if (!DRY) await prisma.supplier.upsert({ where: { nip }, update: dane, create: dane });
        console.log(`[rejestr] ${firma.padEnd(30)} ${nip} → ${podatnik.name} (${podatnik.vatStatus})`);
    }

    let dopisane = 0;
    let wszystkich = 0;
    for (const r of rekordy as any[]) {
        let kontakty: any[] = [];
        try { kontakty = JSON.parse(r.clientContacts || '[]'); } catch { kontakty = []; }
        for (const k of kontakty) {
            wszystkich += 1;
            const nip = FIRMY[String(k.company || '').trim()];
            if (nip && k.nip !== nip) { k.nip = nip; dopisane += 1; }
        }
        const pmNip = FIRMY[String(r.clientProjectManagerCompany || '').trim()] || null;
        if (!DRY) {
            await prisma.orderRequirements.update({
                where: { id: r.id },
                data: { clientContacts: JSON.stringify(kontakty), ...(pmNip ? { clientProjectManagerNip: pmNip } : {}) },
            });
        }
        console.log(`[zamówienie] wersja ${String(r.versionId || 'globalna').slice(0, 8)}: PM „${r.clientProjectManagerCompany || '—'}" → ${pmNip || '—'}, kontaktów z NIP-em ${kontakty.filter((k: any) => k.nip).length}/${kontakty.length}`);
    }

    console.log(`[podsumowanie] dopisano NIP w ${dopisane} z ${wszystkich} kontaktów`);
    console.log(DRY ? '[dry-run] nic nie zapisano' : '[ok] zapisano');
    await prisma.$disconnect();
})().catch(async (e) => { console.error('[BŁĄD]', e); await prisma.$disconnect(); process.exit(1); });
