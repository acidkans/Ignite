// Sprawdza, czy protokół odbioru poprawnie składa wiersze „Zamawiający" i „Wykonawca"
// na PRAWDZIWYCH danych zamówienia CMC: właściciele gałęzi z WBS + kontakty zamówienia
// + rejestr firm. Bez uruchamiania aplikacji — woła te same funkcje, których używa modal.
//
// Uruchomienie: node test/test-strony-protokolu.mjs

const { build } = await import(new URL('../apps/frontend/node_modules/esbuild/lib/main.js', import.meta.url).href);
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODE_ID = '219f64a5-515e-45a3-b1c0-0ded85e2a85d';

const sql = (q) =>
    execSync(`docker exec erp-db psql -U postgres -d erp_db -t -A -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

const res = await build({
    stdin: {
        contents: `
            import { stronaZamawiajacego, stronaWykonawcy } from './apps/frontend/src/utils/protokolOdbioruExport';
            globalThis.__strony = { stronaZamawiajacego, stronaWykonawcy };
        `,
        resolveDir: root,
        loader: 'js',
    },
    bundle: true, write: false, format: 'esm', platform: 'node',
    define: { 'import.meta.env.VITE_API_URL': '"http://localhost:3001"' },
});
await import('data:text/javascript;base64,' + Buffer.from(res.outputFiles[0].text).toString('base64'));
const { stronaZamawiajacego, stronaWykonawcy } = globalThis.__strony;

// Dane dokładnie takie, jakie modal dostaje z API.
const firma = JSON.parse(sql(`select row_to_json(c) from companies c where id='singleton'`));
const dostawcy = JSON.parse(sql(`select coalesce(json_agg(s),'[]') from suppliers s`));
const wiersz = JSON.parse(sql(
    `select row_to_json(o) from order_requirements o where "nodeId"='${NODE_ID}' and "versionId" is null`,
));
const kontakty = [
    { firma: wiersz.clientProjectManagerCompany || '', nip: wiersz.clientProjectManagerNip || '' },
    ...JSON.parse(wiersz.clientContacts || '[]').map((k) => ({ firma: k.company || '', nip: k.nip || '' })),
];
const wlasciciele = sql(
    `select distinct owner from wbs_nodes where "nodeId"='${NODE_ID}' and owner like '%—%'`,
).split('\n').filter(Boolean);

console.log('ZAMAWIAJĄCY:', stronaZamawiajacego(firma));
console.log('');
for (const w of wlasciciele) {
    const s = stronaWykonawcy([w], kontakty, dostawcy);
    const ok = s.nip ? '  OK ' : ' BRAK';
    console.log(`${ok} ${w.padEnd(48)} → ${s.nazwa || '—'} | ${s.adres || '—'} | NIP ${s.nip || '—'}`);
}
