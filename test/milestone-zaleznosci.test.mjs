// Test reguł milestone'ów w Harmonogramie (M3): kto zależy od milestone'a, pierwszy dozwolony dzień,
// przesuwanie zależnych wariantem „zachowaj odstęp” i domyślne daty w `buildTasksFromTree`.
//
// Uruchomienie: node test/milestone-zaleznosci.test.mjs
import assert from 'node:assert/strict';
import {
    zaleznyOdMilestone, zalezniMilestone, pierwszyDozwolonyDzien, roznicaDniRoboczych, przesunORobocze,
    przesunZaleznych, buildTasksFromTree, splaszczDrzewo, prognozyMilestonow, prognozaZaleznego,
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
    assert.equal(iso(pierwszyDozwolonyDzien(d('2026-12-23'))), '2026-12-28');       // śr → pn: Wigilia (wolna od 2025) + święta + weekend
    assert.equal(iso(pierwszyDozwolonyDzien(d('2024-12-23'))), '2024-12-24');       // pn → wt: przed 2025 Wigilia była dniem roboczym
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

t('prognozyMilestonow: blokery przesuwają milestone, poślizg idzie łańcuchem A → B', () => {
    // A 23.11 (pn), bloker +5 dni rob. → 30.11; B 25–26.11 zależy od A → najwcześniej 1.12, wypchnięty o 4 dni rob.
    const wezly = {
        A: { type: 'milestone', planOd: d('2026-11-23'), planDo: d('2026-11-23') },
        B: { type: 'milestone', planOd: d('2026-11-25'), planDo: d('2026-11-26') },
        C: { type: 'milestone', planOd: d('2026-12-20'), planDo: d('2026-12-21') },
        p: { type: 'work', planOd: d('2026-11-24'), planDo: d('2026-12-19') },
    };
    const zal = { B: 'A', p: 'A', C: 'B' };
    const pr = prognozyMilestonow(wezly, zal, { A: 5 });
    assert.equal(iso(pr.A), '2026-11-30');
    assert.equal(iso(pr.B), '2026-12-02');            // start 25.11 → 1.12 (+4 dni rob.), koniec 26.11 → 2.12
    assert.equal(pr.C, undefined);                    // C daleko za B — zapas pochłania poślizg
    assert.equal(pr.p, undefined);                    // pozycje robót nie mają prognozy milestone'a
    // własny bloker B większy niż wypchnięcie — wygrywa późniejsza data
    assert.equal(iso(prognozyMilestonow(wezly, zal, { A: 5, B: 10 }).B), '2026-12-10');
    // nieruchomy (rozpoczęty) nie jest wypychany
    assert.equal(prognozyMilestonow({ ...wezly, B: { ...wezly.B, nieruchomy: true } }, zal, { A: 5 }).B, undefined);
});

t("prognozaZaleznego: start po prognozie milestone'a, ta sama liczba dni pracy", () => {
    // pozycja 24.11–19.12 (19 dni rob.), milestone z prognozą 30.11 → najwcześniej 1.12
    const c = prognozaZaleznego(d('2026-11-24'), d('2026-12-19'), d('2026-12-01'));
    assert.equal(iso(c.od), '2026-12-01');
    assert.equal(iso(c.ost), '2026-12-29');           // 19 dni rob. od 1.12; 24–26.12 święta (Wigilia od 2025), 26–27 weekend
    // gałąź pracująca w soboty: 23 dni pracy (19 + 4 soboty), 26.12 to święto, nie sobota robocza
    assert.equal(iso(prognozaZaleznego(d('2026-11-24'), d('2026-12-19'), d('2026-12-01'), { sob: true }).ost), '2026-12-30');
});

console.log(`\n${ok} testów OK`);
