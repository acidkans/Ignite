// Test rejestru odbiorów: zapis protokołu, stan pozycji, brak podwójnego liczenia
// przy powtórnym eksporcie, domknięcie w drugim protokole i wycofanie zapisu.
// Pracuje na bazie dev — zakłada własne zamówienie testowe i kasuje je na końcu.
//
// Uruchomienie: cd apps/backend && npx ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' ../../test/test-protokol-rejestr.ts

// PrismaService, a nie goły PrismaClient: ten plik leży w /test (konwencja projektu),
// więc `@prisma/client` nie rozwiązuje się z jego katalogu. Import przez plik backendu
// rozwiązuje pakiet z `apps/backend/node_modules`, gdzie faktycznie stoi.
import { PrismaService } from '../apps/backend/src/prisma/prisma.service';
import { AcceptanceProtocolsService } from '../apps/backend/src/acceptance-protocols/acceptance-protocols.service';

const prisma = new PrismaService();
const service = new AcceptanceProtocolsService(prisma);

let bledy = 0;
const sprawdz = (opis: string, got: unknown, exp: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(exp);
    if (!ok) bledy++;
    console.log(`${ok ? 'OK  ' : 'BŁĄD'} ${opis}`);
    if (!ok) console.log(`     dostałem:   ${JSON.stringify(got)}\n     oczekiwane: ${JSON.stringify(exp)}`);
};

const stan = async (nodeId: string) => {
    const s = await service.getStatus(nodeId);
    return s
        .map((x) => ({ root: x.wbsRootId, odebrane: x.odebrane, domkniete: x.domkniete }))
        .sort((a, b) => a.root.localeCompare(b.root));
};

(async () => {
    const node = await prisma.processNode.create({
        data: { name: '[TEST] rejestr protokołów odbioru', type: 'order' },
    });

    try {
        // Pierwszy protokół: pozycja A domknięta, pozycja B odebrana częściowo.
        await service.record(node.id, {
            numer: 'TEST/1',
            data: '30.08.2026',
            odbior: 'CZESCIOWY',
            pozycje: [
                { wbsRootId: 'lisc-a', nazwa: 'Pozycja A', wartosc: 5100, pelny: true },
                { wbsRootId: 'lisc-b', nazwa: 'Pozycja B', wartosc: 900, pelny: false },
            ],
        });

        sprawdz('po pierwszym protokole: A domknięta, B częściowo', await stan(node.id), [
            { root: 'lisc-a', odebrane: 5100, domkniete: true },
            { root: 'lisc-b', odebrane: 900, domkniete: false },
        ]);

        // Ten sam protokół raz jeszcze — pobranie, a chwilę potem mail. Kwoty NIE mogą się podwoić.
        await service.record(node.id, {
            numer: 'TEST/1',
            data: '30.08.2026',
            odbior: 'CZESCIOWY',
            pozycje: [
                { wbsRootId: 'lisc-a', nazwa: 'Pozycja A', wartosc: 5100, pelny: true },
                { wbsRootId: 'lisc-b', nazwa: 'Pozycja B', wartosc: 900, pelny: false },
            ],
        });

        sprawdz('powtórny eksport tego samego numeru nie podwaja kwot', await stan(node.id), [
            { root: 'lisc-a', odebrane: 5100, domkniete: true },
            { root: 'lisc-b', odebrane: 900, domkniete: false },
        ]);

        sprawdz('powtórka nadpisuje wpis, nie dokłada drugiego',
            (await prisma.acceptanceProtocolRecord.count({ where: { nodeId: node.id } })), 1);

        // Drugi protokół dobiera resztę pozycji B — i domyka ją za kwotę inną niż oferta.
        await service.record(node.id, {
            numer: 'TEST/2',
            data: '31.08.2026',
            odbior: 'CALOSCIOWY',
            pozycje: [{ wbsRootId: 'lisc-b', nazwa: 'Pozycja B', wartosc: 1100, pelny: true }],
        });

        sprawdz('drugi protokół sumuje odbiór B i domyka pozycję', await stan(node.id), [
            { root: 'lisc-a', odebrane: 5100, domkniete: true },
            { root: 'lisc-b', odebrane: 2000, domkniete: true },
        ]);

        const lista = await service.list(node.id);
        sprawdz('lista zwraca oba protokoły, najnowszy pierwszy',
            lista.map((p: any) => p.numer), ['TEST/2', 'TEST/1']);

        // Wycofanie drugiego protokołu — pozycja B wraca do puli do odbioru.
        await service.remove(node.id, lista[0].id);
        sprawdz('wycofanie protokołu otwiera pozycję z powrotem', await stan(node.id), [
            { root: 'lisc-a', odebrane: 5100, domkniete: true },
            { root: 'lisc-b', odebrane: 900, domkniete: false },
        ]);

        // Pozycja domknięta wcześniejszym protokołem nie wraca do kolejnego — także wtedy,
        // gdy front ją przepuści (nieodświeżony rejestr, dwie osoby wystawiające naraz).
        let zablokowany = false;
        try {
            await service.record(node.id, {
                numer: 'TEST/4', data: '01.09.2026', odbior: 'CZESCIOWY',
                pozycje: [{ wbsRootId: 'lisc-a', nazwa: 'Pozycja A', wartosc: 100, pelny: false }],
            });
        } catch (e: any) { zablokowany = /odebrane już w całości/.test(e?.message || ''); }
        sprawdz('pozycja domknięta odrzucona w kolejnym protokole', zablokowany, true);
        sprawdz('odrzucony protokół nie zostawia śladu w rejestrze', await stan(node.id), [
            { root: 'lisc-a', odebrane: 5100, domkniete: true },
            { root: 'lisc-b', odebrane: 900, domkniete: false },
        ]);

        // Blokada nie ma prawa uderzyć w PONOWNY eksport tego samego protokołu: wtedy pozycja
        // domknięta jest domknięta własnym wpisem, który upsert i tak nadpisuje.
        await service.record(node.id, {
            numer: 'TEST/1', data: '30.08.2026', odbior: 'CZESCIOWY',
            pozycje: [
                { wbsRootId: 'lisc-a', nazwa: 'Pozycja A', wartosc: 5100, pelny: true },
                { wbsRootId: 'lisc-b', nazwa: 'Pozycja B', wartosc: 900, pelny: false },
            ],
        });
        sprawdz('powtórka protokołu domykającego nie blokuje sama siebie', await stan(node.id), [
            { root: 'lisc-a', odebrane: 5100, domkniete: true },
            { root: 'lisc-b', odebrane: 900, domkniete: false },
        ]);

        // Pozycja odebrana CZĘŚCIOWO nadal wchodzi do kolejnego protokołu — blokada dotyczy
        // wyłącznie domkniętych, inaczej odbiór etapowy przestałby działać.
        await service.record(node.id, {
            numer: 'TEST/5', data: '01.09.2026', odbior: 'CZESCIOWY',
            pozycje: [{ wbsRootId: 'lisc-b', nazwa: 'Pozycja B', wartosc: 500, pelny: false }],
        });
        sprawdz('pozycja częściowa dobiera resztę kolejnym protokołem', await stan(node.id), [
            { root: 'lisc-a', odebrane: 5100, domkniete: true },
            { root: 'lisc-b', odebrane: 1400, domkniete: false },
        ]);

        // Protokół bez pozycji nie ma prawa powstać — to odbiór bez treści.
        let odrzucony = false;
        try {
            await service.record(node.id, { numer: 'TEST/3', data: '31.08.2026', odbior: 'CALOSCIOWY', pozycje: [] });
        } catch { odrzucony = true; }
        sprawdz('protokół bez pozycji odrzucony', odrzucony, true);
    } finally {
        await prisma.processNode.delete({ where: { id: node.id } });
        const zostalo = await prisma.acceptanceProtocolRecord.count({ where: { nodeId: node.id } });
        sprawdz('kasowanie zamówienia sprząta protokoły kaskadą', zostalo, 0);
        await prisma.$disconnect();
    }

    console.log(bledy ? `\n${bledy} test(y) nie przeszły` : '\nwszystkie testy przeszły');
    process.exit(bledy ? 1 : 0);
})().catch((e) => { console.error('[test] BŁĄD:', e); process.exit(1); });
