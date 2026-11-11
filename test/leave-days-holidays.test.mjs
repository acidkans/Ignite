// Liczba dni urlopu pomija swieta ustawowe (nie tylko soboty i niedziele):
//  1. backend: LeaveRequestsService.workingDaysBetween — domyslny daysCount wniosku,
//  2. backend: LeavesService.workingDaysBetween — domyslny daysCount wpisu,
//  3. backend: LeavesService.splitDaysIntoMonths — rozbicie na miesiace dla DAK (pole workingDays),
//  4. frontend: workingDays z LeaveRequestModal.jsx (wyciety ze zrodla, liczony na prawdziwym polishHolidays.js),
//  5. zgodnosc frontend = backend dla wszystkich zakresow do 20 dni w latach 2025–2027.
//
// Kod transpilowany z src, wiec test sprawdza realna logike, nie kopie regul.
// Wigilia (24.12, od 2025) wchodzi osobna galezia — oczekiwania dla grudnia czytamy z listy swiat,
// zeby test przechodzil przed i po jej merge'u.
//
// Uruchomienie: node test/leave-days-holidays.test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEAVES_FRONT = path.join(ROOT, 'apps', 'frontend', 'src', 'components', 'shared', 'leaves');
const require = createRequire(import.meta.url);

let failures = 0;
const check = (name, cond, extra) => {
    if (cond) return console.log(`  OK  ${name}`);
    failures++;
    console.error(`  FAIL ${name}${extra !== undefined ? ` — ${extra}` : ''}`);
};

console.log('Transpilacja modulu Urlopy…');
const { HolidaysService, LeavesService, LeaveRequestsService, cleanup } = require('./leaves-backend-loader.cjs')();

// frontend: prawdziwa lista swiat + funkcja wycieta z modala po anchorze (w komponencie nie da sie jej zaimportowac)
const { nonWorkingDayReason } = await import(pathToFileURL(path.join(LEAVES_FRONT, 'polishHolidays.js')).href);
const modalSrc = fs.readFileSync(path.join(LEAVES_FRONT, 'LeaveRequestModal.jsx'), 'utf8');
const fnMatch = modalSrc.match(/\/\/ @anchor working-days-between-front[\s\S]*?(const workingDays = [\s\S]*?\n {4}\};)/);
if (!fnMatch) throw new Error('Nie znalazlem workingDays w LeaveRequestModal.jsx (anchor working-days-between-front)');
const workingDaysFront = new Function('nonWorkingDayReason', `${fnMatch[1]}\nreturn workingDays;`)(nonWorkingDayReason);

// daty tak, jak trzyma je baza (polnoc UTC) i jak wysyla je formularz wniosku (polnoc w Warszawie)
const d = s => new Date(`${s}T00:00:00.000Z`);
const requests = (a, b) => LeaveRequestsService.workingDaysBetween(d(a), d(b));
const leaves = (a, b) => LeavesService.prototype.workingDaysBetween.call({}, d(a), d(b));
const split = (a, b, n) => LeavesService.splitDaysIntoMonths(d(a), d(b), n);

const wigilia2026 = HolidaysService.holidayKeys(2026).has('2026-12-24') ? 1 : 0;
// [opis, od, do, oczekiwane dni]
const cases = [
    ['9–13.11.2026 (sroda 11.11)', '2026-11-09', '2026-11-13', 4],
    ['1–5.06.2026 (Boze Cialo, czwartek)', '2026-06-01', '2026-06-05', 4],
    ['6–10.04.2026 (Poniedzialek Wielkanocny)', '2026-04-06', '2026-04-10', 4],
    ['28.12.2026–8.01.2027 (przez sylwestra: 1.01 i 6.01)', '2026-12-28', '2027-01-08', 8],
    [`21–31.12.2026 (25.12${wigilia2026 ? ' i Wigilia 24.12' : ''})`, '2026-12-21', '2026-12-31', 8 - wigilia2026],
    ['sam 11.11.2026', '2026-11-11', '2026-11-11', 0],
    ['zwykly tydzien 16–20.11.2026', '2026-11-16', '2026-11-20', 5],
];

console.log('\n1) LeaveRequestsService.workingDaysBetween (wniosek)');
for (const [name, a, b, want] of cases) check(`${name} = ${want}`, requests(a, b) === want, requests(a, b));
// formularz wysyla polnoc czasu polskiego jako ISO w UTC — 9.11 00:00 = 8.11 23:00Z
const zFormularza = LeaveRequestsService.workingDaysBetween(new Date('2026-11-08T23:00:00.000Z'), new Date('2026-11-13T22:59:59.000Z'));
check('zakres 9–13.11 w strefie Europe/Warsaw = 4', zFormularza === 4, zFormularza);

console.log('\n2) LeavesService.workingDaysBetween (wpis)');
for (const [name, a, b, want] of cases) {
    const w = Math.max(want, 1); // wpis bez dni roboczych dostaje 1 dzien — tak jak dotad dla weekendu
    check(`${name} = ${w}`, leaves(a, b) === w, leaves(a, b));
}

console.log('\n3) LeavesService.splitDaysIntoMonths (DAK)');
const s1 = split('2026-12-28', '2027-01-08', 8);
check('przez sylwestra: 4 dni w grudniu, 4 w styczniu, workingDays 8',
    s1.workingDays === 8 && s1.months['2026-12'] === 4 && s1.months['2027-01'] === 4, JSON.stringify(s1));
const s2 = split('2026-10-30', '2026-11-03', 3);
check('30.10–3.11.2026: 1 dzien w pazdzierniku, 2 w listopadzie (1.11 niedziela)',
    s2.workingDays === 3 && s2.months['2026-10'] === 1 && s2.months['2026-11'] === 2, JSON.stringify(s2));
const s3 = split('2026-11-09', '2026-11-13', 5);
check('stary wpis 9–13.11 z daysCount 5: workingDays 4 (DAK widzi rozjazd), suma nadal 5',
    s3.workingDays === 4 && s3.months['2026-11'] === 5, JSON.stringify(s3));
const s4 = split('2026-11-11', '2026-11-11', 1);
check('wpis tylko na swieto 11.11: rozbicie po dniu kalendarzowym', s4.workingDays === 1 && s4.months['2026-11'] === 1, JSON.stringify(s4));

console.log('\n4) Frontend — workingDays z LeaveRequestModal.jsx');
for (const [name, a, b, want] of cases) check(`${name} = ${want}`, workingDaysFront(a, b) === want, workingDaysFront(a, b));
check('pole datetime-local (2026-11-09T00:00 → 2026-11-13T23:59) = 4',
    workingDaysFront('2026-11-09T00:00', '2026-11-13T23:59') === 4, workingDaysFront('2026-11-09T00:00', '2026-11-13T23:59'));

console.log('\n5) Zgodnosc frontend = backend (zakresy 1–20 dni, 2025–2027)');
const roznice = [];
const DAY = 86400000;
for (let ms = Date.UTC(2025, 0, 1); ms <= Date.UTC(2027, 11, 31); ms += DAY) {
    const a = new Date(ms).toISOString().slice(0, 10);
    for (let len = 0; len < 20; len++) {
        const b = new Date(ms + len * DAY).toISOString().slice(0, 10);
        const f = workingDaysFront(a, b), r = requests(a, b);
        if (f !== r) roznice.push(`${a}..${b} front=${f} backend=${r}`);
    }
}
check('ta sama liczba dni na froncie i w backendzie', roznice.length === 0, roznice.slice(0, 5).join('; '));

cleanup();
console.log(failures ? `\n${failures} blad(y)` : '\nWszystko OK');
process.exit(failures ? 1 : 0);
