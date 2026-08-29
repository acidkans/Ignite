// Test blokady dwóch nieobecności tego samego pracownika w tym samym terminie.
// Uruchamia REALNĄ, skompilowaną metodę LeaveRequestsService.assertNoSelfOverlap
// (nie kopię logiki) na danych z bazy dev — nic nie zapisuje.
//
// Uruchomienie (skrypt działa wewnątrz kontenera backendu):
//   docker exec -i erp-backend node < test/leave-self-overlap.test.js
const { PrismaClient } = require('@prisma/client');
const { LeaveRequestsService } = require('/usr/src/app/dist/leaves/leave-requests.service.js');

const prisma = new PrismaClient();
let failures = 0;
const check = (name, cond, extra) => {
    if (cond) return console.log(`  OK  ${name}`);
    failures++;
    console.error(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
};

// serwis z jedyną zależnością, której ta metoda używa — resztę zostawiamy pustą
const service = new LeaveRequestsService(prisma, null, null, null, null, null, null, null);
const assertNoSelfOverlap = (...args) => service.assertNoSelfOverlap(...args);

const dayKey = d => d.toISOString().slice(0, 10);

(async () => {
    // dowolny istniejący wniosek PENDING/APPROVED jako punkt odniesienia — bez twardych id
    const ref = await prisma.leaveRequest.findFirst({
        where: { status: { in: ['PENDING', 'APPROVED'] } },
        orderBy: { dateStart: 'desc' },
        include: { user: { select: { email: true } }, leaveType: { select: { name: true } } },
    });
    if (!ref) {
        console.error('Brak wniosków PENDING/APPROVED w bazie — test nie ma na czym pracować.');
        process.exit(1);
    }
    console.log(`Punkt odniesienia: ${ref.user?.email} ${dayKey(ref.dateStart)}..${dayKey(ref.dateEnd)} (${ref.leaveType?.name || '—'}, ${ref.status})\n`);

    const expectThrow = async (name, run) => {
        try {
            await run();
            check(name, false, 'nie rzucił wyjątku');
        } catch (e) {
            check(name, /nachodzi na inny wniosek/.test(e.message), e.message);
        }
    };
    const expectPass = async (name, run) => {
        try {
            await run();
            check(name, true);
        } catch (e) {
            check(name, false, e.message);
        }
    };

    console.log('1) Kolizje, które muszą zostać zablokowane');
    await expectThrow('dokładnie ten sam termin', () =>
        assertNoSelfOverlap(ref.userId, ref.dateStart, ref.dateEnd));
    await expectThrow('termin zawierający istniejący', () =>
        assertNoSelfOverlap(ref.userId, new Date(ref.dateStart.getTime() - 5 * 86400000), new Date(ref.dateEnd.getTime() + 5 * 86400000)));
    await expectThrow('termin zawarty w istniejącym (jeden dzień w środku)', () =>
        assertNoSelfOverlap(ref.userId, ref.dateEnd, ref.dateEnd));
    await expectThrow('zachodzi tylko początkiem (koniec = start istniejącego)', () =>
        assertNoSelfOverlap(ref.userId, new Date(ref.dateStart.getTime() - 3 * 86400000), ref.dateStart));
    await expectThrow('zachodzi tylko końcem (start = koniec istniejącego)', () =>
        assertNoSelfOverlap(ref.userId, ref.dateEnd, new Date(ref.dateEnd.getTime() + 3 * 86400000)));
    await expectThrow('daty jako stringi z frontu', () =>
        assertNoSelfOverlap(ref.userId, dayKey(ref.dateStart), dayKey(ref.dateEnd)));

    console.log('\n2) Terminy, które muszą przejść');
    await expectPass('dzień przed istniejącym', () =>
        assertNoSelfOverlap(ref.userId, new Date(ref.dateStart.getTime() - 10 * 86400000), new Date(ref.dateStart.getTime() - 86400000)));
    await expectPass('dzień po istniejącym', () =>
        assertNoSelfOverlap(ref.userId, new Date(ref.dateEnd.getTime() + 86400000), new Date(ref.dateEnd.getTime() + 10 * 86400000)));
    // excludeRequestId ma pomijac WLASNIE ten wniosek; jesli pracownik ma w tym terminie
    // jeszcze inne nieobecnosci (dane historyczne sprzed blokady), wyjatek jest poprawny —
    // musi tylko wskazywac inny wniosek niz pomijany.
    const others = await prisma.leaveRequest.count({
        where: {
            userId: ref.userId, id: { not: ref.id }, status: { in: ['PENDING', 'APPROVED'] },
            dateStart: { lte: ref.dateEnd }, dateEnd: { gte: ref.dateStart },
        },
    });
    if (others === 0) {
        await expectPass('ten sam termin, ale edycja TEGO wniosku (excludeRequestId)', () =>
            assertNoSelfOverlap(ref.userId, ref.dateStart, ref.dateEnd, ref.id));
    } else {
        await expectThrow(
            `excludeRequestId pomija własny wniosek, ale widzi ${others} inn(y/e) w tym terminie`,
            () => assertNoSelfOverlap(ref.userId, ref.dateStart, ref.dateEnd, ref.id));
        console.log(`  (uwaga: ${ref.user?.email} ma ${others + 1} nachodzące nieobecności w bazie — dane sprzed blokady)`);
    }
    await expectPass('nieprawidłowa data — walidację dat robi assertRequestFieldsValid', () =>
        assertNoSelfOverlap(ref.userId, 'nie-data', 'nie-data'));

    console.log('\n3) Kolizja dotyczy tylko tego samego pracownika');
    const other = await prisma.user.findFirst({ where: { id: { not: ref.userId }, isActive: true }, select: { id: true, email: true } });
    if (other) {
        const clash = await prisma.leaveRequest.findFirst({
            where: { userId: other.id, status: { in: ['PENDING', 'APPROVED'] }, dateStart: { lte: ref.dateEnd }, dateEnd: { gte: ref.dateStart } },
        });
        if (clash) {
            console.log(`  (pominięto — ${other.email} ma własną kolizję w tym terminie)`);
        } else {
            await expectPass(`ten sam termin u innego pracownika (${other.email})`, () =>
                assertNoSelfOverlap(other.id, ref.dateStart, ref.dateEnd));
        }
    }

    await prisma.$disconnect();
    console.log(failures ? `\nBŁĘDY: ${failures}` : '\nWszystkie testy przeszły.');
    process.exit(failures ? 1 : 0);
})();
