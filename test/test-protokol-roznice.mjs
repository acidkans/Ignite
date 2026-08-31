// Test adnotacji o różnicy między kwotą ofertową a kwotą odbioru.
// Uruchomienie: node test/test-protokol-roznice.mjs
const { build } = await import(new URL('../apps/frontend/node_modules/esbuild/lib/main.js', import.meta.url).href);
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = await build({
  stdin: {
    contents: `
      import { budujRoznice, tekstRoznic, fmtZlProtokol } from './apps/frontend/src/utils/protokolOdbioruExport';
      globalThis.__h = { budujRoznice, tekstRoznic, fmtZlProtokol };
    `,
    resolveDir: root, loader: 'js',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env.VITE_API_URL': '"http://localhost:3001"' },
});
await import('data:text/javascript;base64,' + Buffer.from(res.outputFiles[0].text).toString('base64'));
const { budujRoznice, tekstRoznic, fmtZlProtokol: zl } = globalThis.__h;

// Kwoty w oczekiwaniach składamy TYM SAMYM formaterem, którego używa kod. Wpisane na
// sztywno „5 100,00 pln" wywracało test na Node bez pełnego ICU — separator tysięcy zależy
// od środowiska, a sprawdzamy treść adnotacji, nie ustawienia locale.
const NAGL = 'Wartość odbioru różni się od oferty:';

let bledy = 0;
const sprawdz = (opis, got, exp) => {
  const ok = got === exp;
  if (!ok) bledy++;
  console.log(`${ok ? 'OK  ' : 'BŁĄD'} ${opis}`);
  if (!ok) console.log(`     dostałem:\n${got}\n     oczekiwane:\n${exp}`);
};

const tekst = (pozycje) => tekstRoznic(budujRoznice(pozycje));

sprawdz('kwota równa ofercie — brak adnotacji',
  tekst([{ nazwa: 'A', oferta: 40470, odebraneWczesniej: 0, kwota: 40470, pelny: true }]),
  '');

sprawdz('akceptacja WYŻSZA od oferty przy pierwszym protokole',
  tekst([{ nazwa: 'instalacje HVAC', oferta: 40470, odebraneWczesniej: 0, kwota: 41000, pelny: true }]),
  `${NAGL}\n– instalacje HVAC: oferta ${zl(40470)}, odbiór ${zl(41000)} (+${zl(530)})`);

sprawdz('akceptacja NIŻSZA od oferty, pozycja domknięta (rabat)',
  tekst([{ nazwa: 'instalacje HVAC', oferta: 40470, odebraneWczesniej: 0, kwota: 40000, pelny: true }]),
  `${NAGL}\n– instalacje HVAC: oferta ${zl(40470)}, odbiór ${zl(40000)} (−${zl(470)})`);

sprawdz('odbiór częściowy — różnica z dopiskiem o reszcie',
  tekst([{ nazwa: 'Pozycja B', oferta: 1900, odebraneWczesniej: 0, kwota: 1000, pelny: false }]),
  `${NAGL}\n– Pozycja B: oferta ${zl(1900)}, odbiór ${zl(1000)} (−${zl(900)}); pozycja pozostaje otwarta, do odbioru ${zl(900)}`);

sprawdz('drugi protokół domykający resztę dokładnie wg oferty — brak adnotacji',
  tekst([{ nazwa: 'Pozycja B', oferta: 1900, odebraneWczesniej: 1000, kwota: 900, pelny: true }]),
  '');

sprawdz('drugi protokół domykający resztę powyżej oferty',
  tekst([{ nazwa: 'Pozycja B', oferta: 1900, odebraneWczesniej: 1000, kwota: 1100, pelny: true }]),
  `${NAGL}\n– Pozycja B: oferta ${zl(1900)}, odbiór ${zl(2100)} (+${zl(200)})`);

sprawdz('kilka pozycji — wiersz Razem',
  tekst([
    { nazwa: 'A', oferta: 5100, odebraneWczesniej: 0, kwota: 5300, pelny: true },
    { nazwa: 'B', oferta: 1900, odebraneWczesniej: 0, kwota: 1800, pelny: true },
  ]),
  `${NAGL}\n`
  + `– A: oferta ${zl(5100)}, odbiór ${zl(5300)} (+${zl(200)})\n`
  + `– B: oferta ${zl(1900)}, odbiór ${zl(1800)} (−${zl(100)})\n`
  + `Razem: oferta ${zl(7000)}, odbiór ${zl(7100)} (+${zl(100)})`);

sprawdz('groszowa różnica poniżej progu nie zaśmieca uwag',
  tekst([{ nazwa: 'A', oferta: 5100, odebraneWczesniej: 0, kwota: 5100.004, pelny: true }]),
  '');

console.log(bledy ? `\n${bledy} test(y) nie przeszły` : '\nwszystkie testy przeszły');
process.exit(bledy ? 1 : 0);
