// Test logiki statusów gałęzi (etap 1 rozdziału statusów).
// Uruchomienie: node test/status-agregacja.test.mjs   (z korzenia repo)
//
// Sprawdza dwie funkcje z `wbsConstants.js`, które decydują, KTO ma własny status,
// a kto pokazuje sumę statusów swoich pozycji:
//   - nodeHasOwnStatus / aggregateBranchStatus  — wariant drzewiasty (WBSHybridTable)
//   - buildAggregatedStatusMap                  — wariant płaski (widok Budżet, eksporty)
// Oba muszą dawać ten sam wynik dla tego samego drzewa — rozjazd oznaczałby, że tabela
// pokazuje co innego niż Excel.

import {
    nodeHasOwnStatus,
    aggregateBranchStatus,
    buildAggregatedStatusMap,
    PLAN_STATUS_META,
    PLAN_STATUS_CODES,
    planStatusFromAny,
    PURCHASE_STATUS_META,
    EXEC_STATUS_META,
    execStatusLabel,
    hasPurchaseAxis,
    hasExecAxis,
} from '../apps/frontend/src/components/shared/wbs/wbsConstants.js';

let failed = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `\n     otrzymano: ${JSON.stringify(got)}\n     oczekiwano: ${JSON.stringify(want)}`}`);
};

// ── Drzewo testowe ───────────────────────────────────────────────────────────
// Przedmiot projektu (depth 0)
//   └─ Kamery (gałąź grupująca, type='')
//        ├─ kamera kopułkowa   equipment  CONFIRMED
//        ├─ kamera tubowa      equipment  CONFIRMED
//        └─ Montaż (gałąź grupująca)
//             ├─ robocizna     work       STARTED
//             └─ dojazd        fuel       NEW
//   └─ Avigilon + licencje (POZYCJA kosztowa Z DZIEĆMI) equipment ORDERED
//        └─ licencja ACC7      equipment  NEW
const flat = [
    { id: 'root', parentId: null, type: '', status: 'ORDERED', name: 'Przedmiot projektu' },
    { id: 'kamery', parentId: 'root', type: '', status: 'PENDING', name: 'Kamery' },
    { id: 'kop', parentId: 'kamery', type: 'equipment', status: 'CONFIRMED', name: 'kamera kopułkowa' },
    { id: 'tub', parentId: 'kamery', type: 'equipment', status: 'CONFIRMED', name: 'kamera tubowa' },
    { id: 'montaz', parentId: 'kamery', type: 'group', status: 'IN_STOCK', name: 'Montaż' },
    { id: 'rob', parentId: 'montaz', type: 'work', status: 'STARTED', name: 'robocizna' },
    { id: 'doj', parentId: 'montaz', type: 'fuel', status: '', name: 'dojazd' },
    { id: 'avi', parentId: 'root', type: 'equipment', status: 'ORDERED', name: 'Avigilon + licencje' },
    { id: 'lic', parentId: 'avi', type: 'equipment', status: 'NEW', name: 'licencja ACC7' },
];

const tree = (() => {
    const byId = new Map(flat.map(n => [n.id, { ...n, children: [] }]));
    const roots = [];
    for (const n of flat) {
        const node = byId.get(n.id);
        if (n.parentId) byId.get(n.parentId).children.push(node);
        else roots.push(node);
    }
    return { byId, roots };
})();

// ── Kto ma własny status ─────────────────────────────────────────────────────
eq('przedmiot projektu (depth 0) nie ma własnego statusu',
    nodeHasOwnStatus(tree.byId.get('root'), 0), false);
eq('gałąź grupująca z dziećmi nie ma własnego statusu',
    nodeHasOwnStatus(tree.byId.get('kamery'), 1), false);
eq('gałąź type=group nie ma własnego statusu',
    nodeHasOwnStatus(tree.byId.get('montaz'), 2), false);
eq('liść kosztowy ma własny status',
    nodeHasOwnStatus(tree.byId.get('kop'), 2), true);
eq('POZYCJA kosztowa z dziećmi zachowuje własny status',
    nodeHasOwnStatus(tree.byId.get('avi'), 1), true);
eq('węzeł bez typu i bez dzieci ma własny status (jeszcze nieotypowana pozycja)',
    nodeHasOwnStatus({ id: 'x', type: '', children: [] }, 1), true);

// ── Agregacja na drzewie ─────────────────────────────────────────────────────
const montaz = aggregateBranchStatus(tree.byId.get('montaz'), 2);
eq('Montaż: STARTED + NEW → MIXED', montaz.code, 'MIXED');
eq('Montaż: liczy 2 pozycje', montaz.count, 2);
// Agregacja liczy na kodach PLANU: `STARTED` (robota ruszyła) znaczy w planie tyle, że
// klient pozycję przyjął → CONFIRMED. Pusty status → NEW.
eq('Montaż: STARTED → CONFIRMED, pusty → NEW (kody planu)',
    montaz.breakdown.map(b => b.code).sort(), ['CONFIRMED', 'NEW']);

const kamery = aggregateBranchStatus(tree.byId.get('kamery'), 1);
eq('Kamery: 2x CONFIRMED + poddrzewo Montażu → MIXED', kamery.code, 'MIXED');
eq('Kamery: rekurencja schodzi przez gałąź Montaż (4 pozycje)', kamery.count, 4);

const root = aggregateBranchStatus(tree.byId.get('root'), 0);
eq('Przedmiot projektu: rekurencja ZATRZYMUJE się na pozycji kosztowej z dziećmi (4+1)',
    root.count, 5);
eq('Przedmiot projektu: licencja ACC7 NIE wchodzi do sumy korzenia',
    root.breakdown.reduce((s, b) => s + b.count, 0), 5);

const jednorodna = aggregateBranchStatus({
    children: [
        { id: 'a', type: 'material', status: 'CONFIRMED', children: [] },
        { id: 'b', type: 'material', status: 'CONFIRMED', children: [] },
    ],
}, 1);
eq('gałąź jednorodna: jeden wspólny kod', jednorodna.code, 'CONFIRMED');
eq('gałąź jednorodna: etykieta ze słownika PLANU', jednorodna.label, 'Zaakceptowane');

const pusta = aggregateBranchStatus({ children: [] }, 1);
eq('gałąź bez pozycji: pusty kod', pusta.code, '');
eq('gałąź bez pozycji: etykieta „Brak"', pusta.label, 'Brak');

const noweMnogie = aggregateBranchStatus({
    children: [{ id: 'a', type: 'work', status: 'NEW', children: [] }],
}, 1);
eq('etykieta NEW dla gałęzi w liczbie mnogiej („Nowe", nie „Nowy")', noweMnogie.label, 'Nowe');

// ── Statusy etapu PLANU ──────────────────────────────────────────────────────
// Planowanie kończy się na zaakceptowane / odrzucone. Kody realizacyjne, które siedzą
// w tej samej kolumnie bazy, mają się POKAZYWAĆ jako jeden z czterech kodów planu.
eq('lista statusów planu', PLAN_STATUS_CODES, ['NEW', 'PROPOSAL', 'CONFIRMED', 'REJECTED']);
eq('etykiety planu',
    PLAN_STATUS_CODES.map(c => PLAN_STATUS_META[c].label),
    ['Nowe', 'Zaproponowane', 'Zaakceptowane', 'Odrzucone']);

for (const [wejscie, oczekiwane] of [
    ['', 'NEW'], [null, 'NEW'], ['NEW', 'NEW'],
    ['PENDING', 'NEW'],           // „Oczekuje" = pozycja dopiero powstała
    ['PROPOSAL', 'PROPOSAL'],
    ['REJECTED', 'REJECTED'],
    ['CONFIRMED', 'CONFIRMED'],
    ['ORDERED', 'CONFIRMED'],     // zamówione → klient przyjął wcześniej
    ['IN_STOCK', 'CONFIRMED'],
    ['ISSUED', 'CONFIRMED'],
    ['INSTALLED', 'CONFIRMED'],   // „Zainstalowane" nad materiałem znika z planu
    ['STARTED', 'CONFIRMED'],     // „Rozpoczęte" nad pracą znika z planu
    ['ON_HOLD', 'CONFIRMED'],
    ['COMPLETED', 'CONFIRMED'],
    ['EXTRA_ORDER', 'CONFIRMED'],
]) {
    eq(`planStatusFromAny("${String(wejscie)}") → ${oczekiwane}`, planStatusFromAny(wejscie), oczekiwane);
}

// Żaden kod realizacyjny nie może przeciec do listy wyboru w planowaniu
const ZAKAZANE = ['PENDING', 'ORDERED', 'EXTRA_ORDER', 'IN_STOCK', 'ISSUED', 'DONE', 'INSTALLED',
    'STARTED', 'ON_HOLD', 'COMPLETED', 'UNFINISHED', 'CANCELLED'];
eq('lista planu nie zawiera kodów realizacyjnych',
    PLAN_STATUS_CODES.filter(c => ZAKAZANE.includes(c)), []);

// ── Osie REALIZACJI: zakup i wykonanie ───────────────────────────────────────
// Która oś dotyczy którego typu liścia. Materiał i sprzęt mają obie (kupione ≠ zamontowane),
// praca własna tylko wykonanie, nocleg i paliwo tylko zakup.
for (const [typ, zakup, wykonanie] of [
    ['material',  true,  true],
    ['equipment', true,  true],
    ['work',      false, true],   // dnia pracy własnej ekipy nie da się zamówić
    ['service',   true,  true],   // podwykonawcę się zleca i osobno odbiera
    ['lodging',   true,  false],  // nocleg się kupuje, nie wykonuje
    ['fuel',      true,  false],
    ['group',     false, false],  // gałąź nie jest pozycją kosztową
    ['',          false, false],
]) {
    eq(`oś zakupu dla "${typ}"`, hasPurchaseAxis(typ), zakup);
    eq(`oś wykonania dla "${typ}"`, hasExecAxis(typ), wykonanie);
}

// Etykiety osi wykonania zależą od typu: materiał się MONTUJE, pracę WYKONUJE.
eq('DONE nad materiałem = „Zainstalowane"', execStatusLabel('material', 'DONE'), 'Zainstalowane');
eq('DONE nad sprzętem = „Zainstalowane"', execStatusLabel('equipment', 'DONE'), 'Zainstalowane');
eq('DONE nad pracą = „Wykonane"', execStatusLabel('work', 'DONE'), 'Wykonane');
eq('DONE nad usługą = „Wykonane"', execStatusLabel('service', 'DONE'), 'Wykonane');
eq('TO_DO nad materiałem = „Do montażu"', execStatusLabel('material', 'TO_DO'), 'Do montażu');

// Stany, które ustawia protokół odbioru (patrz `protokol-po-odbiorze-statusy`).
eq('protokół dla prac ustawia kod istniejący w osi wykonania', !!EXEC_STATUS_META.DONE, true);
eq('protokół dla materiału — wariant „dostarczone" istnieje w osi zakupu', !!PURCHASE_STATUS_META.DELIVERED, true);
eq('„Dostarczone" to oś ZAKUPU, nie wykonania', PURCHASE_STATUS_META.DELIVERED.label, 'Dostarczone');

// Osie realizacji NIE mogą dzielić kodów ze słownikiem planu — inaczej jeden odczyt nie
// wiedziałby, o którym etapie mówi.
const wspolne = Object.keys(PURCHASE_STATUS_META).filter(c => PLAN_STATUS_CODES.includes(c));
eq('oś zakupu nie dzieli kodów z planem', wspolne, []);
const wspolne2 = Object.keys(EXEC_STATUS_META).filter(c => PLAN_STATUS_CODES.includes(c));
eq('oś wykonania nie dzieli kodów z planem', wspolne2, []);

// ── Wariant płaski musi zgadzać się z drzewiastym ────────────────────────────
const map = buildAggregatedStatusMap(flat);
eq('mapa zawiera tylko gałęzie', [...map.keys()].sort(), ['kamery', 'montaz', 'root']);
eq('mapa: Montaż = drzewo', map.get('montaz').code, montaz.code);
eq('mapa: Kamery = drzewo', map.get('kamery').code, kamery.code);
eq('mapa: korzeń = drzewo', map.get('root').count, root.count);
eq('mapa NIE zawiera pozycji kosztowej z dziećmi', map.has('avi'), false);

console.log(failed === 0 ? '\nWszystkie testy przeszły.' : `\n${failed} test(ów) nie przeszło.`);
process.exit(failed === 0 ? 0 : 1);
