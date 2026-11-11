// Wigilia (24.12) jako dzien ustawowo wolny od 2025 r. we wszystkich listach swiat:
//  1. harmonogram (`harmonogramCzas.js` — dni robocze, eksport Excel / arkusz Dni_wolne),
//  2. urlopy frontend (`leaves/polishHolidays.js`),
//  3. urlopy backend (`HolidaysService.holidayKeys()` + propozycje dni wolnych za sobote),
//  4. zgodnosc dni wolnych w trzech listach dzien po dniu w latach 2020–2040.
//
// Backend transpilowany z src (TypeScript), wiec test sprawdza realna logike, nie kopie regul.
// Uruchomienie: node test/wigilia-dzien-wolny.test.mjs
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONT = path.join(ROOT, 'apps', 'frontend', 'src', 'components', 'shared');

let failures = 0;
const check = (name, cond, extra) => {
    if (cond) return console.log(`  OK  ${name}`);
    failures++;
    console.error(`  FAIL ${name}${extra !== undefined ? ` — ${extra}` : ''}`);
};

const czas = await import(pathToFileURL(path.join(FRONT, 'harmonogram', 'harmonogramCzas.js')).href);
const urlopy = await import(pathToFileURL(path.join(FRONT, 'leaves', 'polishHolidays.js')).href);

// node_modules backendu: w worktree ich nie ma — wtedy bierzemy z glownego checkoutu
const gitCommon = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT })
    .toString().trim();
const MODULES = [path.join(ROOT, 'apps', 'backend', 'node_modules'), path.join(path.dirname(gitCommon), 'apps', 'backend', 'node_modules')]
    .find(p => fs.existsSync(path.join(p, 'typescript')));
if (!MODULES) throw new Error('Brak apps/backend/node_modules (typescript) — zrob npm install w apps/backend');
fs.mkdirSync(path.join(MODULES, '.cache'), { recursive: true });
const OUT = fs.mkdtempSync(path.join(MODULES, '.cache', 'wigilia-test-'));

// transpilacja bez sprawdzania typow: zrodla z worktree nie widza node_modules z glownego checkoutu,
// a wynik musi lezec pod MODULES, zeby require('@nestjs/common') sie rozwiazal
console.log('Transpilacja HolidaysService…');
const require = createRequire(import.meta.url);
const ts = require(path.join(MODULES, 'typescript'));
const { outputText } = ts.transpileModule(
    fs.readFileSync(path.join(ROOT, 'apps', 'backend', 'src', 'leaves', 'holidays.service.ts'), 'utf8'),
    {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
            experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true,
        },
    },
);
fs.mkdirSync(path.join(OUT, 'leaves'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'prisma'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'leaves', 'holidays.service.js'), outputText);
// testujemy tylko metody statyczne — PrismaService (z cala reszta backendu) zastepuje zaslepka
fs.writeFileSync(path.join(OUT, 'prisma', 'prisma.service.js'), 'exports.PrismaService = class PrismaService {};\n');
require(path.join(MODULES, 'reflect-metadata'));
const { HolidaysService } = require(path.join(OUT, 'leaves', 'holidays.service.js'));

const local = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

console.log('\n1) Harmonogram (harmonogramCzas.js)');
check('24.12.2026 jest swietem', czas.isPolishHoliday(local('2026-12-24')));
check('24.12.2025 jest swietem', czas.isPolishHoliday(local('2025-12-24')));
check('24.12.2024 NIE jest swietem (przed nowelizacja)', !czas.isPolishHoliday(local('2024-12-24')));
check('24.12.2026 (czwartek) to dzien wolny', czas.isNonWorkingDay(local('2026-12-24')));
check('23.12.2026 (sroda) zostaje dniem roboczym', !czas.isNonWorkingDay(local('2026-12-23')));
let grudzien = 0;
for (const c = local('2026-12-01'); c.getMonth() === 11; c.setDate(c.getDate() + 1)) if (!czas.isNonWorkingDay(c)) grudzien++;
check('grudzien 2026 ma 21 dni roboczych (23 pn–pt minus 24 i 25.12)', grudzien === 21, grudzien);

console.log('\n2) Urlopy frontend (polishHolidays.js)');
check('24.12.2026 — powod „Wigilia Bożego Narodzenia"',
    urlopy.nonWorkingDayReason('2026-12-24') === 'Wigilia Bożego Narodzenia', urlopy.nonWorkingDayReason('2026-12-24'));
check('24.12.2024 (wtorek) to dzien roboczy', urlopy.nonWorkingDayReason('2024-12-24') === null, urlopy.nonWorkingDayReason('2024-12-24'));
check('urlop od 24.12.2026 przesuwa sie na 28.12', urlopy.nextWorkingDayFrom('2026-12-24') === '2026-12-28', urlopy.nextWorkingDayFrom('2026-12-24'));
check('urlop do 24.12.2026 cofa sie na 23.12', urlopy.previousWorkingDayFrom('2026-12-24') === '2026-12-23', urlopy.previousWorkingDayFrom('2026-12-24'));

console.log('\n3) Urlopy backend (HolidaysService)');
check('holidayKeys(2026) zna 2026-12-24', HolidaysService.holidayKeys(2026).has('2026-12-24'));
check('holidayKeys(2025) zna 2025-12-24', HolidaysService.holidayKeys(2025).has('2025-12-24'));
check('holidayKeys(2024) NIE zna 2024-12-24', !HolidaysService.holidayKeys(2024).has('2024-12-24'));
const p2033 = HolidaysService.proposalsForYear(2033);
check('24.12.2033 (sobota) daje propozycje dnia wolnego za sobote',
    p2033.some(p => p.date === '2033-12-24' && p.name === 'Wigilia Bożego Narodzenia'), JSON.stringify(p2033));
const p2022 = HolidaysService.proposalsForYear(2022);
check('24.12.2022 (sobota, przed 2025) NIE daje propozycji', !p2022.some(p => p.date === '2022-12-24'), JSON.stringify(p2022));
check('25.12.2022 (niedziela) nadal bez propozycji', !p2022.some(p => p.date === '2022-12-25'));

// dzien wolny = weekend albo swieto; harmonogram nie trzyma Zielonych Swiatek (zawsze niedziela),
// wiec porownujemy dni wolne, a nie surowe listy swiat
console.log('\n4) Zgodnosc dni wolnych w trzech listach 2020–2040 (dzien po dniu)');
const pad = n => String(n).padStart(2, '0');
const roznice = [];
for (let y = 2020; y <= 2040; y++) {
    const back = HolidaysService.holidayKeys(y);
    for (const c = new Date(y, 0, 1); c.getFullYear() === y; c.setDate(c.getDate() + 1)) {
        const k = `${y}-${pad(c.getMonth() + 1)}-${pad(c.getDate())}`;
        const weekend = c.getDay() === 0 || c.getDay() === 6;
        const a = czas.isNonWorkingDay(c), b = weekend || back.has(k), f = urlopy.nonWorkingDayReason(k) !== null;
        if (a !== b || b !== f) roznice.push(`${k} harmonogram=${a} backend=${b} urlopy=${f}`);
    }
}
check('harmonogram, urlopy frontend i backend maja identyczne dni wolne', roznice.length === 0, roznice.slice(0, 5).join('; '));

fs.rmSync(OUT, { recursive: true, force: true });
console.log(failures ? `\n${failures} blad(y)` : '\nWszystko OK');
process.exit(failures ? 1 : 0);
