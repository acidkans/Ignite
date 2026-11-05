// Test reguł milestone'ów w Harmonogramie (M3): kto zależy od milestone'a, pierwszy dozwolony dzień,
// przesuwanie zależnych wariantem „zachowaj odstęp” i domyślne daty w `buildTasksFromTree`.
//
// Uruchomienie: node test/milestone-zaleznosci.test.mjs
import assert from 'node:assert/strict';
import {
    zaleznyOdMilestone, zalezniMilestone, pierwszyDozwolonyDzien, roznicaDniRoboczych, przesunORobocze,
    przesunZaleznych, buildTasksFromTree, splaszczDrzewo,
} from '../apps/frontend/src/components/shared/harmonogram/harmonogramCzas.js';

const d = (s) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
let ok = 0;
const t = (nazwa, fn) => { fn(); ok++; console.log('✓', nazwa); };

// Gałąź G: p1, A (ms), p2 (z dzieckiem p2a), B (ms), p3; obok gałąź H bez milestone'ów.
const flat = [
    { id: 'G', parentId: null, type: '', sortOrder: 0 },
    { id: 'p1', parentId: 'G', type: 'work', sortOrder: 0 },
    { id: 'A', parentId: 'G', type: 'milestone', sortOrder: 1 },
    { id: 'p2', parentId: 'G', type: 'work', sortOrder: 2 },
    { id: 'p2a', parentId: 'p2', type: 'service', sortOrder: 0 },
    { id: 'B', parentId: 'G', type: 'milestone', sortOrder: 3 },
    { id: 'p3', parentId: 'G', type: 'work', sortOrder: 4 },
    { id: 'H', parentId: null, type: '', sortOrder: 1 },
    { id: 'h1', parentId: 'H', type: 'work', sortOrder: 0 },
];

t('zaleznyOdMilestone: rodzeństwo za milestone\'em z poddrzewami, łańcuch A → B', () => {
    assert.deepEqual(zaleznyOdMilestone(flat), { p2: 'A', p2a: 'A', B: 'A', p3: 'B' });
});

t('zaleznyOdMilestone: kolejność wg sortOrder, nie wg tablicy', () => {
    const pom = [...flat].reverse();
    assert.deepEqual(zaleznyOdMilestone(pom), { p2: 'A', p2a: 'A', B: 'A', p3: 'B' });
});

t('zalezniMilestone: przechodnio', () => {
    const z = zaleznyOdMilestone(flat);
    assert.deepEqual(new Set(zalezniMilestone(z, 'A')), new Set(['p2', 'p2a', 'B', 'p3']));
    assert.deepEqual(zalezniMilestone(z, 'B'), ['p3']);
});

t('pierwszyDozwolonyDzien: dzień roboczy po końcu (pt → pn), w dni wolne kalendarzowo', () => {
    assert.equal(iso(pierwszyDozwolonyDzien(d('2026-12-04'))), '2026-12-07');       // pt → pn
    assert.equal(iso(pierwszyDozwolonyDzien(d('2026-12-04'), true)), '2026-12-05'); // praca w sobotę
    assert.equal(iso(pierwszyDozwolonyDzien(d('2026-12-23'))), '2026-12-24');       // śr → cz
    assert.equal(iso(pierwszyDozwolonyDzien(d('2026-12-24'))), '2026-12-28');       // święta 25–26.12 + weekend
});

t('roznicaDniRoboczych / przesunORobocze są odwrotne', () => {
    assert.equal(roznicaDniRoboczych(d('2026-12-04'), d('2026-12-07')), 1);   // pt → pn
    assert.equal(roznicaDniRoboczych(d('2026-12-07'), d('2026-12-04')), -1);
    assert.equal(roznicaDniRoboczych(d('2026-12-01'), d('2026-12-01')), 0);
    assert.equal(iso(przesunORobocze(d('2026-12-04'), 1)), '2026-12-07');
    assert.equal(iso(przesunORobocze(d('2026-12-07'), -1)), '2026-12-04');
    assert.equal(iso(przesunORobocze(d('2026-12-02'), 0)), '2026-12-02');
});

t('przesunZaleznych: zachowaj odstęp, nieruchomy zostaje, milestone trzyma okno', () => {
    const wezly = {
        p2: { type: 'work', planOd: d('2026-12-07'), planDo: d('2026-12-09') },   // pn–śr (3 dni rob.)
        B: { type: 'milestone', planOd: d('2026-12-10'), planDo: d('2026-12-11') }, // cz–pt (okno 2 dni)
        p3: { type: 'work', planOd: d('2026-12-14'), planDo: d('2026-12-14'), nieruchomy: true },
    };
    const r = przesunZaleznych(wezly, ['p2', 'B', 'p3'], 2);
    assert.equal(iso(r.p2.od), '2026-12-09');
    assert.equal(iso(r.p2.ost), '2026-12-11');      // nadal 3 dni robocze
    assert.equal(iso(r.B.od), '2026-12-14');        // cz +2 rob. = pn
    assert.equal(iso(r.B.ost), '2026-12-15');       // okno 2 dni kalendarzowe
    assert.equal(r.p3, undefined);                  // rozpoczęte roboty się nie ruszają
    const wstecz = przesunZaleznych(wezly, ['p2'], -1);
    assert.equal(iso(wstecz.p2.od), '2026-12-04');  // pn −1 rob. = pt
    assert.equal(iso(wstecz.p2.ost), '2026-12-08'); // pt, pn, wt
    assert.deepEqual(przesunZaleznych(wezly, ['p2'], 0), {});
});

t('buildTasksFromTree: domyślny start zależnego = dzień roboczy po końcu milestone\'a', () => {
    const drzewo = [{
        id: 'G', type: '', sortOrder: 0, children: [
            { id: 'p1', type: 'work', unit: 'dni', quantity: 2, sortOrder: 0 },
            { id: 'A', type: 'milestone', sortOrder: 1 },
            { id: 'p2', type: 'work', unit: 'dni', quantity: 2, sortOrder: 2 },
            { id: 'p3', type: 'work', unit: 'dni', quantity: 1, sortOrder: 3 },
        ],
    }];
    // A zapisany na 3–4.12.2026 (cz–pt; koniec wyłączny = 5.12)
    const overrides = { A: { start: d('2026-12-03').toISOString(), end: d('2026-12-05').toISOString() }, p3: { start: d('2026-12-01').toISOString(), end: d('2026-12-02').toISOString() } };
    const { tasks } = buildTasksFromTree(drzewo, d('2026-12-01'), '', overrides, {});
    const po = Object.fromEntries(tasks.map(x => [x.id, x]));
    assert.equal(po.A.type, 'milestone');
    assert.equal(iso(po.p1.start), '2026-12-01');   // przed milestone'em — wolny
    assert.equal(iso(po.p2.start), '2026-12-07');   // za milestone'em — pn po pt
    assert.equal(iso(po.p3.start), '2026-12-01');   // zapisane daty bez zmian (konflikt, nie korekta)
    assert.deepEqual(Object.keys(zaleznyOdMilestone(splaszczDrzewo(drzewo))).sort(), ['p2', 'p3']);
});

console.log(`\n${ok} testów OK`);
