// Statusy ETAPU PLANU po stronie serwera. Lustro `planStatusFromAny` z `wbsConstants.js` —
// tam pełne uzasadnienie, dlaczego plan ma cztery stany i dlaczego „Zamówione" czy
// „Na magazynie" na tej osi nie stoją.
//
// Backend potrzebuje tej samej normalizacji, bo od niej zależy ZAKRES BASELINE: pozycja
// odrzucona zostaje w wersji jako historia, ale wypada z sumy akceptacji i z porównania
// wycena↔zakup. Czytana inaczej niż na froncie wróciłaby do zakresu mimo decyzji klienta —
// na ekranie przekreślona, w kwocie obecna. Zgodności pilnuje `test/plan-status-lustro.test.mjs`.

// @anchor plan-status-codes-backend — cztery stany etapu planu; lustro `PLAN_STATUS_CODES`.
export const PLAN_STATUS_CODES = ['NEW', 'PROPOSAL', 'CONFIRMED', 'REJECTED'] as const;
export type PlanStatus = (typeof PLAN_STATUS_CODES)[number];

// @anchor material-status-labels-backend — lustro `MATERIAL_STATUS_LABELS` z `wbsConstants.js`.
// Etykiety, nie kody, bo import z arkusza zapisuje do `WbsNode.status` polską nazwę.
const MATERIAL_STATUS_LABELS: Record<string, string> = {
    NEW: 'Nowy',
    PENDING: 'Oczekuje',
    PROPOSAL: 'Propozycja',
    CONFIRMED: 'Potwierdzone',
    REJECTED: 'Odrzucone',
    ORDERED: 'Zamówione',
    EXTRA_ORDER: 'Dodatkowe zamówienie',
    IN_STOCK: 'Na magazynie',
    ISSUED: 'Wydane',
    DONE: 'Wykonane',
    INSTALLED: 'Zainstalowane',
};

// @anchor work-status-labels-backend — lustro `WORK_STATUS_LABELS` z `wbsConstants.js`.
const WORK_STATUS_LABELS: Record<string, string> = {
    NEW: 'Nowe',
    STARTED: 'Rozpoczęte',
    ON_HOLD: 'Wstrzymane',
    COMPLETED: 'Zakończone',
    UNFINISHED: 'Nieskończone',
    CANCELLED: 'Odwołane',
};

// Kolejność scalania jak na froncie: najpierw słownik materiałowy, potem robociznowy —
// przy kolizji etykiet wygrywa materiałowy.
const LABEL_TO_CODE: Record<string, string> = {};
for (const [code, label] of Object.entries(WORK_STATUS_LABELS)) LABEL_TO_CODE[label.toUpperCase()] = code;
for (const [code, label] of Object.entries(MATERIAL_STATUS_LABELS)) LABEL_TO_CODE[label.toUpperCase()] = code;

// @anchor normalize-status-code-backend — lustro `normalizeStatusCode`. UWAGA na dwie rzeczy,
// które wyglądają na przeoczenie, a są zgodnością z frontem:
//   - etykiety dopasowujemy BEZ wielkości liter, ale kod wraca DOKŁADNIE taki, jak w bazie
//     (`rejected` małymi literami nie jest kodem `REJECTED` — i front też tak go czyta),
//   - wartość nierozpoznana wraca surowa; to wołający decyduje, co z nią zrobić.
const normalizeStatusCode = (value: unknown): string => {
    if (value == null) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    return LABEL_TO_CODE[raw.toUpperCase()] ?? raw;
};

// @anchor plan-status-from-any-backend — kod PLANISTYCZNY dla pozycji, która w bazie ma
// cokolwiek innego. Reguły co do joty jak `planStatusFromAny` na froncie:
//   pusty / PENDING / NEW → NEW, PROPOSAL → PROPOSAL, REJECTED → REJECTED,
//   wszystko pozostałe → CONFIRMED (skoro pozycję zamówiono albo ekipa ją zaczęła,
//   klient przyjął ją wcześniej).
// Funkcja NICZEGO nie zapisuje — to wyłącznie odczyt.
export const planStatusFromAny = (status: unknown): PlanStatus => {
    const code = normalizeStatusCode(status);
    if (!code || code === 'PENDING' || code === 'NEW') return 'NEW';
    if (code === 'PROPOSAL' || code === 'REJECTED') return code;
    return 'CONFIRMED';
};

// @anchor is-rejected-plan — jedyne pytanie, które zadaje zakres baseline: czy klient tę
// pozycję odrzucił. Wydzielone z `planStatusFromAny`, żeby filtry zakresu w `orders.service`
// czytały się jak reguła, a nie jak porównanie stringów.
export const isRejectedPlan = (status: unknown) => planStatusFromAny(status) === 'REJECTED';

// @anchor rejected-node-ids — id pozycji odrzuconych RAZEM z ich poddrzewami. Lustro
// `stripRejectedNodes` z `wbsConstants.js`: odrzucenie „kamery z doczepioną licencją" wyklucza
// też licencję — to jedna decyzja klienta, a nie dwie. Wołający MUSI podać pełną listę węzłów
// wersji (także gałęzie grupujące), bo łańcuch przodków pozycji prowadzi przez gałęzie —
// lista bez nich urwałaby się na pierwszej i poddrzewo zostałoby w zakresie.
export const rejectedNodeIds = (
    nodes: { id: string; parentId?: string | null; status?: string | null }[],
): Set<string> => {
    const rejectedRoots = new Set(nodes.filter((n) => isRejectedPlan(n.status)).map((n) => n.id));
    if (!rejectedRoots.size) return rejectedRoots;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const out = new Set<string>();
    for (const n of nodes) {
        let cur: (typeof nodes)[number] | undefined = n;
        let guard = 0;
        while (cur && guard++ < 100) {
            if (rejectedRoots.has(cur.id)) { out.add(n.id); break; }
            cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
    }
    return out;
};
