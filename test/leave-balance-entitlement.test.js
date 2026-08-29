// Test wyliczanej puli urlopu: pracownik bez wiersza w leave_balances ma dostać wymiar
// ze stażu (art. 154 §1 KP: 20 dni poniżej 10 lat, 26 od 10 lat), a ręcznie wpisana pula
// ma mieć pierwszeństwo. Uruchamia REALNY, skompilowany LeaveBalancesService — nie kopię
// logiki. Nic nie zapisuje do bazy.
//
// Uruchomienie:
//   docker exec -i erp-backend node < test/leave-balance-entitlement.test.js
const { PrismaClient } = require('@prisma/client');
const { LeaveBalancesService } = require('/usr/src/app/dist/leaves/leave-balances.service.js');

const prisma = new PrismaClient();
let failures = 0;
const check = (name, cond, extra) => {
    if (cond) return console.log(`  OK  ${name}`);
    failures++;
    console.error(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
};

const service = new LeaveBalancesService(prisma, null);
const CURRENT_YEAR = new Date().getUTCFullYear();

(async () => {
    console.log('1) Pracownik ze stażem, bez wiersza w leave_balances');
    const users = await prisma.user.findMany({
        where: { isActive: true, workStartYear: { not: null } },
        select: { id: true, email: true, workStartYear: true, workStartMonth: true },
    });
    const withoutRow = [];
    for (const u of users) {
        const n = await prisma.leaveBalance.count({ where: { userId: u.id, year: CURRENT_YEAR } });
        if (n === 0) withoutRow.push(u);
    }

    if (!withoutRow.length) {
        console.log('  (pominięto — każdy pracownik ze stażem ma już wiersz na bieżący rok)');
    } else {
        const u = withoutRow[0];
        const stazLat = CURRENT_YEAR - u.workStartYear;
        const oczekiwane = stazLat >= 10 ? 26 : 20;
        const bal = await service.getBalance(u.id);
        const rok = bal.years.find(y => y.year === CURRENT_YEAR);
        check(`${u.email} (staż ~${stazLat} lat) ma pulę ${oczekiwane} dni`,
            rok?.entitlementDays === oczekiwane, `dostał ${rok?.entitlementDays}`);
        check('totalRemaining > 0 — wniosek nie jest już blokowany',
            bal.totalRemaining > 0, String(bal.totalRemaining));
        await (async () => {
            try {
                await service.assertDaysAvailable(u.id, 1);
                check('assertDaysAvailable(1 dzień) przepuszcza', true);
            } catch (e) {
                check('assertDaysAvailable(1 dzień) przepuszcza', false, e.message);
            }
        })();
    }

    console.log('\n2) Lata wsteczne zostają zerami (bez urlopu zaległego z powietrza)');
    if (withoutRow.length) {
        const bal = await service.getBalance(withoutRow[0].id);
        const wsteczne = bal.years.filter(y => y.year < CURRENT_YEAR);
        const puste = await Promise.all(wsteczne.map(async y => {
            const n = await prisma.leaveBalance.count({ where: { userId: withoutRow[0].id, year: y.year } });
            return n === 0 ? y : null;
        }));
        const bezWiersza = puste.filter(Boolean);
        check(`${bezWiersza.length} lat wstecznych bez wiersza ma pulę 0`,
            bezWiersza.every(y => y.entitlementDays === 0),
            bezWiersza.map(y => `${y.year}:${y.entitlementDays}`).join(' '));
    }

    console.log('\n3) Ręcznie wpisana pula ma pierwszeństwo nad wyliczoną');
    const withRow = await prisma.leaveBalance.findFirst({
        where: { year: CURRENT_YEAR },
        include: { user: { select: { email: true, workStartYear: true } } },
    });
    if (!withRow) {
        console.log('  (pominięto — nikt nie ma wiersza na bieżący rok)');
    } else {
        const bal = await service.getBalance(withRow.userId);
        const rok = bal.years.find(y => y.year === CURRENT_YEAR);
        check(`${withRow.user?.email}: pula z bazy (${withRow.entitlementDays}), nie wyliczona`,
            rok?.entitlementDays === withRow.entitlementDays, String(rok?.entitlementDays));
    }

    console.log('\n4) Pracownik bez stażu i bez wiersza dalej ma 0');
    const bezStazu = await prisma.user.findFirst({
        where: { isActive: true, workStartYear: null, workExperienceYears: null },
        select: { id: true, email: true },
    });
    if (!bezStazu) {
        console.log('  (pominięto — każdy aktywny pracownik ma staż)');
    } else {
        const n = await prisma.leaveBalance.count({ where: { userId: bezStazu.id, year: CURRENT_YEAR } });
        if (n) {
            console.log(`  (pominięto — ${bezStazu.email} ma wpisaną pulę)`);
        } else {
            const bal = await service.getBalance(bezStazu.id);
            const rok = bal.years.find(y => y.year === CURRENT_YEAR);
            check(`${bezStazu.email}: brak stażu => pula 0, nie zgadywana`,
                rok?.entitlementDays === 0, String(rok?.entitlementDays));
        }
    }

    await prisma.$disconnect();
    console.log(failures ? `\nBŁĘDY: ${failures}` : '\nWszystkie testy przeszły.');
    process.exit(failures ? 1 : 0);
})();
