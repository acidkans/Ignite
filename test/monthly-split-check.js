// Sprawdzenie rozbicia urlopu na miesiace — prawdziwe LeavesService.splitDaysIntoMonths
// z leaves.service.ts (transpilowane przez leaves-backend-loader.cjs, nie kopia logiki).
// Dni robocze = pn–pt bez swiat ustawowych; suma miesiecy musi sie zgadzac z daysCount.
//
// Uruchomienie: node test/monthly-split-check.js
const { LeavesService, cleanup } = require('./leaves-backend-loader.cjs')();

const split = (fromStr, toStr, daysCount) => LeavesService.splitDaysIntoMonths(new Date(fromStr), new Date(toStr), daysCount);

// [opis, od, do, daysCount, oczekiwane dni robocze]
const cases = [
  ['jeden miesiac', '2026-07-06', '2026-07-10', 5, 5],
  ['przelom miesiecy', '2026-06-29', '2026-07-03', 5, 5],
  ['przelom roku (1.01 swieto)', '2026-12-28', '2027-01-05', 6, 6],
  ['caly weekend', '2026-07-04', '2026-07-05', 2, 2],
  ['reczny wymiar mniejszy', '2026-06-29', '2026-07-03', 2.5, 5],
  ['jeden dzien', '2026-07-15', '2026-07-15', 1, 1],
  ['trzy miesiace (Boze Cialo)', '2026-05-25', '2026-07-10', 34, 34],
  ['tydzien z 11.11', '2026-11-09', '2026-11-13', 4, 4],
  ['stary wpis liczony ze swietem', '2026-11-09', '2026-11-13', 5, 4],
];

let bad = 0;
for (const [name, f, t, d, wd] of cases) {
  const r = split(f, t, d);
  const sum = Math.round(Object.values(r.months).reduce((a, b) => a + b, 0) * 100) / 100;
  const ok = Math.abs(sum - d) < 0.001 && r.workingDays === wd;
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'BLAD'} | ${name.padEnd(30)} | ${f}..${t} | daysCount=${d} | dni robocze=${r.workingDays} (oczek. ${wd}) | ${JSON.stringify(r.months)} | suma=${sum}`);
}
cleanup();
console.log(bad ? `\n${bad} przypadkow nie zgadza sie (suma albo dni robocze)` : '\nWszystkie sumy zgadzaja sie z daysCount, dni robocze bez swiat');
process.exit(bad ? 1 : 0);
