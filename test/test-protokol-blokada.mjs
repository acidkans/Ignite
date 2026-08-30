// Test blokady pozycji już odebranych: `pozycjaZamknieta` z protokolOdbioruExport.js.
// Czysta logika, bez bazy i bez przeglądarki.
//
// Uruchomienie: node test/test-protokol-blokada.mjs

// Util ciągnie `./config` i `import.meta.env` — rozwiązuje to Vite, nie Node. Bundlujemy
// go esbuildem tak samo jak `test-protokol-roznice.mjs`, zamiast dublować logikę w teście.
const { build } = await import(new URL('../apps/frontend/node_modules/esbuild/lib/main.js', import.meta.url).href);
const { fileURLToPath } = await import('url');
const { dirname, join } = await import('path');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = await build({
    stdin: {
        contents: `
      import { pozycjaZamknieta, pozostaloDoOdbioru } from './apps/frontend/src/utils/protokolOdbioruExport';
      globalThis.__h = { pozycjaZamknieta, pozostaloDoOdbioru };
    `,
        resolveDir: root, loader: 'js',
    },
    bundle: true, write: false, format: 'esm', platform: 'node',
    define: { 'import.meta.env.VITE_API_URL': '"http://localhost:3001"' },
});
await import('data:text/javascript;base64,' + Buffer.from(res.outputFiles[0].text).toString('base64'));
const { pozycjaZamknieta, pozostaloDoOdbioru } = globalThis.__h;

let bledy = 0;
const sprawdz = (opis, got, exp) => {
    const ok = JSON.stringify(got) === JSON.stringify(exp);
    if (!ok) bledy++;
    console.log(`${ok ? 'OK  ' : 'BŁĄD'} ${opis}`);
    if (!ok) console.log(`     dostałem: ${JSON.stringify(got)}, oczekiwane: ${JSON.stringify(exp)}`);
};

// ─ Zamknięcie flagą ──────────────────────────────────────────────────────────
sprawdz('flaga domkniete zamyka pozycję', pozycjaZamknieta(4900, { odebrane: 3000, domkniete: true }), true);
sprawdz('flaga domkniete zamyka też przy odbiorze niższym od oferty (rabat)',
    pozycjaZamknieta(4900, { odebrane: 100, domkniete: true }), true);

// ─ Zamknięcie wyczerpaniem kwoty (regresja ze zgłoszenia) ────────────────────
sprawdz('odebrane == plan, bez flagi → zamknięta',
    pozycjaZamknieta(1900, { odebrane: 1900, domkniete: false }), true);
sprawdz('odebrane > plan (5100 z 4900), bez flagi → zamknięta',
    pozycjaZamknieta(4900, { odebrane: 5100, domkniete: false }), true);
sprawdz('grosz poniżej planu → wciąż otwarta',
    pozycjaZamknieta(1900, { odebrane: 1899.99, domkniete: false }), false);
sprawdz('odbiór częściowy → otwarta',
    pozycjaZamknieta(4900, { odebrane: 2000, domkniete: false }), false);

// ─ Pozycje nietknięte ────────────────────────────────────────────────────────
sprawdz('brak wpisu w rejestrze → otwarta', pozycjaZamknieta(4900, undefined), false);
sprawdz('plan 0 i nic nie odebrano → otwarta (pozycja bez wyceny)',
    pozycjaZamknieta(0, { odebrane: 0, domkniete: false }), false);
sprawdz('plan 0, ale coś odebrano → zamknięta',
    pozycjaZamknieta(0, { odebrane: 500, domkniete: false }), true);

// ─ Plan podniesiony po odbiorze otwiera pozycję z powrotem ───────────────────
sprawdz('wycena podniesiona po odbiorze częściowym → znów otwarta',
    pozycjaZamknieta(1500, { odebrane: 1000, domkniete: false }), false);
sprawdz('wycena podniesiona po odbiorze DOMKNIĘTYM → zostaje zamknięta',
    pozycjaZamknieta(1500, { odebrane: 1000, domkniete: true }), true);

// ─ Spójność z pozostaloDoOdbioru ─────────────────────────────────────────────
sprawdz('zamknięta pozycja nie ma czego odbierać',
    pozostaloDoOdbioru(4900, { odebrane: 5100, domkniete: false }), 0);

console.log(bledy ? `\n${bledy} błędów` : '\nWszystkie przeszły');
process.exit(bledy ? 1 : 0);
