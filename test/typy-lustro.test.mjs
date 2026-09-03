// Test lustra typów: front (`wbsTypeFromAny`) i backend (`normalizeLeafType`) MUSZĄ dawać
// ten sam wynik dla każdego typu, jaki może przyjść z bazy, z importu albo od AI.
// Rozjazd oznaczałby, że ta sama pozycja jest materiałem na ekranie, a sprzętem w bazie.
//
// Uruchomienie: node test/typy-lustro.test.mjs   (z apps/frontend, żeby zadziałał resolve)
import { readFileSync } from 'node:fs';
import { wbsTypeFromAny, LEAF_TYPE_OPTIONS } from '../apps/frontend/src/components/shared/wbs/wbsConstants.js';

const util = readFileSync(new URL('../apps/backend/src/common/leaf-types.util.ts', import.meta.url), 'utf8');

// Backendowa mapa i lista typów wyciągnięte wprost z pliku — test ma pilnować ŹRÓDŁA,
// a nie kopii przepisanej do testu.
const mapBody = util.match(/const LEGACY_REQ_TYPE_MAP[^=]*=\s*\{([\s\S]*?)\};/)[1];
const backendMap = Object.fromEntries(
    [...mapBody.matchAll(/(\w+)\s*:\s*'([^']+)'/g)].map(m => [m[1], m[2]])
);
const backendTypes = util.match(/ALL_LEAF_TYPES = \[([^\]]+)\]/)[1]
    .split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
const defaultCatalogType = util.match(/DEFAULT_CATALOG_TYPE = '([^']+)'/)[1];

const backendNormalize = (type) => {
    const t = String(type || '').toLowerCase().trim();
    if (!t) return '';
    const mapped = backendMap[t] || t;
    return backendTypes.includes(mapped) ? mapped : '';
};

let failed = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` — otrzymano ${JSON.stringify(got)}, oczekiwano ${JSON.stringify(want)}`}`);
};

// Listy typów muszą być identyczne po obu stronach
eq('lista typów liści front = backend', [...LEAF_TYPE_OPTIONS].sort(), [...backendTypes].sort());

// Każde wejście, jakie realnie występuje w danych i w importach
const WEJSCIA = [
    'DEVICE', 'MATERIAL', 'CABLE', 'SOFTWARE', 'SERVICE',   // stary enum
    'device', 'Material', ' cable ', 'SoftWare',             // różna wielkość liter i spacje z importu
    'material', 'equipment', 'work', 'service', 'lodging', 'fuel', // typy WBS
    '', null, undefined, 'jakiś-śmieć',                      // wejścia bez odpowiednika
];
for (const w of WEJSCIA) {
    eq(`normalizacja "${String(w)}" — front = backend`, wbsTypeFromAny(w), backendNormalize(w));
}

// `group` to JEDYNE celowe rozejście obu funkcji i nie wolno go „naprawić" zrównaniem:
// front normalizuje typ WĘZŁA drzewa, gdzie gałąź grupująca jest pełnoprawnym typem;
// backend normalizuje typ POZYCJI KOSZTOWEJ (wymaganie, produkt katalogu), a tam grupa
// nie ma sensu — katalog nie sprzedaje „grupujących".
eq('group jest typem węzła WBS (front)', wbsTypeFromAny('group'), 'group');
eq('group NIE jest typem pozycji kosztowej (backend)', backendNormalize('group'), '');

// Mapowania, na których stoi migracja katalogu (test/migracja-typy-katalogu.sql)
eq('DEVICE → equipment', backendNormalize('DEVICE'), 'equipment');
eq('MATERIAL → material', backendNormalize('MATERIAL'), 'material');
eq('CABLE → material (kabel to materiał)', backendNormalize('CABLE'), 'material');
eq('SOFTWARE → service (licencja to usługa)', backendNormalize('SOFTWARE'), 'service');
eq('typ nierozpoznany → pusty (wołający podstawia domyślny)', backendNormalize('xyz'), '');
eq('domyślny typ katalogu to kanoniczny typ WBS', backendTypes.includes(defaultCatalogType), true);
eq('domyślny typ katalogu = equipment (dawne DEVICE)', defaultCatalogType, 'equipment');

// Backend nie może już nigdzie ZAPISYWAĆ starego kodu
const zapisy = [
    'apps/backend/src/material-requirements/material-requirements.service.ts',
    'apps/backend/src/materials/materials.service.ts',
].map(f => [f, readFileSync(new URL('../' + f, import.meta.url), 'utf8')]);
for (const [nazwa, tresc] of zapisy) {
    eq(`brak literału 'DEVICE' w ${nazwa.split('/').pop()}`, /'DEVICE'|"DEVICE"/.test(tresc), false);
}

console.log(failed === 0 ? '\nWszystkie testy przeszły.' : `\n${failed} test(ów) nie przeszło.`);
process.exit(failed === 0 ? 0 : 1);
