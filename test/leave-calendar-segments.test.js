// Test realnej logiki kalendarza urlopowego (kompiluje TS z src, nie kopie regul):
//  1. tytul wydarzenia w formacie „AWL-urlop" — skrot z imienia i nazwiska albo z pola recznego,
//  2. etykieta rodzaju z mapy CALENDAR_LABELS i z LeaveType.calendarLabel,
//  3. pociecie zakresu na bloki dni roboczych — weekend i swieto przerywaja pasek,
//  4. urlop godzinowy zostaje jednym zdarzeniem z godzinami,
//  5. Boze Cialo (swieto ruchome, czwartek) tez przerywa pasek.
//
// Uruchomienie: node test/leave-calendar-segments.test.js
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'apps', 'backend');
fs.mkdirSync(path.join(BACKEND, 'node_modules', '.cache'), { recursive: true });
const OUT = fs.mkdtempSync(path.join(BACKEND, 'node_modules', '.cache', 'segments-test-'));

let failures = 0;
const check = (name, cond, extra) => {
    if (cond) return console.log(`  OK  ${name}`);
    failures++;
    console.error(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
};

console.log('Kompilacja modulu Urlopy…');
execFileSync(
    process.execPath,
    [
        path.join(BACKEND, 'node_modules', 'typescript', 'bin', 'tsc'),
        path.join(BACKEND, 'src', 'leaves', 'leave-requests.service.ts'),
        '--outDir', OUT, '--module', 'commonjs', '--target', 'es2021',
        '--experimentalDecorators', '--emitDecoratorMetadata', '--esModuleInterop',
        '--skipLibCheck', '--moduleResolution', 'node',
    ],
    { cwd: BACKEND, stdio: 'inherit' },
);

require(path.join(BACKEND, 'node_modules', 'reflect-metadata'));
const mod = require(path.join(OUT, 'leaves', 'leave-requests.service.js'));
const { LeaveRequestsService, buildCalendarInitials, CALENDAR_LABELS } = mod;

// data w strefie Europe/Warsaw tak, jak trzyma ja baza — polnoc UTC
const d = s => new Date(`${s}T00:00:00.000Z`);
const keys = segs => segs.map(s => `${s.dateStart.toISOString().slice(0, 10)}..${s.dateEnd.toISOString().slice(0, 10)}`);

console.log('\n1) Skrot pracownika');
check('Anna Włodarczyk -> AWŁ', buildCalendarInitials('Anna', 'Włodarczyk') === 'AWŁ', buildCalendarInitials('Anna', 'Włodarczyk'));
check('Bartosz Cieślak -> BCI', buildCalendarInitials('Bartosz', 'Cieślak') === 'BCI', buildCalendarInitials('Bartosz', 'Cieślak'));
check('bez kropki na koncu', !buildCalendarInitials('Jan', 'Wiśniewski').includes('.'));
check('sama pierwsza litera imienia', buildCalendarInitials('Jan', 'Wiśniewski') === 'JWI', buildCalendarInitials('Jan', 'Wiśniewski'));
check('brak nazwiska nie wywraca', buildCalendarInitials('Jan', null).length > 0);

console.log('\n2) Tytul wydarzenia');
const req = (over = {}) => ({
    id: 'req-1',
    user: { firstName: 'Anna', lastName: 'Włodarczyk' },
    leaveType: { code: 'WYPOCZYNKOWY', name: 'Wypoczynkowy', allowsHourly: true },
    dateStart: d('2026-08-10'),
    dateEnd: d('2026-08-14'),
    daysCount: 5,
    ...over,
});
const summary = r => LeaveRequestsService.calendarSummary(r);
check('wypoczynkowy -> AWŁ-urlop', summary(req()) === 'AWŁ-urlop', summary(req()));
check('L4 -> AWŁ-L4', summary(req({ leaveType: { code: 'L4', name: 'L4' } })) === 'AWŁ-L4');
check(
    'za swieto skrocone',
    summary(req({ leaveType: { code: 'ZA_SWIETO_SOB', name: 'Do wyboru za święto w sobotę' } })) === 'AWŁ-za święto',
);
check('recznie wpisany skrot ma pierwszenstwo',
    summary(req({ user: { firstName: 'Anna', lastName: 'Włodarczyk', calendarInitials: 'AWLO' } })) === 'AWLO-urlop');
check('calendarLabel z bazy ma pierwszenstwo nad mapa',
    summary(req({ leaveType: { code: 'WYPOCZYNKOWY', name: 'Wypoczynkowy', calendarLabel: 'wolne' } })) === 'AWŁ-wolne');
check('mapa etykiet zna wszystkie 6 rodzajow z bazy', Object.keys(CALENDAR_LABELS).length === 6);

console.log('\n3) Pociecie zakresu na dni robocze');
const seg = r => LeaveRequestsService.calendarSegments(r);
const tydzien = seg(req({ dateStart: d('2026-08-10'), dateEnd: d('2026-08-14') }));
check('pn-pt = jedno zdarzenie', keys(tydzien).join() === '2026-08-10..2026-08-14', keys(tydzien).join());

const dwaTygodnie = seg(req({ dateStart: d('2026-08-10'), dateEnd: d('2026-08-21') }));
check('dwa tygodnie = dwa zdarzenia (weekend przerywa)',
    keys(dwaTygodnie).join() === '2026-08-10..2026-08-14,2026-08-17..2026-08-21', keys(dwaTygodnie).join());

const zWeekendem = seg(req({ dateStart: d('2026-08-15'), dateEnd: d('2026-08-16') }));
check('sam weekend = zero zdarzen', zWeekendem.length === 0, JSON.stringify(keys(zWeekendem)));

// 15 sierpnia 2026 to sobota; 11 listopada 2026 to sroda — swieto w srodku tygodnia
const listopad = seg(req({ dateStart: d('2026-11-09'), dateEnd: d('2026-11-13') }));
check('11 listopada (sroda) przerywa pasek',
    keys(listopad).join() === '2026-11-09..2026-11-10,2026-11-12..2026-11-13', keys(listopad).join());

// Boze Cialo 2026 = 4 czerwca (czwartek) — swieto ruchome
const bozeCialo = seg(req({ dateStart: d('2026-06-01'), dateEnd: d('2026-06-05') }));
check('Boze Cialo (czwartek) przerywa pasek',
    keys(bozeCialo).join() === '2026-06-01..2026-06-03,2026-06-05..2026-06-05', keys(bozeCialo).join());

const przezSylwestra = seg(req({ dateStart: d('2026-12-30'), dateEnd: d('2027-01-04') }));
check('zakres przez sylwestra — 1 stycznia wypada z paska',
    !keys(przezSylwestra).some(k => k.includes('2027-01-01')), keys(przezSylwestra).join());

console.log('\n4) Urlop godzinowy');
const godzinowy = seg(req({ dateStart: d('2026-08-12'), dateEnd: d('2026-08-12'), timeStart: '08:00', timeEnd: '12:00' }));
check('jedno zdarzenie z godzinami', godzinowy.length === 1 && godzinowy[0].timeStart === '08:00');
const godzinowyBezZgody = seg(req({
    leaveType: { code: 'L4', name: 'L4', allowsHourly: false },
    dateStart: d('2026-08-12'), dateEnd: d('2026-08-12'), timeStart: '08:00', timeEnd: '12:00',
}));
check('rodzaj bez zgody na godziny zostaje calodniowy', !godzinowyBezZgody[0].timeStart);

fs.rmSync(OUT, { recursive: true, force: true });
console.log(failures ? `\n${failures} test(ow) nie przeszlo` : '\nWszystkie testy przeszly');
process.exit(failures ? 1 : 0);
