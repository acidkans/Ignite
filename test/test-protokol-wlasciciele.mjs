// Test podpowiadania przedstawiciela podwykonawcy z właściciela gałęzi WBS.
// Uruchomienie: node test/test-protokol-wlasciciele.mjs
const { build } = await import(new URL('../apps/frontend/node_modules/esbuild/lib/main.js', import.meta.url).href);
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = await build({
  stdin: {
    contents: `
      import { buildBranchOwners, ownersOfSelection } from './apps/frontend/src/utils/protokolOdbioruExport';
      globalThis.__h = { buildBranchOwners, ownersOfSelection };
    `,
    resolveDir: root, loader: 'js',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env.VITE_API_URL': '"http://localhost:3001"' },
});
await import('data:text/javascript;base64,' + Buffer.from(res.outputFiles[0].text).toString('base64'));
const { buildBranchOwners, ownersOfSelection } = globalThis.__h;

const wbs = [
  { id: 'g1', name: 'instalacje HVAC',   depth: 0, parentId: null, owner: 'Netformers - Marek Zawadzki' },
  { id: 'g2', name: 'instalacja PPOŻ',   depth: 0, parentId: null, owner: '' },
  { id: 'g3', name: 'roboty budowlane',  depth: 0, parentId: null, owner: '' },
];
const lisc = (id, galaz, owner = '') => ({ node: { id, name: id, path: `${galaz} › ${id}`, owner }, card: null });

const owners = buildBranchOwners(wbs);
let bledy = 0;
const sprawdz = (opis, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) bledy++;
  console.log(`${ok ? 'OK  ' : 'BŁĄD'} ${opis}\n     dostałem: ${JSON.stringify(got)}\n     oczekiwane: ${JSON.stringify(exp)}`);
};

sprawdz('właściciel gałęzi trafia do przedstawiciela',
  ownersOfSelection([lisc('a', 'instalacje HVAC')], owners),
  ['Netformers - Marek Zawadzki']);

sprawdz('gałąź bez właściciela — schodzimy do właścicieli zaznaczonych liści',
  ownersOfSelection([lisc('b', 'instalacja PPOŻ', 'Alfa - Jan Nowak'), lisc('c', 'instalacja PPOŻ', 'Alfa - Jan Nowak')], owners),
  ['Alfa - Jan Nowak']);

sprawdz('dwie gałęzie różnych wykonawców — obaj w polu, żadnego nie gubimy',
  ownersOfSelection([lisc('a', 'instalacje HVAC'), lisc('b', 'instalacja PPOŻ', 'Alfa - Jan Nowak')], owners),
  ['Netformers - Marek Zawadzki', 'Alfa - Jan Nowak']);

sprawdz('nigdzie nie ma właściciela — pusto, więc pole zostaje nietknięte',
  ownersOfSelection([lisc('d', 'roboty budowlane')], owners),
  []);

sprawdz('właściciel gałęzi wygrywa z właścicielem liścia',
  ownersOfSelection([lisc('a', 'instalacje HVAC', 'Beta - Ktoś Inny')], owners),
  ['Netformers - Marek Zawadzki']);

console.log(bledy ? `\n${bledy} test(y) nie przeszły` : '\nwszystkie testy przeszły');
process.exit(bledy ? 1 : 0);
