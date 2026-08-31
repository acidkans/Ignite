// Test end-to-end na PRAWDZIWYM kalendarzu urlopowym: bierze realne serwisy z src,
// zakłada wpisy dla wniosku testowego w odległym roku (2030), sprawdza co powstało
// i na koniec wszystko kasuje. Nie dotyka bazy — sam kalendarz.
//
// Uruchomienie: node test/gcal-e2e-live.js
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'apps', 'backend');
fs.mkdirSync(path.join(BACKEND, 'node_modules', '.cache'), { recursive: true });
const OUT = fs.mkdtempSync(path.join(BACKEND, 'node_modules', '.cache', 'gcal-e2e-'));

let failures = 0;
const check = (name, cond, extra) => {
    if (cond) return console.log(`  OK  ${name}`);
    failures++;
    console.error(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
};

const env = {};
for (const line of fs.readFileSync(path.join(BACKEND, '.env'), 'utf8').split('\n')) {
    const m = line.trim().match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    console.error('Brak GOOGLE_SERVICE_ACCOUNT_EMAIL w apps/backend/.env — test pomijam.');
    process.exit(0);
}

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

const gcal = new GoogleCalendarService({ get: k => env[k] });
const LEAVE_ID = 'e2e-test-' + Date.now();
const d = s => new Date(`${s}T00:00:00.000Z`);

// wniosek testowy: 7–18 stycznia 2030 (dwa pelne tygodnie robocze przedzielone weekendem)
const request = {
    id: LEAVE_ID,
    user: { firstName: 'Testowy', lastName: 'Pracownik' },
    leaveType: { code: 'WYPOCZYNKOWY', name: 'Wypoczynkowy', allowsHourly: true },
    dateStart: d('2030-01-07'),
    dateEnd: d('2030-01-18'),
    daysCount: 10,
};

(async () => {
    const segments = LeaveRequestsService.calendarSegments(request);
    const summary = LeaveRequestsService.calendarSummary(request);
    console.log(`\nWniosek: ${summary}, 2030-01-07..2030-01-18 -> ${segments.length} segment(ow)`);

    console.log('\n1) Zapis do kalendarza');
    const res = await gcal.syncLeaveEvents({
        leaveRequestId: LEAVE_ID,
        summary,
        description: 'Test e2e — kasowany automatycznie.',
        segments,
    });
    check('ok === true', res.ok === true, res.error);
    check('dwa zdarzenia (weekend przerywa pasek)', res.eventIds.length === 2, JSON.stringify(res.eventIds));

    console.log('\n2) Co realnie widac w kalendarzu');
    // `accessToken` jest w TS prywatne, ale w runtime to zwykla metoda — testowi wystarczy
    const token = await gcal.accessToken();
    const list = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events` +
        `?privateExtendedProperty=${encodeURIComponent('leaveRequestId=' + LEAVE_ID)}&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${token}` } },
    ).then(r => r.json());
    const items = list.items || [];
    items.forEach(e => console.log(`   • ${e.summary}  ${e.start?.date} -> ${e.end?.date}`));
    check('tytul TPR-urlop', items.every(e => e.summary === 'TPR-urlop'), items.map(e => e.summary).join(', '));
    check('pierwszy tydzien 07-11 stycznia',
        items[0]?.start?.date === '2030-01-07' && items[0]?.end?.date === '2030-01-12',
        `${items[0]?.start?.date} -> ${items[0]?.end?.date}`);
    check('drugi tydzien 14-18 stycznia',
        items[1]?.start?.date === '2030-01-14' && items[1]?.end?.date === '2030-01-19',
        `${items[1]?.start?.date} -> ${items[1]?.end?.date}`);
    check('znacznik source=ignite', items.every(e => e.extendedProperties?.private?.source === 'ignite'));

    console.log('\n3) Skrocenie urlopu do jednego tygodnia');
    const krotszy = await gcal.syncLeaveEvents({
        leaveRequestId: LEAVE_ID,
        knownEventIds: res.eventIds,
        summary,
        segments: [segments[0]],
    });
    check('zostaje jedno zdarzenie', krotszy.eventIds.length === 1, JSON.stringify(krotszy.eventIds));
    const poSkroceniu = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events` +
        `?privateExtendedProperty=${encodeURIComponent('leaveRequestId=' + LEAVE_ID)}&singleEvents=true`,
        { headers: { Authorization: `Bearer ${token}` } },
    ).then(r => r.json());
    check('w kalendarzu zostal jeden wpis', (poSkroceniu.items || []).length === 1,
        String((poSkroceniu.items || []).length));

    console.log('\n4) Sprzatanie');
    await gcal.deleteLeaveEvents(krotszy.eventIds, LEAVE_ID);
    const poKasacji = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events` +
        `?privateExtendedProperty=${encodeURIComponent('leaveRequestId=' + LEAVE_ID)}&singleEvents=true`,
        { headers: { Authorization: `Bearer ${token}` } },
    ).then(r => r.json());
    check('kalendarz czysty', (poKasacji.items || []).length === 0, String((poKasacji.items || []).length));

    fs.rmSync(OUT, { recursive: true, force: true });
    console.log(failures ? `\nBLEDY: ${failures}` : '\nWszystkie testy przeszly.');
    process.exit(failures ? 1 : 0);
})();
