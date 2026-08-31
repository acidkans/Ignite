// Rekoncyliacja wspolnego kalendarza urlopowego z baza: dla kazdego zatwierdzonego wniosku
// sprawdza, czy w kalendarzu stoja odpowiadajace mu wydarzenia, i uzupelnia braki.
// Baza jest zrodlem prawdy — reczne skasowanie wydarzenia w Google zostaje cofniete.
// Wpisow bez znacznika source=ignite (spotkania, wyjazdy, „HO") skrypt nie dotyka.
//
// Podglad bez zapisu:  node test/gcal-resync.js
// Zapis do kalendarza: node test/gcal-resync.js --zapisz
// Zakres:              node test/gcal-resync.js --miesiecy=6
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'apps', 'backend');
const ZAPISZ = process.argv.includes('--zapisz');
const MIESIECY = Number((process.argv.find(a => a.startsWith('--miesiecy=')) || '').split('=')[1]) || 3;

const env = {};
for (const line of fs.readFileSync(path.join(BACKEND, '.env'), 'utf8').split('\n')) {
    const m = line.trim().match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    console.error('Brak konfiguracji kalendarza w apps/backend/.env — nie ma czego synchronizowac.');
    process.exit(1);
}

fs.mkdirSync(path.join(BACKEND, 'node_modules', '.cache'), { recursive: true });
const OUT = fs.mkdtempSync(path.join(BACKEND, 'node_modules', '.cache', 'resync-'));
console.log('Kompilacja serwisow…');
for (const src of ['google-calendar/google-calendar.service.ts', 'leaves/leave-requests.service.ts']) {
    execFileSync(
        process.execPath,
        [path.join(BACKEND, 'node_modules', 'typescript', 'bin', 'tsc'),
            path.join(BACKEND, 'src', src), '--outDir', OUT, '--module', 'commonjs', '--target', 'es2021',
            '--experimentalDecorators', '--emitDecoratorMetadata', '--esModuleInterop',
            '--skipLibCheck', '--moduleResolution', 'node'],
        { cwd: BACKEND, stdio: 'inherit' },
    );
}

require(path.join(BACKEND, 'node_modules', 'reflect-metadata'));
const { GoogleCalendarService } = require(path.join(OUT, 'google-calendar', 'google-calendar.service.js'));
const { LeaveRequestsService } = require(path.join(OUT, 'leaves', 'leave-requests.service.js'));
const { PrismaClient } = require(path.join(BACKEND, 'node_modules', '@prisma', 'client'));

const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const gcal = new GoogleCalendarService({ get: k => env[k] });

(async () => {
    const from = new Date();
    from.setMonth(from.getMonth() - MIESIECY);

    const requests = await prisma.leaveRequest.findMany({
        where: { status: 'APPROVED', dateEnd: { gte: from } },
        include: {
            user: { select: { firstName: true, lastName: true, calendarInitials: true } },
            leaveType: { select: { code: true, name: true, allowsHourly: true, calendarLabel: true } },
        },
        orderBy: [{ dateStart: 'asc' }],
    });

    console.log(`\nZatwierdzone wnioski od ${from.toISOString().slice(0, 10)}: ${requests.length}`);
    console.log(ZAPISZ ? 'Tryb: ZAPIS do kalendarza\n' : 'Tryb: tylko podglad (dodaj --zapisz, zeby poprawic)\n');

    const token = await gcal.accessToken();
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`;

    let braki = 0;
    let poprawione = 0;
    for (const request of requests) {
        const segments = LeaveRequestsService.calendarSegments(request);
        const summary = LeaveRequestsService.calendarSummary(request);
        const okres = `${request.dateStart.toISOString().slice(0, 10)}..${request.dateEnd.toISOString().slice(0, 10)}`;

        const wKalendarzu = await fetch(
            `${base}?privateExtendedProperty=${encodeURIComponent('leaveRequestId=' + request.id)}&singleEvents=true&showDeleted=false`,
            { headers: { Authorization: `Bearer ${token}` } },
        ).then(r => r.json());
        const ile = (wKalendarzu.items || []).length;

        if (ile === segments.length) continue;
        braki++;
        console.log(`  ${summary.padEnd(22)} ${okres}  kalendarz: ${ile}, powinno byc: ${segments.length}`);

        if (!ZAPISZ) continue;
        const res = await gcal.syncLeaveEvents({
            leaveRequestId: request.id,
            knownEventIds: request.googleEventIds,
            summary,
            description: LeaveRequestsService.calendarDescription(request),
            segments,
        });
        await prisma.leaveRequest.update({
            where: { id: request.id },
            data: {
                googleEventIds: res.eventIds,
                googleSyncedAt: res.ok ? new Date() : null,
                googleSyncError: res.ok ? null : res.error || 'Kalendarz nie przyjal wszystkich wpisow.',
            },
        });
        if (res.ok) poprawione++;
        else console.error(`     BLAD: ${res.error}`);
    }

    console.log(`\nRozjazdow: ${braki}${ZAPISZ ? `, poprawionych: ${poprawione}` : ''}`);
    if (braki && !ZAPISZ) console.log('Uruchom ponownie z --zapisz, zeby odtworzyc brakujace wpisy.');
    fs.rmSync(OUT, { recursive: true, force: true });
    await prisma.$disconnect();
})().catch(async e => {
    console.error(e.message);
    await prisma.$disconnect();
    process.exit(1);
});
