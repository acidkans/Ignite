// Test etapu 5: statusy realizacji wynikające z FAKTÓW (wpisy `LeafActual`, protokoły odbioru).
// Uruchomienie: node ../../test/status-etap5.test.mjs   (z apps/frontend)
//
// Sprawdza trzy rzeczy, które etap 5 dołożył do `wbsConstants.js`:
//   1. `suggestAxisStatus`        — podpowiedź osi zakupu i wykonania z dziennika wpisów,
//   2. `handedOverFromProtocol`   — „Odebrane" wyliczone z rejestru protokołów,
//   3. bramki etapów (`axisGateOf`) — łańcuch plan → zakup → montaż,
//   4. agregacja gałęzi na TRZECH osiach (`aggregateBranchStatus` / `buildAggregatedStatusMap`
//      z parametrem `axis`) — z regułą „rekurencja zatrzymuje się na pierwszym węźle
//      z własnym statusem, a pozycja kosztowa z dziećmi liczy się jako liść".

import {
    axisGateOf,
    suggestAxisStatus,
    handedOverFromProtocol,
    aggregateBranchStatus,
    buildAggregatedStatusMap,
    axisStatusCodeOf,
    summarizeStatusCodes,
    PURCHASE_STATUS_META,
    EXEC_STATUS_META,
    AXIS_STATUS_ORDER,
    PLAN_STATUS_CODES,
} from '../apps/frontend/src/components/shared/wbs/wbsConstants.js';

let failed = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `\n     otrzymano: ${JSON.stringify(got)}\n     oczekiwano: ${JSON.stringify(want)}`}`);
};

// ── 1. Nowy kod osi zakupu ───────────────────────────────────────────────────
eq('istnieje kod dostawy częściowej', !!PURCHASE_STATUS_META.PARTIALLY_DELIVERED, true);
eq('etykieta dostawy częściowej', PURCHASE_STATUS_META.PARTIALLY_DELIVERED.label, 'Dostawa częściowa');
eq('dostawa częściowa leży PRZED dostarczeniem',
    AXIS_STATUS_ORDER.purchase.PARTIALLY_DELIVERED < AXIS_STATUS_ORDER.purchase.DELIVERED, true);
eq('nowy kod nie zderza się ze słownikiem planu',
    PLAN_STATUS_CODES.includes('PARTIALLY_DELIVERED'), false);

// ── 2. Podpowiedzi z wpisów realizacji ───────────────────────────────────────
// Pozycja PRZYJĘTA przez klienta — bez tego każda oś stoi za bramką „Czeka na akceptację"
// i żadna podpowiedź nie ma prawa się pojawić (patrz sekcja bramek niżej).
const mat = (over = {}) => ({ type: 'material', status: 'CONFIRMED', ...over });
// Materiał, którego dostawa już ruszyła — dopiero wtedy otwiera się oś montażu.
const matDostarczony = (over = {}) => mat({ purchaseStatus: 'DELIVERED', ...over });

eq('brak wpisów → brak podpowiedzi',
    suggestAxisStatus(mat(), { qty: 0, plan: 10, entriesCount: 0 }), {});

// Sam zakup, BEZ montażu: dopóki oś zakupu stoi na „Do zamówienia", montaż czeka za bramką.
eq('część planu → sama dostawa częściowa (montaż jeszcze za bramką)',
    suggestAxisStatus(mat(), { qty: 4, plan: 10, entriesCount: 1 }),
    { purchaseStatus: 'PARTIALLY_DELIVERED' });

// Po otwarciu osi zakupu ta sama pozycja dostaje podpowiedź montażu — łańcuch przesuwa się
// o jeden człon i dopiero wtedy fakt z dziennika ma prawo cokolwiek powiedzieć o montażu.
eq('dostarczony materiał → podpowiedź montażu',
    suggestAxisStatus(matDostarczony(), { qty: 4, plan: 10, entriesCount: 1 }).execStatus,
    'IN_PROGRESS');

eq('cały plan → dostarczone',
    suggestAxisStatus(mat(), { qty: 10, plan: 10, entriesCount: 2 }).purchaseStatus, 'DELIVERED');

eq('ponad plan → dostarczone (nadwyżka to nadal dostawa)',
    suggestAxisStatus(mat(), { qty: 12, plan: 10, entriesCount: 3 }).purchaseStatus, 'DELIVERED');

// Plan = 0 (pozycja bez wyceny ilościowej): nie wiadomo, wobec czego mierzyć pełną dostawę,
// więc zostaje przy częściowej — nie ogłaszamy domknięcia, którego nie da się policzyć.
eq('plan = 0 → dostawa częściowa, nie dostarczone',
    suggestAxisStatus(mat(), { qty: 3, plan: 0, entriesCount: 1 }).purchaseStatus, 'PARTIALLY_DELIVERED');

// ── Podpowiedź NIE COFA ──────────────────────────────────────────────────────
eq('zafakturowane nie wraca na dostarczone',
    suggestAxisStatus(mat({ purchaseStatus: 'INVOICED' }), { qty: 10, plan: 10, entriesCount: 1 }).purchaseStatus,
    undefined);
eq('dostarczone nie wraca na dostawę częściową',
    suggestAxisStatus(mat({ purchaseStatus: 'DELIVERED' }), { qty: 4, plan: 10, entriesCount: 1 }).purchaseStatus,
    undefined);
eq('anulowany zakup nie dostaje podpowiedzi',
    suggestAxisStatus(mat({ purchaseStatus: 'CANCELLED' }), { qty: 10, plan: 10, entriesCount: 1 }).purchaseStatus,
    undefined);
eq('wstrzymane wykonanie nie odwiesza się samo',
    suggestAxisStatus(mat({ execStatus: 'ON_HOLD' }), { qty: 4, plan: 10, entriesCount: 1 }).execStatus,
    undefined);
eq('zainstalowane nie wraca na „w toku"',
    suggestAxisStatus(mat({ execStatus: 'DONE' }), { qty: 4, plan: 10, entriesCount: 1 }).execStatus,
    undefined);

// ── Podpowiedź nie przeskakuje bramki ────────────────────────────────────────
// Wpis na pozycji, której klient jeszcze nie przyjął, jest sygnałem o złym statusie oferty,
// a nie powodem, żeby po cichu otworzyć realizację.
eq('pozycja nieprzyjęta nie dostaje żadnej podpowiedzi',
    suggestAxisStatus({ type: 'material' }, { qty: 10, plan: 10, entriesCount: 2 }), {});
eq('pozycja odrzucona nie dostaje żadnej podpowiedzi',
    suggestAxisStatus({ type: 'material', status: 'REJECTED' }, { qty: 10, plan: 10, entriesCount: 2 }), {});

// ── Osie, których liść nie ma ────────────────────────────────────────────────
eq('praca własna nie dostaje podpowiedzi zakupu',
    suggestAxisStatus({ type: 'work', status: 'CONFIRMED' }, { qty: 4, plan: 10, entriesCount: 1 }),
    { execStatus: 'IN_PROGRESS' });
eq('paliwo nie dostaje podpowiedzi wykonania',
    suggestAxisStatus({ type: 'fuel', status: 'CONFIRMED' }, { qty: 4, plan: 10, entriesCount: 1 }),
    { purchaseStatus: 'PARTIALLY_DELIVERED' });
// Usługa ma OBIE osie i celowo NIE ma bramki „czeka na dostawę": dla niej dostarczenie
// i wykonanie to ten sam akt, więc bramka zapętliłaby ją na starcie.
eq('usługa dostaje obie podpowiedzi naraz',
    suggestAxisStatus({ type: 'service', status: 'CONFIRMED' }, { qty: 4, plan: 10, entriesCount: 1 }),
    { purchaseStatus: 'PARTIALLY_DELIVERED', execStatus: 'IN_PROGRESS' });

// ── Pozycja rozliczona ręcznie ───────────────────────────────────────────────
eq('pozycja rozliczona nie dostaje podpowiedzi',
    suggestAxisStatus(mat({ realizationClosed: true }), { qty: 4, plan: 10, entriesCount: 1 }), {});

// ── 3. Bramki etapów: plan → zakup → montaż ──────────────────────────────────
const brama = (node, axis) => axisGateOf(node, axis)?.label ?? null;

eq('świeża pozycja: zakup czeka na akceptację oferty',
    brama({ type: 'material' }, 'purchase'), 'Czeka na akceptację');
eq('świeża pozycja: montaż też czeka na akceptację oferty',
    brama({ type: 'material' }, 'exec'), 'Czeka na akceptację');
eq('zaproponowana pozycja nadal czeka',
    brama({ type: 'material', status: 'PROPOSAL' }, 'purchase'), 'Czeka na akceptację');
eq('odrzucona pozycja ma własny komunikat',
    brama({ type: 'material', status: 'REJECTED' }, 'purchase'), 'Oferta odrzucona');

eq('po akceptacji zakup jest otwarty',
    brama({ type: 'material', status: 'CONFIRMED' }, 'purchase'), null);
eq('po akceptacji montaż czeka na dostawę',
    brama({ type: 'material', status: 'CONFIRMED' }, 'exec'), 'Czeka na dostawę');
eq('samo zamówienie nie otwiera jeszcze montażu',
    brama({ type: 'material', status: 'CONFIRMED', purchaseStatus: 'ORDERED' }, 'exec'), 'Czeka na dostawę');
eq('dostawa częściowa otwiera montaż',
    brama({ type: 'material', status: 'CONFIRMED', purchaseStatus: 'PARTIALLY_DELIVERED' }, 'exec'), null);
eq('anulowany zakup zamyka montaż z własnym komunikatem',
    brama({ type: 'material', status: 'CONFIRMED', purchaseStatus: 'CANCELLED' }, 'exec'), 'Zakup anulowany');

// Bramka „czeka na dostawę" dotyczy tylko tego, co się MONTUJE.
eq('praca nie czeka na dostawę (nie ma czego kupować)',
    brama({ type: 'work', status: 'CONFIRMED' }, 'exec'), null);
eq('usługa nie czeka na dostawę — dostarczenie i wykonanie to ten sam akt',
    brama({ type: 'service', status: 'CONFIRMED' }, 'exec'), null);
eq('paliwo nie ma osi wykonania, więc nie ma czego bramkować',
    brama({ type: 'fuel', status: 'CONFIRMED' }, 'exec'), null);
eq('praca nie ma osi zakupu, więc nie ma czego bramkować',
    brama({ type: 'work', status: 'NEW' }, 'purchase'), null);

// ── Etap, który już ruszył, NIE wraca za bramkę ─────────────────────────────
// Na produkcji siedzą pozycje „Nowe" z zapisanym `ORDERED` po migracji. Schowanie ich za
// plakietką ukryłoby dokładnie ten rozjazd, który trzeba naprawić.
eq('zapisany zakup na nieprzyjętej pozycji zostaje widoczny',
    brama({ type: 'material', status: 'NEW', purchaseStatus: 'ORDERED' }, 'purchase'), null);
eq('zapisany montaż na nieprzyjętej pozycji zostaje widoczny',
    brama({ type: 'material', status: 'NEW', execStatus: 'DONE' }, 'exec'), null);

// ── Oś za bramką nie wchodzi do sumy gałęzi ─────────────────────────────────
eq('oś za bramką nie wchodzi do sumy gałęzi',
    axisStatusCodeOf({ type: 'material' }, 'purchase'), null);
eq('oś otwarta wchodzi do sumy wartością startową',
    axisStatusCodeOf({ type: 'material', status: 'CONFIRMED' }, 'purchase'), 'TO_ORDER');

// ── 4. „Odebrane" z protokołu ────────────────────────────────────────────────
const domkniety = { odebrane: 5000, domkniete: true, protokoly: [{ numer: '3/2026' }] };
const czesciowy = { odebrane: 2000, domkniete: false, protokoly: [{ numer: '2/2026' }] };

eq('protokół domknął pozycję wykonaną → Odebrane',
    handedOverFromProtocol({ type: 'work', execStatus: 'DONE' }, domkniety), true);
eq('odbiór nie wyprzedza wykonania (execStatus = W toku)',
    handedOverFromProtocol({ type: 'work', execStatus: 'IN_PROGRESS' }, domkniety), false);
eq('odbiór nie wyprzedza wykonania (brak execStatus)',
    handedOverFromProtocol({ type: 'material' }, domkniety), false);
eq('protokół częściowy nie domyka pozycji',
    handedOverFromProtocol({ type: 'work', execStatus: 'DONE' }, czesciowy), false);
eq('brak protokołu → brak odbioru',
    handedOverFromProtocol({ type: 'work', execStatus: 'DONE' }, undefined), false);
eq('paliwo nie ma osi wykonania, więc nie ma czego odbierać',
    handedOverFromProtocol({ type: 'fuel', execStatus: 'DONE' }, domkniety), false);

// ── 5. Agregacja gałęzi na trzech osiach ─────────────────────────────────────
// Przedmiot projektu (depth 0)
//   └─ Kamery (gałąź grupująca)
//        ├─ kamera kopułkowa  equipment  zakup ORDERED   / wykonanie TO_DO
//        ├─ kamera tubowa     equipment  zakup ORDERED   / wykonanie TO_DO
//        └─ Montaż (gałąź grupująca)
//             ├─ robocizna    work       (bez osi zakupu) / wykonanie IN_PROGRESS
//             └─ dojazd       fuel       zakup DELIVERED  / (bez osi wykonania)
//   └─ Avigilon + licencje    equipment  zakup INVOICED   / wykonanie DONE   ← POZYCJA z dzieckiem
//        └─ licencja ACC7     equipment  zakup TO_ORDER   / wykonanie TO_DO  ← nie wchodzi wyżej
const flat = [
    { id: 'root',   parentId: null,     type: '',          status: 'CONFIRMED', name: 'Przedmiot projektu' },
    { id: 'kamery', parentId: 'root',   type: '',          status: 'CONFIRMED', name: 'Kamery' },
    { id: 'kop',    parentId: 'kamery', type: 'equipment', status: 'CONFIRMED', purchaseStatus: 'ORDERED', execStatus: 'TO_DO', name: 'kamera kopułkowa' },
    { id: 'tub',    parentId: 'kamery', type: 'equipment', status: 'CONFIRMED', purchaseStatus: 'ORDERED', execStatus: 'TO_DO', name: 'kamera tubowa' },
    { id: 'montaz', parentId: 'kamery', type: 'group',     status: 'CONFIRMED', name: 'Montaż' },
    { id: 'rob',    parentId: 'montaz', type: 'work',      status: 'CONFIRMED', execStatus: 'IN_PROGRESS', name: 'robocizna' },
    { id: 'doj',    parentId: 'montaz', type: 'fuel',      status: 'CONFIRMED', purchaseStatus: 'DELIVERED', name: 'dojazd' },
    { id: 'avi',    parentId: 'root',   type: 'equipment', status: 'CONFIRMED', purchaseStatus: 'INVOICED', execStatus: 'DONE', name: 'Avigilon + licencje' },
    { id: 'lic',    parentId: 'avi',    type: 'equipment', status: 'CONFIRMED', purchaseStatus: 'TO_ORDER', execStatus: 'TO_DO', name: 'licencja ACC7' },
];

const tree = (() => {
    const byId = new Map(flat.map(n => [n.id, { ...n, children: [] }]));
    const roots = [];
    for (const n of flat) {
        const node = byId.get(n.id);
        if (n.parentId) byId.get(n.parentId).children.push(node);
        else roots.push(node);
    }
    return { byId, root: roots[0] };
})();

const branch = (id, axis) => aggregateBranchStatus(tree.byId.get(id), id === 'root' ? 0 : 1, axis);

// Liść bez danej osi WYPADA z sumy zamiast wchodzić do niej jako wartość startowa.
eq('Montaż / zakup — liczy się tylko paliwo (praca zakupu nie ma)',
    [branch('montaz', 'purchase').code, branch('montaz', 'purchase').count], ['DELIVERED', 1]);
eq('Montaż / wykonanie — liczy się tylko praca (paliwo wykonania nie ma)',
    [branch('montaz', 'exec').code, branch('montaz', 'exec').count], ['IN_PROGRESS', 1]);

eq('Kamery / zakup — dwie kamery zamówione + dostarczone paliwo = mieszany',
    [branch('kamery', 'purchase').code, branch('kamery', 'purchase').count], ['MIXED', 3]);
eq('Kamery / wykonanie — dwie kamery „do montażu" + praca „w toku" = mieszany',
    [branch('kamery', 'exec').code, branch('kamery', 'exec').count], ['MIXED', 3]);
eq('Kamery / plan — wszystkie zaakceptowane',
    branch('kamery', 'plan').code, 'CONFIRMED');

// Etykiety osi wykonania na gałęzi są NEUTRALNE — pod gałęzią wisi materiał obok pracy.
eq('gałąź nazywa oś wykonania neutralnie, nie montażowo',
    summarizeStatusCodes(['DONE'], 'exec').label, EXEC_STATUS_META.DONE.label);

// Pozycja kosztowa z dziećmi liczy się JAK LIŚĆ — jej podpozycja nie wchodzi do gałęzi wyżej.
eq('korzeń / zakup — Avigilon wchodzi sam, licencja pod nim nie',
    branch('root', 'purchase').count, 4);
eq('korzeń / zakup — trzy różne kody (zamówione ×2, dostarczone, zafakturowane)',
    branch('root', 'purchase').breakdown.map(b => `${b.code}:${b.count}`).sort(),
    ['DELIVERED:1', 'INVOICED:1', 'ORDERED:2']);

// ── Wariant płaski musi zgadzać się z drzewiastym na KAŻDEJ osi ──────────────
for (const axis of ['plan', 'purchase', 'exec']) {
    const map = buildAggregatedStatusMap(flat, axis);
    eq(`mapa (${axis}) zawiera tylko gałęzie`, [...map.keys()].sort(), ['kamery', 'montaz', 'root']);
    for (const id of ['kamery', 'montaz', 'root']) {
        eq(`mapa (${axis}): ${id} = drzewo`,
            [map.get(id).code, map.get(id).count], [branch(id, axis).code, branch(id, axis).count]);
    }
}

// ── Kod liścia dla osi ───────────────────────────────────────────────────────
eq('liść bez zapisanej osi zakupu czyta wartość startową',
    axisStatusCodeOf({ type: 'material', status: 'CONFIRMED' }, 'purchase'), 'TO_ORDER');
eq('liść bez zapisanej osi wykonania czyta wartość startową',
    axisStatusCodeOf({ type: 'material', status: 'CONFIRMED', purchaseStatus: 'DELIVERED' }, 'exec'), 'TO_DO');
eq('praca nie ma osi zakupu', axisStatusCodeOf({ type: 'work', status: 'CONFIRMED' }, 'purchase'), null);
eq('nocleg nie ma osi wykonania', axisStatusCodeOf({ type: 'lodging', status: 'CONFIRMED' }, 'exec'), null);

console.log(failed === 0 ? '\nWszystkie testy przeszły.' : `\n${failed} test(ów) nie przeszło.`);
process.exit(failed === 0 ? 0 : 1);
