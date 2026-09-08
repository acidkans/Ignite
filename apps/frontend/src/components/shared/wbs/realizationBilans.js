// Bilans STANU WYKONANIA zamówienia — podział pozycji na to, co zrobione, co w ruchu i co
// jeszcze czeka. Liczy go zakładka „Realizacja_new" (tabela pod analizą) i arkusz
// „Podsumowanie" w eksporcie Excel, więc definicje muszą być jedne: gdyby każdy widok miał
// własną kopię reguł, ten sam plik pokazywałby inny podział niż ekran, z którego powstał.
//
// Wejściem są WIERSZE w kształcie `{ node, card, realization }` — ten sam, którym posługują się
// obie zakładki realizacji i protokół odbioru.

import { hasExecAxis, axisGateOf, DEFAULT_EXEC_STATUS } from './wbsConstants';
import { planValueOf } from './realizationShared';

const z2 = (v) => Math.round(v * 100) / 100;

// @anchor realization-w-realizacji — pozycja, przy której praca TRWA. Liczona ze statusu
// wykonania przez wykluczenie: odpada wszystko, co się już skończyło (`DONE`, `HANDED_OVER`),
// zostało odwołane (`CANCELLED`), jeszcze nie ruszyło (`TO_DO` — także NULL, bo taki jest jego
// domyślny odczyt) albo stoi za bramką etapu („Czeka na akceptację", „Czeka na dostawę").
// W środku zostają trzy stany: w toku, wstrzymane, niedokończone.
// Nocleg i paliwo odpadają z definicji — nie mają osi wykonania, więc nie ma czego wykluczać
// ani zaliczać; siedzą wyłącznie w wierszu „Prace nierozpoczęte / materiały niezainstalowane".
export const W_REALIZACJI_POZA = ['DONE', 'HANDED_OVER', 'CANCELLED', 'TO_DO'];
export const wRealizacjiTest = (n) => hasExecAxis(n?.type)
    && !axisGateOf(n, 'exec')
    && !W_REALIZACJI_POZA.includes(n?.execStatus || DEFAULT_EXEC_STATUS);

// @anchor realization-zamkniete-cuts — przekroje „to już za nami" liczone WYŁĄCZNIE z osi
// wykonania. Oś zakupu i ręczne rozliczenie pozycji świadomie nie mają tu wiersza: bilans
// odpowiada na pytanie „ile roboty jest za nami", a dostawa na magazyn ani decyzja
// o rozliczeniu tego nie przesądzają.
// `DONE` i `HANDED_OVER` wykluczają się wzajemnie (to jedno pole), więc suma wierszy JEST
// sumą pozycji.
export const ZAMKNIECIE_CUTS = [
    {
        key: 'wykonane', label: 'Wykonane / zainstalowane', color: 'text-emerald-400',
        opis: 'Pozycje oznaczone jako zrobione — materiał i sprzęt jako „Zainstalowane", '
            + 'praca i usługa jako „Wykonane". Noclegów i paliwa tu nie ma: przy nich nie ma '
            + 'czego montować ani wykonywać.',
        test: (n) => hasExecAxis(n?.type) && n?.execStatus === 'DONE',
    },
    {
        key: 'odebrane', label: 'Odebrane', color: 'text-lime-400',
        opis: 'Pozycje, które klient już odebrał. Te same rodzaje co wyżej: materiał, sprzęt, '
            + 'praca i usługa.',
        test: (n) => hasExecAxis(n?.type) && n?.execStatus === 'HANDED_OVER',
    },
];

export const NIEROZPOCZETE_LABEL = 'Prace nierozpoczęte / materiały niezainstalowane';

// @anchor realization-bilans-wykonania — cały podział w jednym przebiegu po wierszach.
// Trzy części — domknięte, w realizacji, nierozpoczęte — dzielą zamówienie BEZ RESZTY, więc
// „nierozpoczęte" liczy się przez odejmowanie, a nie własnym testem: każdy nowy stan osi
// wpadnie tam sam, zamiast wypaść z bilansu i cicho rozjechać sumę z całością zamówienia.
export function liczBilansWykonania(rows) {
    const przekroje = ZAMKNIECIE_CUTS.map(() => ({ pozycji: 0, plan: 0, real: 0 }));
    const lacznie = { pozycji: 0, plan: 0, real: 0 };
    const wRealizacji = { pozycji: 0, plan: 0, real: 0 };
    const calosc = { pozycji: 0, plan: 0, real: 0 };

    for (const { node, card, realization } of rows || []) {
        const plan = planValueOf(node, card);
        const real = realization?.value || 0;
        calosc.pozycji++; calosc.plan += plan; calosc.real += real;

        let wJakimkolwiek = false;
        ZAMKNIECIE_CUTS.forEach((cut, i) => {
            if (!cut.test(node)) return;
            wJakimkolwiek = true;
            przekroje[i].pozycji++; przekroje[i].plan += plan; przekroje[i].real += real;
        });
        if (wJakimkolwiek) { lacznie.pozycji++; lacznie.plan += plan; lacznie.real += real; }
        if (wRealizacjiTest(node)) { wRealizacji.pozycji++; wRealizacji.plan += plan; wRealizacji.real += real; }
    }

    const zaokr = (x) => ({ pozycji: x.pozycji, plan: z2(x.plan), real: z2(x.real) });
    const nierozpoczete = {
        pozycji: calosc.pozycji - lacznie.pozycji - wRealizacji.pozycji,
        plan: z2(calosc.plan - lacznie.plan - wRealizacji.plan),
        real: z2(calosc.real - lacznie.real - wRealizacji.real),
    };

    return {
        przekroje: ZAMKNIECIE_CUTS.map((cut, i) => ({
            key: cut.key, label: cut.label, opis: cut.opis, color: cut.color, ...zaokr(przekroje[i]),
        })),
        lacznie: zaokr(lacznie),
        wRealizacji: zaokr(wRealizacji),
        nierozpoczete,
        calosc: zaokr(calosc),
    };
}
