// Test realnego GoogleCalendarService (nie kopii logiki): kompiluje pojedynczy plik TS
// do katalogu tymczasowego, podmienia axios na atrapę i sprawdza:
//  1. bez zmiennych środowiskowych integracja jest wyłączona i nic nie woła sieci,
//  2. zdarzenie całodniowe kończy się dzień PO dacie końca urlopu (Google ma datę wyłączną),
//  3. daty liczą się w strefie Europe/Warsaw, a nie w UTC,
//  4. id wniosku ląduje w extendedProperties (klucz do odnalezienia zdarzenia).
//
// Uruchomienie: node test/google-calendar-event.test.js
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { generateKeyPairSync } = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'apps', 'backend');
const SRC = path.join(BACKEND, 'src', 'google-calendar', 'google-calendar.service.ts');
// Wynik kompilacji musi lezec pod apps/backend, inaczej require('@nestjs/common')
// nie znajdzie modulow — stad katalog w node_modules/.cache, kasowany na koncu.
const _ensureCache = fs.mkdirSync(path.join(BACKEND, 'node_modules', '.cache'), { recursive: true });
const OUT = fs.mkdtempSync(path.join(BACKEND, 'node_modules', '.cache', 'gcal-test-'));

let failures = 0;
const check = (name, cond, extra) => {
    if (cond) return console.log(`  OK  ${name}`);
    failures++;
    console.error(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
};

console.log('Kompilacja google-calendar.service.ts…');
execFileSync(
    process.execPath,
    [path.join(BACKEND, 'node_modules', 'typescript', 'bin', 'tsc'),
        SRC, '--outDir', OUT, '--module', 'commonjs', '--target', 'es2021',
        '--experimentalDecorators', '--emitDecoratorMetadata', '--esModuleInterop',
        '--skipLibCheck', '--moduleResolution', 'node'],
    { cwd: BACKEND, stdio: 'inherit' },
);

// atrapa axios — ten sam moduł, który załaduje skompilowany serwis
const axios = require(path.join(BACKEND, 'node_modules', 'axios'));
const calls = [];
axios.post = async (url, body) => {
    calls.push({ method: 'post', url, body });
    if (url.includes('oauth2')) return { data: { access_token: 'fake-token', expires_in: 3600 } };
    return { data: { id: 'evt-123' } };
};
axios.patch = async (url, body) => { calls.push({ method: 'patch', url, body }); return { data: { id: 'evt-123' } }; };
axios.get = async (url, cfg) => { calls.push({ method: 'get', url, cfg }); return { data: { items: [] } }; };
axios.delete = async url => { calls.push({ method: 'delete', url }); return { data: {} }; };

require(path.join(BACKEND, 'node_modules', 'reflect-metadata'));
const { GoogleCalendarService } = require(path.join(OUT, 'google-calendar.service.js'));

const makeService = env => new GoogleCalendarService({ get: k => env[k] });

(async () => {
    console.log('\n1) Bez konfiguracji integracja jest wyłączona');
    const off = makeService({});
    check('isEnabled() === false', off.isEnabled() === false);
    check('upsertLeaveEvent zwraca null', (await off.upsertLeaveEvent({
        leaveRequestId: 'r1', summary: 'x', dateStart: new Date(), dateEnd: new Date(),
    })) === null);
    await off.deleteLeaveEvent('evt-1', 'r1');
    check('żadnego wywołania sieciowego', calls.length === 0, `wywołań: ${calls.length}`);

    console.log('\n2) Z konfiguracją — zdarzenie całodniowe');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const on = makeService({
        GOOGLE_SERVICE_ACCOUNT_EMAIL: 'bot@projekt.iam.gserviceaccount.com',
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        GOOGLE_CALENDAR_ID: 'airtel.urlopy@gmail.com',
    });
    check('isEnabled() === true', on.isEnabled() === true);

    calls.length = 0;
    // urlop 10–14 sierpnia 2026; daty z bazy są o północy UTC
    const id = await on.upsertLeaveEvent({
        leaveRequestId: 'req-77',
        summary: 'Jan Kowalski — Urlop wypoczynkowy',
        dateStart: new Date('2026-08-10T00:00:00.000Z'),
        dateEnd: new Date('2026-08-14T00:00:00.000Z'),
    });
    check('zwrócone id zdarzenia', id === 'evt-123', String(id));

    const token = calls.find(c => c.url.includes('oauth2'));
    check('najpierw token OAuth2 z podpisanego JWT', !!token);
    check('assertion to JWT z trzech części', String(token?.body || '').includes('assertion=') &&
        decodeURIComponent(String(token.body).split('assertion=')[1]).split('.').length === 3);

    const insert = calls.find(c => c.method === 'post' && c.url.includes('/events'));
    check('POST na kalendarz airtel.urlopy@gmail.com', !!insert && insert.url.includes(encodeURIComponent('airtel.urlopy@gmail.com')));
    check('start = 2026-08-10', insert?.body?.start?.date === '2026-08-10', insert?.body?.start?.date);
    check('koniec = 2026-08-15 (dzień po końcu urlopu)', insert?.body?.end?.date === '2026-08-15', insert?.body?.end?.date);
    check('leaveRequestId w extendedProperties',
        insert?.body?.extendedProperties?.private?.leaveRequestId === 'req-77');

    console.log('\n3) Strefa Europe/Warsaw, nie UTC');
    calls.length = 0;
    // 31.12.2026 23:00 UTC to już 1.01.2027 w Warszawie — naiwny toISOString() dałby 2026-12-31
    await on.upsertLeaveEvent({
        leaveRequestId: 'req-78',
        summary: 'Sylwester',
        dateStart: new Date('2026-12-31T23:00:00.000Z'),
        dateEnd: new Date('2026-12-31T23:00:00.000Z'),
    });
    const ny = calls.find(c => c.method === 'post' && c.url.includes('/events'));
    check('start = 2027-01-01', ny?.body?.start?.date === '2027-01-01', ny?.body?.start?.date);

    console.log('\n4) Istniejące zdarzenie jest aktualizowane, nie duplikowane');
    calls.length = 0;
    await on.upsertLeaveEvent({
        leaveRequestId: 'req-77',
        googleEventId: 'evt-123',
        summary: 'Jan Kowalski — Urlop wypoczynkowy (nowy termin)',
        dateStart: new Date('2026-08-17T00:00:00.000Z'),
        dateEnd: new Date('2026-08-18T00:00:00.000Z'),
    });
    check('PATCH zamiast POST', calls.some(c => c.method === 'patch') && !calls.some(c => c.method === 'post'));

    fs.rmSync(OUT, { recursive: true, force: true });
    console.log(failures ? `\nBŁĘDY: ${failures}` : '\nWszystkie testy przeszły.');
    process.exit(failures ? 1 : 0);
})();
