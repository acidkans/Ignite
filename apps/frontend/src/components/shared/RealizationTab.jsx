import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import {
    ChevronRight, ChevronDown, Plus, Trash2, AlertCircle, CornerDownLeft, ShoppingCart, X, FileSpreadsheet,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { API_URL } from '../../config';
import SupplierPicker from './SupplierPicker';
import { RequirementImageBox } from './wbs/WbsMaterialsPanel';
import AutoResizeTextarea from './wbs/AutoResizeTextarea';
import { sanitizeQtyInput, DRAWER } from './wbs/wbsConstants';
import {
    TYPE_META, LEAF_TYPES, OPEN_LEAF_TYPES, authHeaders, flattenWbsNodes, getParentPath,
    leafNodesOf, buildCardMap, wbsRootOf, purchaseUnitOf, REAL_STATE, realizationOf,
    planUnitOf, fmtQty, fmtZl, fmtDate,
} from './wbs/realizationShared';

// ─── Kolumny ──────────────────────────────────────────────────────────────────

// @anchor realization-col-defs — kolumny tabeli realizacji. Wpisy realizacji renderują się
// jako wiersze POTOMNE liścia w TEJ SAMEJ tabeli i mapują po tej samej liście kolumn, więc
// kolejność jest wspólna z definicji: data pod „Przedmiot projektu", komentarz pod „Nazwą",
// produkt pod „Produktem", dostawca pod „Dostawcą", ilość pod „Zakup / wykonanie", koszt
// jedn. pod „Koszt jedn. zakupu", wartość pod „Kosztem całkowitym". Kolumny planu
// (`qty`, `deltaQty`, `price`) zostają w wierszu wpisu puste — plan należy do pozycji, nie
// do pojedynczej dostawy.
export const COL_DEFS = [
    { key: 'parent',        label: 'Przedmiot projektu',  defaultW: 165 },
    { key: 'name',          label: 'Nazwa',               defaultW: 215 },
    // @anchor realization-product-col — dla materiału i sprzętu producent + model, dla reszty
    // (praca, usługa, nocleg, paliwo) jedno pole „zakres". Nagłówek niesie oba znaczenia, bo
    // kolumna jest jedna dla wszystkich typów liści.
    { key: 'product',       label: 'Produkt / zakres',    defaultW: 165 },
    { key: 'supplier',      label: 'Dostawca',            defaultW: 180 },
    { key: 'doc',           label: 'Dokument',            defaultW: 120 },
    { key: 'qty',           label: 'Ilość wyceny',        defaultW: 110, align: 'right' },
    { key: 'realization',   label: 'Zakup / wykonanie',   defaultW: 160, align: 'right' },
    { key: 'deltaQty',      label: 'Δ ilość',             defaultW: 100, align: 'right' },
    { key: 'price',         label: 'Koszt jedn. wyceny',  defaultW: 135, align: 'right' },
    { key: 'purchasePrice', label: 'Koszt jedn. zakupu',  defaultW: 135, align: 'right' },
    // @anchor realization-total-col — jedna kolumna zamiast trzech osobnych: koszt całkowity
    // pozycji po stronie wyceny i po stronie zakupu, z odchyleniem pod spodem. Stopka tabeli
    // sumuje ją dla wszystkich widocznych wierszy — to jest podsumowanie całego zamówienia.
    { key: 'total',         label: 'Koszt całkowity',     defaultW: 175, align: 'right' },
    // @anchor realization-comment-col — `WbsNode.comment`, to samo pole co kolumna „Komentarz"
    // w `WBSHybridTable` i w panelu Materiały. Synchronizacja obustronna przez `wbs-comment-changed`.
    { key: 'comment',       label: 'Komentarz',           defaultW: 200 },
    { key: 'actions',       label: 'Wpisy',               defaultW: 70,  align: 'right' },
];

// @anchor realization-forecast-min-share — próg wiarygodności prognozy wydatków: dopóki
// wykonanie rodzaju kosztów nie osiągnie tego udziału w jego wycenie, prognoza zostaje na
// 100% wyceny zamiast iść za odchyleniem. Przy paru wpisach odchylenie nie opisuje rynku,
// tylko przypadek — praca wyceniona na 67 311 zł z jednym wpisem na 100 zł dawała prognozę
// 3 365 zł i 64 tys. „oszczędności" wziętej z powietrza.
const PROG_MIN_UDZIAL = 0.1;

// @anchor realization-entry-noun — nazwa zdarzenia zależy od typu liścia: materiał i sprzęt
// się KUPUJE, pracę i usługę WYKONUJE — przycisk nie może mówić „nowy zakup" nad robocizną.
// Dopisywanie zdarzeń żyje wyłącznie tutaj; panel Materiały pokazuje już tylko zapisane wpisy.
// `entryNoun` to sam rzeczownik (prefiks linii w komentarzu pozycji: „zakup: …").
// Rodzaj gramatyczny się różni — zakup jest męski, wykonanie nijakie — więc każda forma
// z zaimkiem albo przymiotnikiem ma własny helper. Sklejanie `nowy ${entryNoun(...)}`
// dawało „nowy wykonanie" nad każdą pozycją typu praca i usługa.
const entryNoun = (type) => (type === 'work' || type === 'service' ? 'wykonanie' : 'zakup');
const newEntryLabel = (type) => (type === 'work' || type === 'service' ? 'Nowe wykonanie' : 'Nowy zakup');
// Przycisk zapisu mówi „Dodaj zakup" nad KAŻDYM typem liścia — decyzja użytkownika. Etykieta
// nad datą (`newEntryLabel`) nadal rozróżnia zakup od wykonania, więc kontekst wiersza się nie gubi.
const ADD_ENTRY_LABEL = 'Dodaj zakup';

const ENTRY_INPUT = 'w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white outline-none focus:border-teal-500/50 placeholder-gray-700';

// @anchor realization-enter-next-field — Enter przechodzi do KOLEJNEGO okna w wierszu zakupu,
// zamiast kończyć edycję. Wiersz wypełnia się od lewej do prawej jednym ciągiem, bez sięgania
// po mysz ani Tab (Tab wychodzi poza wiersz, na przyciski i nagłówki tabeli).
// Kolejność bierzemy z DOM-u, więc idzie dokładnie za kolejnością kolumn — nie ma osobnej
// listy do utrzymania przy dodawaniu kolumny. Pola pickera dostawcy są poza tą listą
// (nie mają `data-entry-field`), bo jego lista rozwija się własną obsługą klawiatury.
// Na ostatnim polu Enter oddaje sterowanie wołającemu: formularz zapisuje wpis, wiersz
// istniejącego wpisu robi blur, czyli commit pola.
function focusNextInRow(e, onLast) {
    const row = e.currentTarget.closest('tr');
    const fields = row ? [...row.querySelectorAll('[data-entry-field]:not([disabled])')] : [];
    const i = fields.indexOf(e.currentTarget);
    if (i >= 0 && i < fields.length - 1) {
        const next = fields[i + 1];
        next.focus();
        next.select?.();
        return;
    }
    onLast?.();
}

// @anchor realization-select-all-on-focus — wejście w pole zaznacza CAŁĄ jego treść, tak samo
// myszą jak Enterem z pola obok. Wpisy realizacji poprawia się przez nadpisanie („było 3, jest 5"),
// a nie dopisanie znaku w środku — bez tego klik stawiał kursor w miejscu trafienia i trzeba było
// najpierw ręcznie kasować starą wartość. `requestAnimationFrame`, bo klik myszą po `focus`
// ustawia własne zaznaczenie (kursor pod kursorem myszy) i skasowałby `select()` zrobiony od razu.
const selectAllOnFocus = (e) => {
    const el = e.currentTarget;
    requestAnimationFrame(() => el.select?.());
};

// ─── Wiersz pozycji ───────────────────────────────────────────────────────────

// Podkomponenty poniżej są eksportowane WYŁĄCZNIE dla `test/test-realization-render.mjs`.
// Renderują się dopiero po rozwinięciu pozycji albo po otwarciu formularza, więc SSR
// samej zakładki nigdy do nich nie dociera — a to właśnie w nich siedziały oba błędy,
// które dały w przeglądarce pusty ekran. Poza testem nic ich nie importuje; zakładka
// wychodzi z tego pliku domyślnym eksportem.

// @anchor realization-row — jeden liść WBS: plan z wyceny obok realizacji z wpisów.
// Wiersz jest tylko odczytem — wszystko, co się wpisuje, siedzi w wierszach potomnych,
// więc klik w tabelę nie może przypadkiem zmienić wyceny.
export function RealizationRow({ node, card, realization, isExpanded, onToggle, onAddClick, onSaveComment, readOnly }) {
    const meta = TYPE_META[node.type] || TYPE_META.material;
    const TypeIcon = meta.icon;
    const r = realization;
    const st = REAL_STATE[r.state] || REAL_STATE.none;

    // @anchor realization-row-comment — lokalny bufor komentarza. Zapis idzie na blur, a `node`
    // wraca z rodzica dopiero po zapisie albo po zdarzeniu `wbs-comment-changed` z innego widoku;
    // bez bufora znaki gubiłyby się w trakcie pisania. `commentFocus` blokuje nadpisanie pola
    // w trakcie edycji — inaczej komentarz zmieniony równolegle w WBS kasowałby to, co się właśnie pisze.
    const [commentVal, setCommentVal] = useState(node.comment || '');
    const commentFocus = useRef(false);
    useEffect(() => {
        if (!commentFocus.current) setCommentVal(node.comment || '');
    }, [node.comment]);
    // Wartość bierzemy z eventu, nie ze stanu — blur potrafi wypaść w tym samym tasku co ostatnia
    // zmiana (autouzupełnianie, skrypt), a wtedy `commentVal` z domknięcia jest jeszcze stary.
    const handleCommentBlur = (v) => {
        commentFocus.current = false;
        if (v === (node.comment || '')) return;
        onSaveComment(node.id, v);
    };

    const planUnit = planUnitOf(node, card);
    const planValue = planUnit != null ? planUnit * (Number(node.quantity) || 0) : null;
    const purchaseUnit = r.avg ?? purchaseUnitOf(card);
    const hasReal = r.qty > 0 || node.realizationClosed;
    const dValue = hasReal && planValue != null ? Math.round((r.value - planValue) * 100) / 100 : null;
    const dQty = Math.round((r.qty - r.plan) * 1000) / 1000;
    const dQtyBrak = Math.abs(dQty) < 1e-9 || (r.qty === 0 && !node.realizationClosed);

    // Pasek przy nadmiarze mieści się w 100%: plan zajmuje swój udział w sumie,
    // nadwyżka dostaje resztę na czerwono.
    const main = r.state === 'none' ? 0 : r.state === 'over' ? (r.plan / r.qty) * 100 : r.state === 'closed' ? 100 : Math.min(100, r.pct);
    const over = r.state === 'over' ? 100 - main : 0;

    // Dostawca i dokumenty pozycji pochodzą z WPISÓW — to dane realizacji, a nie wyceny.
    const suppliers = [...new Set(r.entries.map(e => e.supplier?.name).filter(Boolean))];
    const docs = [...new Set(r.entries.map(e => e.docNumber).filter(Boolean))];
    // Zakresy z wpisów — dla liści bez karty produktowej to jedyna treść kolumny „Produkt / zakres”.
    const scopes = [...new Set(r.entries.map(e => e.scope).filter(Boolean))];

    return (
        <tr className={`transition-colors ${isExpanded ? DRAWER.accent.real.row : 'border-b border-white/[0.03] hover:bg-white/[0.02]'}`}>
            {/* @anchor realization-add-button — rozwijanie i dopisywanie po LEWEJ, przy
                pozycji: sam „+" wystarczy, bo etykieta i tak powtarzałaby się w każdym wierszu.
                Tooltip niesie, czy to zakup czy wykonanie. */}
            {/* Kręgosłup rozwiniętej pozycji biegnie przez wiersz i szufladę pod nim — tak samo
                jak w panelu Materiały, tyle że w turkusie strony realizacji. */}
            <td className={`px-1.5 py-2.5 whitespace-nowrap ${isExpanded ? `${DRAWER.spine} ${DRAWER.accent.real.spine}` : ''}`}>
                <button onClick={onToggle} title="Rozwiń wpisy i szczegóły pozycji"
                    className={`transition-colors align-middle ${isExpanded ? 'text-teal-300 hover:text-teal-200' : 'text-gray-600 hover:text-gray-300'}`}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {!readOnly && (
                    <button onClick={onAddClick} title={`${newEntryLabel(node.type)} — dopisz zdarzenie do tej pozycji`}
                        className="ml-1 p-0.5 rounded bg-teal-500/10 hover:bg-teal-500/25 text-teal-300 border border-teal-500/25 transition-colors align-middle">
                        <Plus size={13} />
                    </button>
                )}
            </td>

            {/* Przedmiot projektu */}
            <td className="px-3 py-2.5">
                <span className="text-sm text-white break-words" title={node.path}>{getParentPath(node.path)}</span>
            </td>

            {/* Nazwa + typ pozycji */}
            <td className="px-3 py-2.5">
                <div className="text-sm text-white break-words">{node.name}</div>
                <span className={`inline-flex items-center gap-1 text-[11px] mt-0.5 ${meta.color}`}>
                    <TypeIcon size={10} /> {meta.label}
                </span>
            </td>

            {/* Produkt z wyceny, a dla liści bez karty — zakres zebrany z wpisów */}
            <td className="px-3 py-2.5">
                {card?.manufacturer || card?.model ? (
                    <div>
                        {card.manufacturer && <div className="text-sm text-white break-words">{card.manufacturer}</div>}
                        {card.model && <div className="text-xs text-gray-400 break-words">{card.model}</div>}
                    </div>
                ) : scopes.length ? (
                    <span className="text-sm text-gray-300 break-words" title={scopes.join(', ')}>
                        {scopes.length === 1 ? scopes[0] : `${scopes[0]} +${scopes.length - 1}`}
                    </span>
                ) : <span className="text-sm text-gray-600">—</span>}
            </td>

            {/* Dostawca — z wpisów realizacji */}
            <td className="px-3 py-2.5">
                <span className="text-sm text-gray-300 break-words" title={suppliers.join(', ')}>
                    {suppliers.length === 0 ? '—' : suppliers.length === 1 ? suppliers[0] : `${suppliers[0]} +${suppliers.length - 1}`}
                </span>
            </td>

            {/* Dokument — z wpisów realizacji */}
            <td className="px-3 py-2.5">
                <span className="text-xs text-gray-400 font-mono break-words" title={docs.join(', ')}>
                    {docs.length === 0 ? '—' : docs.length === 1 ? docs[0] : `${docs[0]} +${docs.length - 1}`}
                </span>
            </td>

            {/* Ilość wyceny */}
            <td className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap text-gray-200">
                {fmtQty(node.quantity ?? 0)} <span className="text-xs text-gray-500">{node.unit || 'szt'}</span>
            </td>

            {/* Zakup / wykonanie — licznik Σ wpisów wobec planu; klik rozwija wpisy */}
            <td className="px-3 py-2.5 text-right">
                <div onClick={onToggle} title="Kliknij, aby rozwinąć wpisy realizacji" className="flex flex-col items-stretch gap-1 cursor-pointer">
                    <div className="flex items-baseline justify-end gap-1.5 font-mono text-sm whitespace-nowrap">
                        <span className={st.text}>{fmtQty(r.qty)}</span>
                        <span className="text-gray-500">/ {fmtQty(r.plan)} {node.unit || 'szt'}</span>
                        <span className="text-[10px] text-gray-500 w-9 text-right">{r.pct}%</span>
                    </div>
                    <div className="h-[3px] rounded-sm bg-white/10 overflow-hidden flex">
                        <span className={`h-full ${st.bar}`} style={{ width: `${main}%`, flex: 'none' }} />
                        {over > 0 && <span className="h-full bg-red-400" style={{ width: `${over}%`, flex: 'none' }} />}
                    </div>
                    {node.realizationClosed && (
                        <span className="self-end text-[9px] font-bold uppercase tracking-widest text-teal-300/80">rozliczone</span>
                    )}
                </div>
            </td>

            {/* Δ ilość */}
            <td className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">
                <span className={dQty > 1e-9 ? 'text-red-300' : dQty < -1e-9 ? 'text-teal-300' : 'text-gray-600'}>
                    {dQtyBrak ? '—' : `${dQty > 0 ? '+' : ''}${fmtQty(dQty)} ${node.unit || 'szt'}`}
                </span>
            </td>

            {/* Koszt jedn. wyceny — praca i usługa nie mają karty, plan siedzi wtedy na liściu */}
            <td className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">
                <span className="text-orange-400" title={card ? undefined : 'Koszt jedn. z wyceny pozycji (WbsNode.unitCost) — edycja w Budżecie'}>
                    {planUnit != null ? `${fmtZl(planUnit)} zł` : '—'}
                </span>
            </td>

            {/* Koszt jedn. zakupu — średnia ważona wpisów (każdy ma własną cenę) */}
            <td className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">
                <span className="text-red-400" title={r.avg != null && r.mixedPrices ? 'Średnia ważona z wpisów realizacji' : undefined}>
                    {purchaseUnit != null ? `${fmtZl(purchaseUnit)} zł` : '—'}
                    {r.avg != null && r.mixedPrices && <span className="text-[10px] text-gray-500 ml-1">śr.</span>}
                </span>
            </td>

            {/* Koszt całkowity — wycena, zakup i odchylenie w jednej kolumnie */}
            <td className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">
                {/* Cała kolumna kosztów całkowitych jest czerwona: jaśniejszy odcień to wycena,
                    mocniejszy — faktyczny zakup. Δ zostaje przy kolorze wg znaku, bo niesie inną
                    informację (oszczędność vs przekroczenie), a nie kwotę. */}
                <div className="text-red-300" title="Koszt całkowity z wyceny (ilość × koszt jedn.)">
                    {planValue != null ? `${fmtZl(planValue)} zł` : '—'}
                </div>
                {/* Czerwień = strona zakupu, ta sama co w kolumnie „Koszt jedn. zakupu" —
                    wycena zostaje szara, żeby dwie liczby w jednej komórce dało się rozróżnić kolorem. */}
                <div className={hasReal ? 'text-red-400' : 'text-gray-600'} title="Koszt całkowity zakupu — suma wpisów realizacji">
                    {hasReal ? `${fmtZl(r.value)} zł` : '—'}
                </div>
                {dValue != null && (
                    <div className={`text-[11px] ${dValue > 0.005 ? 'text-red-300' : dValue < -0.005 ? 'text-teal-300' : 'text-gray-500'}`}>
                        Δ {dValue > 0 ? '+' : ''}{fmtZl(dValue)}
                    </div>
                )}
            </td>

            {/* Komentarz pozycji — `WbsNode.comment`, wspólny z WBSHybridTable i panelem Materiały */}
            <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                <AutoResizeTextarea
                    value={commentVal}
                    onChange={e => setCommentVal(e.target.value)}
                    onFocusCapture={() => { commentFocus.current = true; }}
                    onBlur={e => handleCommentBlur(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setCommentVal(node.comment || ''); e.currentTarget.blur(); } }}
                    readOnly={readOnly}
                    placeholder="—"
                    className={`bg-transparent border-none focus:outline-none text-sm w-full placeholder-gray-700 leading-snug text-gray-200 ${readOnly ? 'cursor-default' : ''}`}
                />
            </td>

            {/* Liczba wpisów */}
            <td className="px-3 py-2.5 text-right">
                <span className="text-xs text-gray-500 font-mono" title={`${r.entries.length} wpisów realizacji`}>
                    {r.entries.length || '—'}
                </span>
            </td>
        </tr>
    );
}

// ─── Wpisy realizacji — wiersze potomne w tej samej tabeli ────────────────────

// @anchor realization-entry-line — jeden wpis realizacji jako wiersz potomny pozycji,
// mapowany po TEJ SAMEJ liście kolumn co wiersz nadrzędny, więc kolejność zawsze się zgadza.
// Edytowalny w miejscu: zapis idzie na blur i tylko dla pola, które faktycznie się zmieniło.
// Producent i model siedzą NA WPISIE, nie na pozycji: druga dostawa bywa zamiennikiem.
// Dostawcę wybiera `SupplierPicker` — ten sam co w panelu Materiały, więc niesie komplet
// ścieżek: wybór z rejestru, dodanie po NIP z Białej listy VAT i wolny wpis bez NIP.
// @anchor realization-entry-scope — liście bez karty produktowej (praca, usługa, nocleg, paliwo)
// dostają w kolumnie „Produkt / zakres" JEDNO pole `LeafActual.scope` zamiast pary producent + model.
// Przy robociźnie nie ma czego rozbijać na markę i typ — liczy się, co zostało zrobione. To samo
// `hasCard` decyduje o polu nr dokumentu, bo faktura za towar towarzyszy tym samym typom liści.
export function RealizationEntryLine({ entry, cols, hasCard, readOnly, onSave, onDelete }) {
    const author = [entry.author?.firstName, entry.author?.lastName].filter(Boolean).join(' ') || entry.author?.email || '';
    const [draft, setDraft] = useState({});

    const orig = (k) => (k === 'entryDate' ? fmtDate(entry.entryDate) : (entry[k] ?? ''));
    const get = (k) => (draft[k] !== undefined ? draft[k] : String(orig(k)));
    const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
    const drop = (k) => setDraft(d => { const n = { ...d }; delete n[k]; return n; });
    const commit = (k) => {
        const next = get(k);
        if (String(orig(k)) === String(next)) { drop(k); return; }
        onSave(entry.id, { [k]: next });
        drop(k);
    };
    const onKey = (e, k) => {
        // Enter → następne okno wiersza. Zmiana i tak zapisuje się na blur, więc przejście
        // dalej commituje pole, które się właśnie opuszcza.
        if (e.key === 'Enter') { e.preventDefault(); focusNextInRow(e, () => e.currentTarget.blur()); }
        if (e.key === 'Escape') { drop(k); e.currentTarget.blur(); }
    };
    const field = (k, extra = '', props = {}) => (
        <input value={get(k)} disabled={readOnly} data-entry-field
            onChange={e => set(k, props.sanitize ? sanitizeQtyInput(e.target.value) : e.target.value)}
            onFocus={selectAllOnFocus}
            onBlur={() => commit(k)} onKeyDown={e => onKey(e, k)}
            placeholder={props.placeholder} aria-label={props.label}
            className={`${ENTRY_INPUT} ${extra} disabled:opacity-60`} />
    );

    const wartosc = (Number(get('qty')) || 0) * (Number(String(get('unitCost')).replace(',', '.')) || 0);

    return (
        <tr className="group/entry bg-black/25 hover:bg-black/[0.15] border-b border-white/[0.03]">
            {/* Wąska kolumna niesie znacznik „to jest wpis, nie pozycja" */}
            <td className="px-1.5 py-1.5 text-center border-l-2 border-teal-500/25 text-gray-700 font-mono text-sm">·</td>
            {cols.map(c => {
                if (c.key === 'parent') return <td key={c.key} className="px-2 py-1.5">{field('entryDate', 'font-mono', { label: 'Data zdarzenia' })}</td>;
                // Komentarz wpisu stoi pod kolumną „Komentarz" tabeli głównej, nie pod „Nazwą" —
                // to ta sama treść co dopisywana do komentarza pozycji, więc musi być w tej samej pionowej linii.
                if (c.key === 'comment') return (
                    <td key={c.key} className="px-2 py-1.5">
                        {field('comment', '', { placeholder: 'komentarz — co zrobione', label: 'Komentarz wpisu' })}
                        {author && <div className="text-[10px] text-gray-600 mt-0.5 truncate" title={author}>· {author}</div>}
                    </td>
                );
                if (c.key === 'product') return (
                    <td key={c.key} className="px-2 py-1.5 space-y-1">
                        {hasCard ? <>
                            {field('manufacturer', '', { placeholder: 'producent', label: 'Producent' })}
                            {field('model', '', { placeholder: 'model', label: 'Model' })}
                        </> : field('scope', '', { placeholder: 'zakres — co obejmuje', label: 'Zakres' })}
                    </td>
                );
                if (c.key === 'supplier') return (
                    <td key={c.key} className="px-2 py-1.5">
                        {readOnly
                            ? <span className="text-sm text-gray-400">{entry.supplier?.name || '—'}</span>
                            : <SupplierPicker dark value={entry.supplier?.id ?? null} onChange={s => onSave(entry.id, { supplierId: s?.id ?? null })} />}
                    </td>
                );
                if (c.key === 'doc') return <td key={c.key} className="px-2 py-1.5">{hasCard ? field('docNumber', 'font-mono', { placeholder: 'FV / PZ', label: 'Numer dokumentu' }) : null}</td>;
                if (c.key === 'realization') return <td key={c.key} className="px-2 py-1.5">{field('qty', 'font-mono text-right', { label: 'Ilość wpisu', sanitize: true })}</td>;
                if (c.key === 'purchasePrice') return <td key={c.key} className="px-2 py-1.5">{field('unitCost', 'font-mono text-right', { label: 'Koszt jednostkowy', sanitize: true })}</td>;
                if (c.key === 'total') return (
                    <td key={c.key} className="px-3 py-1.5 text-right font-mono text-sm text-red-400 whitespace-nowrap">
                        {fmtZl(wartosc)} zł
                    </td>
                );
                if (c.key === 'actions') return (
                    <td key={c.key} className="px-3 py-1.5 text-right">
                        {!readOnly && (
                            <button onClick={() => onDelete(entry.id)} title="Usuń wpis realizacji"
                                className="opacity-0 group-hover/entry:opacity-100 text-gray-600 hover:text-red-400 transition-all">
                                <Trash2 size={13} />
                            </button>
                        )}
                    </td>
                );
                // Kolumny planu (ilość wyceny, Δ ilość, koszt jedn. wyceny) należą do pozycji,
                // nie do pojedynczej dostawy — w wierszu wpisu zostają puste.
                return <td key={c.key} className="px-2 py-1.5" />;
            })}
        </tr>
    );
}

// @anchor realization-entry-form — formularz nowego wpisu, otwierany przyciskiem „+" po lewej
// stronie pozycji (a nie stale widoczny wiersz): tabela ma się czytać jako zestawienie,
// a dopisywanie jest świadomą czynnością. Enter w dowolnym polu zapisuje i zostawia
// formularz otwarty z kursorem w komentarzu, żeby kolejna dostawa szła bez sięgania po mysz.
// Domyślki: data dziś, ilość = brakująca do planu, producent i model wyłącznie z potwierdzonej
// odpowiedzi „ten sam produkt co w wycenie" (`seedProduct`).
// @anchor realization-entry-form-no-price — KOSZT JEDN. ZOSTAJE PUSTY, świadomie. Podpowiadanie
// ceny z wyceny albo z poprzedniej dostawy sprawiało, że wpis zapisywał się kwotą, której nikt
// nie przeczytał — a to są dane rozliczeniowe. Cenę trzeba wpisać ręcznie za każdym razem.
export function RealizationEntryForm({ node, cols, hasCard, defaultQty, seedProduct, onAdd, onClose }) {
    const today = new Date().toISOString().slice(0, 10);
    const blank = () => ({
        entryDate: today,
        qty: defaultQty != null ? String(defaultQty) : '1',
        unitCost: '',
        comment: '', docNumber: '', supplierId: seedProduct?.supplierId ?? null,
        manufacturer: seedProduct?.manufacturer || '', model: seedProduct?.model || '',
        // Zakres nie ma skąd się podpowiedzieć — liście bez karty nie mają produktu w wycenie.
        scope: '',
    });
    const [draft, setDraft] = useState(blank);
    const [saving, setSaving] = useState(false);
    // Kursor startuje w PIERWSZYM oknie wiersza, nie w komentarzu: Enter idzie teraz w prawo,
    // więc wejście od lewej pozwala wypełnić cały wiersz jednym ciągiem i zapisać na końcu.
    const firstFieldRef = useRef(null);

    useEffect(() => { firstFieldRef.current?.focus(); firstFieldRef.current?.select?.(); }, []);

    const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

    const submit = async () => {
        if (saving) return;
        const qty = parseFloat(String(draft.qty).replace(',', '.'));
        if (!Number.isFinite(qty) || qty <= 0) return;
        setSaving(true);
        const ok = await onAdd(draft);
        setSaving(false);
        if (ok) { setDraft(blank()); firstFieldRef.current?.focus(); firstFieldRef.current?.select?.(); }
    };
    const onKey = e => {
        // Enter idzie do kolejnego okna; dopiero na ostatnim zapisuje wpis. Dzięki temu
        // cały wiersz wypełnia się jednym ciągiem klawiatury, a zapis jest ostatnim krokiem,
        // nie skutkiem ubocznym Entera w pierwszym lepszym polu.
        if (e.key === 'Enter') { e.preventDefault(); focusNextInRow(e, submit); }
        if (e.key === 'Escape') onClose();
    };

    const field = (k, extra = '', props = {}) => (
        <input value={draft[k]} ref={props.ref} data-entry-field
            onChange={e => set(k, props.sanitize ? sanitizeQtyInput(e.target.value) : e.target.value)}
            onFocus={selectAllOnFocus}
            onKeyDown={onKey} placeholder={props.placeholder} aria-label={props.label}
            className={`${ENTRY_INPUT} ${extra}`} />
    );

    const wartosc = (Number(String(draft.qty).replace(',', '.')) || 0) * (Number(String(draft.unitCost).replace(',', '.')) || 0);

    return (
        // Formularz musi się odróżniać od zapisanych wpisów na pierwszy rzut oka —
        // stąd zielona krawędź, plus w kolumnie rozwijania i etykieta nad datą.
        <tr className="bg-teal-500/[0.06] border-b border-teal-500/20">
            <td className="px-1.5 py-2 text-center border-l-2 border-teal-500/60">
                <Plus size={14} className="inline text-teal-400" />
            </td>
            {cols.map(c => {
                if (c.key === 'parent') return (
                    <td key={c.key} className="px-2 py-2">
                        <span className="block text-[9px] font-bold uppercase tracking-widest text-teal-300/70 mb-1">{newEntryLabel(node.type)}</span>
                        {field('entryDate', 'font-mono', { label: 'Data zdarzenia', ref: firstFieldRef })}
                    </td>
                );
                if (c.key === 'comment') return <td key={c.key} className="px-2 py-2 align-bottom">{field('comment', '', { placeholder: 'komentarz — co zrobione', label: 'Komentarz' })}</td>;
                if (c.key === 'product') return (
                    <td key={c.key} className="px-2 py-2 space-y-1 align-bottom">
                        {hasCard ? <>
                            {field('manufacturer', '', { placeholder: 'producent', label: 'Producent' })}
                            {field('model', '', { placeholder: 'model', label: 'Model' })}
                        </> : field('scope', '', { placeholder: 'zakres — co obejmuje', label: 'Zakres' })}
                    </td>
                );
                if (c.key === 'supplier') return (
                    <td key={c.key} className="px-2 py-2 align-bottom">
                        <SupplierPicker dark value={draft.supplierId} onChange={s => setDraft(d => ({ ...d, supplierId: s?.id ?? null }))} />
                    </td>
                );
                if (c.key === 'doc') return <td key={c.key} className="px-2 py-2 align-bottom">{hasCard ? field('docNumber', 'font-mono', { placeholder: 'FV / PZ', label: 'Numer dokumentu' }) : null}</td>;
                if (c.key === 'realization') return <td key={c.key} className="px-2 py-2 align-bottom">{field('qty', 'font-mono text-right', { label: 'Ilość', sanitize: true })}</td>;
                if (c.key === 'purchasePrice') return <td key={c.key} className="px-2 py-2 align-bottom">{field('unitCost', 'font-mono text-right', { label: 'Koszt jednostkowy', sanitize: true })}</td>;
                if (c.key === 'total') return (
                    <td key={c.key} className="px-3 py-2 text-right align-bottom">
                        <div className="font-mono text-sm text-gray-400 mb-1">{fmtZl(wartosc)} zł</div>
                        {/* Przycisk nazywa czynność, nie sposób jej wywołania („dopisz"). */}
                        <button onClick={submit} disabled={saving} title="Zapisz wpis (Enter)"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-teal-500/30 bg-teal-500/10 text-teal-300 text-xs font-bold uppercase whitespace-nowrap hover:bg-teal-500/20 disabled:opacity-40">
                            <CornerDownLeft size={12} /> {ADD_ENTRY_LABEL}
                        </button>
                    </td>
                );
                if (c.key === 'actions') return (
                    <td key={c.key} className="px-3 py-2 text-right align-bottom">
                        <button onClick={onClose} title="Zamknij formularz (Esc)" className="text-gray-600 hover:text-gray-300 transition-colors">
                            <X size={13} />
                        </button>
                    </td>
                );
                return <td key={c.key} className="px-2 py-2" />;
            })}
        </tr>
    );
}

// ─── Rozwinięcie pozycji ──────────────────────────────────────────────────────

// @anchor realization-expand-panel — nagłówek rozwinięcia liścia: wymagania techniczne
// i podgląd produktu (te same, co w karcie z panelu Materiały — zostawione świadomie, bo
// przy dopisywaniu zakupu trzeba wiedzieć, co miało być kupione) oraz przycisk „Rozlicz".
// Karty produktowej (`ProductCard`) tu nie ma — realizacja nie zmienia wyceny.
// Same wpisy renderują się PONIŻEJ, jako wiersze tabeli głównej, żeby trzymać kolejność kolumn.
export function RealizationExpandPanel({ node, card, realization, token, readOnly, onToggleClosed, onSaveTechSpec, onRefreshCard }) {
    const hasCard = TYPE_META[node.type]?.hasCard !== false;
    const [techSpec, setTechSpec] = useState(card?.technicalSpec || '');
    // @anchor realization-techspec-pending — wartość wysłana PATCH-em i jeszcze niepotwierdzona.
    // Bez tego stary odczyt (GET wyprzedzający własny PATCH) cofał treść wymagań technicznych.
    const techPendingRef = useRef(undefined);
    const techLastCardId = useRef(card?.id ?? null);
    useEffect(() => {
        const incoming = card?.technicalSpec || '';
        if ((card?.id ?? null) !== techLastCardId.current) {
            techLastCardId.current = card?.id ?? null;
            techPendingRef.current = undefined;
            setTechSpec(incoming);
            return;
        }
        if (techPendingRef.current === undefined) { setTechSpec(incoming); return; }
        if (incoming === techPendingRef.current) { techPendingRef.current = undefined; setTechSpec(incoming); }
    }, [card?.id, card?.technicalSpec]);

    // Auto-wysokość — pokazuje całą treść wymagań bez zwijania i scrolla.
    const techRef = useRef(null);
    useLayoutEffect(() => {
        const el = techRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [techSpec]);

    const saveTech = async () => {
        if (!card?.id || techSpec === (card.technicalSpec || '')) return;
        techPendingRef.current = techSpec;
        const ok = await onSaveTechSpec(card.id, techSpec);
        if (!ok) techPendingRef.current = undefined;
    };

    const remaining = Math.round((realization.plan - realization.qty) * 1000) / 1000;

    return (
        // Ta sama szuflada co w panelu Materiały (`DRAWER`) — płaszczyzna karty, kręgosłup przy
        // lewej krawędzi, nagłówek 10 px z nazwą pozycji. Akcent turkusowy, nie niebieski:
        // niebieski trzymamy dla strony wyceny, turkus dla zakupu i realizacji.
        <div className={`${DRAWER.surface} ${DRAWER.spine} ${DRAWER.accent.real.spine}`}>
            <div className={DRAWER.head}>
                <span className={`${DRAWER.label} ${DRAWER.accent.real.label}`}>realizacja pozycji</span>
                <span className={DRAWER.name}>{node.name}</span>
            </div>
            {hasCard && card && (
                <div className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Wymagania techniczne</label>
                        <textarea
                            ref={techRef}
                            value={techSpec}
                            onChange={e => setTechSpec(e.target.value)}
                            onBlur={saveTech}
                            readOnly={readOnly}
                            rows={1}
                            placeholder="Wymagania techniczne — co ta pozycja ma spełniać"
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50 resize-none overflow-hidden"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Podgląd produktu</label>
                        <RequirementImageBox card={card} token={token} onRefresh={onRefreshCard} />
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3 px-4 py-2 border-t border-white/5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400/80">
                    Wpisy realizacji ({realization.entries.length})
                </span>
                <span className="text-[11px] text-gray-500 font-mono">
                    Σ {fmtZl(realization.value)} zł
                    {remaining > 1e-9 && !node.realizationClosed && (
                        <span className="text-amber-400/80 ml-2">· brakuje {fmtQty(remaining)} {node.unit || 'szt'}</span>
                    )}
                </span>
                <div className="flex-1" />
                {!readOnly && (
                    <button
                        onClick={onToggleClosed}
                        title={node.realizationClosed ? 'Pozycja rozliczona — kliknij, aby wznowić' : 'Rozlicz pozycję mimo niedowykonania planu'}
                        className={`px-2.5 py-1 rounded border text-[11px] font-bold uppercase tracking-wider transition-colors ${
                            node.realizationClosed
                                ? 'border-teal-500/30 bg-teal-500/10 text-teal-300'
                                : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                        }`}>
                        {node.realizationClosed ? 'Rozliczone' : 'Rozlicz'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Zakładka ─────────────────────────────────────────────────────────────────

// @anchor realization-tab — zakładka „Realizacja": płaska tabela WSZYSTKICH liści kosztowych
// zamówienia z porównaniem zakupu do wyceny. W odróżnieniu od panelu Materiały nie zakłada
// ani nie edytuje kart produktowych — służy wyłącznie rozliczaniu tego, co się wydarzyło.
export default function RealizationTab({
    nodeId,
    versionId,
    searchQuery = '',
    userRoles = [],
    orderName = '',
    accepted = false,
    refreshKey = 0,
}) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');

    const isManagerOrAdmin = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
    const canEdit = userRoles.some(r => ['ADMIN', 'MANAGER', 'LOGISTYK'].includes(r));
    const readOnly = !canEdit;

    // @anchor realization-visible-types — praca, usługa, nocleg i paliwo to koszty własne
    // firmy; poza managerem nikt ich tu nie ogląda. Filtr działa na etapie budowania listy
    // liści, więc pozycje nie wchodzą też do sum w stopce ani do wyszukiwarki.
    const visibleTypes = isManagerOrAdmin ? LEAF_TYPES : OPEN_LEAF_TYPES;

    const [wbsNodes, setWbsNodes] = useState([]);
    const [cards, setCards] = useState({});
    const [actuals, setActuals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [formNodeId, setFormNodeId] = useState(null);
    // @anchor realization-form-seed — dane produktu, którymi wypełnia się świeży formularz wpisu.
    // `null` = pusty formularz. Ustawia je wyłącznie potwierdzona odpowiedź na pytanie „ten sam
    // produkt co w wycenie?", więc producent i model nigdy nie wjeżdżają do wpisu bez decyzji.
    const [formSeed, setFormSeed] = useState(null);

    const [exporting, setExporting] = useState(false);

    const [sortConfig, setSortConfig] = useState({ key: 'parent', direction: 'asc' });
    const [colFilters, setColFilters] = useState({});
    const [colWidths, setColWidths] = useState(() => Object.fromEntries(COL_DEFS.map(c => [c.key, c.defaultW])));
    const resizeDrag = useRef(null);

    // ─ Pobieranie danych ─────────────────────────────────────────────────────

    const fetchAll = useCallback(async () => {
        if (!nodeId) return;
        setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const q = versionId ? `?versionId=${versionId}` : '';
            const [wbsRes, reqRes, actRes] = await Promise.all([
                fetch(`${API_URL}/wbs-nodes/unified/${nodeId}${q}`, { headers }),
                fetch(`${API_URL}/material-requirements/node/${nodeId}${q}`, { headers }),
                fetch(`${API_URL}/leaf-actuals/order/${nodeId}`, { headers }),
            ]);
            const flat = wbsRes.ok ? flattenWbsNodes((await wbsRes.json()).items || []) : [];
            setWbsNodes(flat);
            setCards(reqRes.ok ? buildCardMap(flat, await reqRes.json()) : {});
            setActuals(actRes.ok ? await actRes.json() : []);
        } catch (e) {
            console.error('[RealizationTab] fetchAll error:', e);
        } finally {
            setLoading(false);
        }
    }, [nodeId, versionId, token]);

    // @anchor realization-fetch-actuals — sam dziennik wpisów, bez drzewa WBS i kart.
    // Po dopisaniu / edycji / usunięciu wpisu przeładowujemy tylko to: licznik w wierszu
    // i wiersze potomne muszą pochodzić z jednego źródła, żeby się nie rozjechały.
    const fetchActuals = useCallback(async () => {
        if (!nodeId) return;
        try {
            const res = await fetch(`${API_URL}/leaf-actuals/order/${nodeId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setActuals(await res.json());
        } catch (e) {
            console.error('[RealizationTab] fetchActuals error:', e);
        }
    }, [nodeId, token]);

    // @anchor realization-refresh-card — pojedyncza karta materiałowa po zmianie zdjęcia
    // lub wymagań technicznych; przeładowanie całego drzewa zamykałoby rozwinięty wiersz.
    const refreshCard = useCallback(async (cardId) => {
        if (!cardId) return;
        try {
            const res = await fetch(`${API_URL}/material-requirements/${cardId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;
            const updated = await res.json();
            setCards(prev => {
                const hit = Object.entries(prev).find(([, c]) => c.id === cardId);
                if (!hit) return prev;
                return { ...prev, [hit[0]]: { ...prev[hit[0]], ...updated } };
            });
        } catch { /* odczyt pomocniczy — brak odpowiedzi zostawia stan bez zmian */ }
    }, [token]);

    useEffect(() => { fetchAll(); }, [fetchAll, refreshKey]);

    // ─ Mutacje ───────────────────────────────────────────────────────────────

    // @anchor realization-save-comment — `WbsNode.comment` przez to samo `PATCH /wbs-nodes/:id`
    // co WBSHybridTable, plus rozgłoszenie `wbs-comment-changed`. To drugi kierunek synchronizacji:
    // bez niego marker na schemacie i wiersz WBS zostawałyby ze starym komentarzem do przeładowania.
    // MUSI stać przed `appendEntryComment` — tablica zależności `useCallback` czyta tę stałą
    // w trakcie renderu, więc deklaracja niżej w ciele komponentu wpada w martwą strefę `const`
    // i wywala cały widok na biało.
    const saveComment = useCallback(async (wbsNodeId, comment) => {
        setWbsNodes(prev => prev.map(n => n.id === wbsNodeId ? { ...n, comment } : n));
        await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ comment }),
        });
        window.dispatchEvent(new CustomEvent('wbs-comment-changed', { detail: { wbsNodeIds: [wbsNodeId], comment } }));
    }, []);

    // @anchor realization-append-entry-comment — komentarz nowego wpisu dopisuje się do komentarza
    // POZYCJI jako osobna linia „zakup: …" / „wykonanie: …". Dzięki temu ta sama treść jest widoczna
    // wszędzie, gdzie żyje `WbsNode.comment` — w WBS, w panelu Materiały i na markerze schematu —
    // bez wchodzenia w rozwinięcie pozycji.
    // Dopisujemy WYŁĄCZNIE przy dodaniu wpisu, nigdy przy jego późniejszej edycji: komentarz
    // pozycji jest dziennikiem tego, co się wydarzyło, a nie kopią bieżącej treści wpisu.
    // Poprawka wpisu po fakcie nie przepisuje historii i nie dokleja drugiej linii.
    const appendEntryComment = useCallback(async (node, text) => {
        const trimmed = (text || '').trim();
        if (!trimmed) return;
        const line = `${entryNoun(node.type)}: ${trimmed}`;
        const base = (node.comment || '').trim();
        await saveComment(node.id, base ? `${base}\n${line}` : line);
    }, [saveComment]);

    const addActual = useCallback(async (node, draft) => {
        const res = await fetch(`${API_URL}/leaf-actuals`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                wbsNodeId: node.id,
                entryDate: draft.entryDate || undefined,
                qty: draft.qty,
                unitCost: draft.unitCost,
                comment: draft.comment || null,
                docNumber: draft.docNumber || null,
                supplierId: draft.supplierId || null,
                manufacturer: draft.manufacturer || null,
                model: draft.model || null,
                scope: draft.scope || null,
            }),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Nie udało się zapisać wpisu realizacji');
            return false;
        }
        await fetchActuals();
        await appendEntryComment(node, draft.comment);
        return true;
    }, [fetchActuals, appendEntryComment]);

    const updateActual = useCallback(async (id, patch) => {
        const res = await fetch(`${API_URL}/leaf-actuals/${id}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Nie udało się zapisać zmiany wpisu');
        }
        await fetchActuals();
    }, [fetchActuals]);

    // @anchor realization-set-closed — ustawienie znacznika „rozliczone" na pozycji.
    // MUSI stać przed `deleteActual` — ten czyta stałą w tablicy zależności w trakcie renderu.
    const setClosed = useCallback(async (node, closed) => {
        const res = await fetch(`${API_URL}/leaf-actuals/close/${node.id}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ closed }),
        });
        if (!res.ok) return false;
        setWbsNodes(prev => prev.map(n => n.id === node.id ? { ...n, realizationClosed: closed } : n));
        return true;
    }, []);

    // @anchor realization-reopen-on-empty — usunięcie OSTATNIEGO wpisu zdejmuje z pozycji znacznik
    // „rozliczone". Bez tego zostawała pozycja bez ani jednego zdarzenia, ale z pełnym paskiem,
    // etykietą „rozliczone" i Δ ilość równą MINUS CAŁEMU PLANOWI — czytało się to jak błąd danych.
    // Skoro kasujemy zdarzenie, na którym stało rozliczenie, wracamy do stanu „nic się nie wydarzyło";
    // świadome „rozliczam mimo braku dostawy" nadal ustawia się przyciskiem „Rozlicz".
    // Zdejmujemy flagę ze WSZYSTKICH klonów liścia (wpisy wiszą po korzeniu, flaga po węźle wersji).
    const deleteActual = useCallback(async (id) => {
        const gone = actuals.find(a => a.id === id) || null;
        const res = await fetch(`${API_URL}/leaf-actuals/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Nie udało się usunąć wpisu');
            return;
        }
        await fetchActuals();
        if (!gone) return;
        if (actuals.some(a => a.id !== id && a.wbsRootId === gone.wbsRootId)) return;
        for (const n of wbsNodes.filter(n => n.realizationClosed && wbsRootOf(n) === gone.wbsRootId)) {
            await setClosed(n, false);
        }
    }, [fetchActuals, actuals, wbsNodes, setClosed]);

    const toggleClosed = useCallback((node) => setClosed(node, !node.realizationClosed), [setClosed]);

    // @anchor realization-comment-listener — pierwszy kierunek synchronizacji: komentarz zmieniony
    // w WBS, w panelu Materiały albo na markerze schematu wjeżdża tu bez przeładowania tabeli.
    // Własne zapisy też przechodzą przez ten listener — `setWbsNodes` jest idempotentne.
    useEffect(() => {
        const handler = (e) => {
            const { wbsNodeIds, comment } = e.detail || {};
            if (!wbsNodeIds?.length) return;
            setWbsNodes(prev => prev.map(n => wbsNodeIds.includes(n.id) ? { ...n, comment: comment || '' } : n));
        };
        window.addEventListener('wbs-comment-changed', handler);
        return () => window.removeEventListener('wbs-comment-changed', handler);
    }, []);

    const saveTechSpec = useCallback(async (cardId, technicalSpec) => {
        const res = await fetch(`${API_URL}/material-requirements/${cardId}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ technicalSpec }),
        });
        if (!res.ok) return false;
        setCards(prev => {
            const hit = Object.entries(prev).find(([, c]) => c.id === cardId);
            if (!hit) return prev;
            return { ...prev, [hit[0]]: { ...prev[hit[0]], technicalSpec } };
        });
        return true;
    }, []);

    // ─ Liście, wpisy, filtrowanie ────────────────────────────────────────────

    const leaves = useMemo(() => leafNodesOf(wbsNodes, visibleTypes), [wbsNodes, visibleTypes]);

    const actualsByRoot = useMemo(() => {
        const map = {};
        for (const a of actuals) {
            if (!map[a.wbsRootId]) map[a.wbsRootId] = [];
            map[a.wbsRootId].push(a);
        }
        return map;
    }, [actuals]);

    const planValueOf = (node, card) => {
        const u = planUnitOf(node, card);
        return u != null ? u * (Number(node.quantity) || 0) : 0;
    };

    // @anchor realization-rows — liście z policzoną realizacją, przefiltrowane wyszukiwarką
    // nagłówka strony (`searchQuery`) i filtrami kolumn, na końcu posortowane. Wyszukiwarka
    // sięga tam, gdzie realnie się szuka: nazwa, ścieżka, typ, produkt, dostawca i numer
    // dokumentu ZE WPISÓW — pozycję znajduje się po numerze faktury, nie tylko po nazwie.
    const rows = useMemo(() => {
        let list = leaves.map(node => ({
            node,
            card: cards[node.id] || null,
            realization: realizationOf(node, actualsByRoot[wbsRootOf(node)] || []),
        }));

        const matchTokens = (text, q) => q.split(/[\s/]+/).filter(Boolean).every(t => text.toLowerCase().includes(t));

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(({ node, card, realization }) =>
                (node.name || '').toLowerCase().includes(q) ||
                matchTokens(getParentPath(node.path), q) ||
                (TYPE_META[node.type]?.label || '').toLowerCase().includes(q) ||
                (card?.manufacturer || '').toLowerCase().includes(q) ||
                (card?.model || '').toLowerCase().includes(q) ||
                (card?.technicalSpec || '').toLowerCase().includes(q) ||
                (node.comment || '').toLowerCase().includes(q) ||
                realization.entries.some(e =>
                    (e.docNumber || '').toLowerCase().includes(q) ||
                    (e.supplier?.name || '').toLowerCase().includes(q) ||
                    (e.comment || '').toLowerCase().includes(q) ||
                    (e.manufacturer || '').toLowerCase().includes(q) ||
                    (e.model || '').toLowerCase().includes(q) ||
                    (e.scope || '').toLowerCase().includes(q)
                )
            );
        }

        for (const [key, val] of Object.entries(colFilters)) {
            if (!val) continue;
            const q = val.toLowerCase();
            list = list.filter(({ node, card, realization }) => {
                if (key === 'parent')        return matchTokens(getParentPath(node.path), q);
                if (key === 'name')          return `${node.name || ''} ${TYPE_META[node.type]?.label || ''}`.toLowerCase().includes(q);
                // Filtr kolumny sięga i po produkt z wyceny, i po zakres z wpisów — kolumna jest
                // jedna, więc szukanie musi trafiać w to, co w danym wierszu faktycznie widać.
                if (key === 'product')       return `${card?.manufacturer || ''} ${card?.model || ''}`.toLowerCase().includes(q)
                    || realization.entries.some(e => (e.scope || '').toLowerCase().includes(q));
                if (key === 'supplier')      return realization.entries.some(e => (e.supplier?.name || '').toLowerCase().includes(q));
                if (key === 'doc')           return realization.entries.some(e => (e.docNumber || '').toLowerCase().includes(q));
                if (key === 'qty')           return String(node.quantity ?? '').includes(q);
                if (key === 'realization')   return String(realization.qty).includes(q);
                if (key === 'deltaQty')      return String(Math.round((realization.qty - realization.plan) * 1000) / 1000).includes(q);
                if (key === 'price')         return String(planUnitOf(node, card) ?? '').includes(q);
                if (key === 'purchasePrice') return String(realization.avg ?? purchaseUnitOf(card) ?? '').includes(q);
                if (key === 'total')         return `${Math.round(planValueOf(node, card) * 100) / 100} ${realization.value}`.includes(q);
                if (key === 'comment')       return (node.comment || '').toLowerCase().includes(q);
                if (key === 'actions')       return String(realization.entries.length).includes(q);
                return true;
            });
        }

        list.sort((a, b) => {
            let cmp = 0;
            const k = sortConfig.key;
            const supOf = (x) => x.realization.entries.map(e => e.supplier?.name).filter(Boolean)[0] || '';
            const docOf = (x) => x.realization.entries.map(e => e.docNumber).filter(Boolean)[0] || '';
            if (k === 'parent')            cmp = getParentPath(a.node.path).localeCompare(getParentPath(b.node.path), 'pl');
            else if (k === 'name')         cmp = (a.node.name || '').localeCompare(b.node.name || '', 'pl');
            else if (k === 'product')      cmp = `${a.card?.manufacturer || ''} ${a.card?.model || ''}`.trim().localeCompare(`${b.card?.manufacturer || ''} ${b.card?.model || ''}`.trim(), 'pl');
            else if (k === 'supplier')     cmp = supOf(a).localeCompare(supOf(b), 'pl');
            else if (k === 'doc')          cmp = docOf(a).localeCompare(docOf(b), 'pl');
            else if (k === 'qty')          cmp = (a.node.quantity ?? 0) - (b.node.quantity ?? 0);
            else if (k === 'realization')  cmp = a.realization.pct - b.realization.pct;
            else if (k === 'deltaQty')     cmp = (a.realization.qty - a.realization.plan) - (b.realization.qty - b.realization.plan);
            else if (k === 'price')        cmp = (planUnitOf(a.node, a.card) ?? Infinity) - (planUnitOf(b.node, b.card) ?? Infinity);
            else if (k === 'purchasePrice') cmp = (a.realization.avg ?? purchaseUnitOf(a.card) ?? Infinity) - (b.realization.avg ?? purchaseUnitOf(b.card) ?? Infinity);
            // Koszt całkowity sortuje po odchyleniu — to jest pytanie, które się tej kolumnie zadaje.
            else if (k === 'total')        cmp = (a.realization.value - planValueOf(a.node, a.card)) - (b.realization.value - planValueOf(b.node, b.card));
            else if (k === 'comment')      cmp = (a.node.comment || '').localeCompare(b.node.comment || '', 'pl');
            else if (k === 'actions')      cmp = a.realization.entries.length - b.realization.entries.length;
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });

        return list;
    }, [leaves, cards, actualsByRoot, searchQuery, colFilters, sortConfig]);

    // @anchor realization-totals — sumy z WIDOCZNYCH wierszy, nie z całego zamówienia:
    // po zawężeniu filtrem stopka ma mówić o tym, na co się właśnie patrzy.
    const totals = useMemo(() => {
        let plan = 0, real = 0, done = 0, entries = 0;
        for (const { node, card, realization } of rows) {
            plan += planValueOf(node, card);
            real += realization.value;
            entries += realization.entries.length;
            if (realization.state === 'full' || realization.state === 'over' || realization.state === 'closed') done += 1;
        }
        return {
            plan: Math.round(plan * 100) / 100,
            real: Math.round(real * 100) / 100,
            delta: Math.round((real - plan) * 100) / 100,
            done, entries,
            count: rows.length,
        };
    }, [rows]);

    // @anchor realization-analysis — materiał do narracyjnej analizy w arkuszu „Podsumowanie".
    // Kluczowe rozróżnienie: globalne „Δ" miesza pozycje ruszone z nietkniętymi, więc przy 2%
    // zaawansowania ZAWSZE pokaże ogromny niedobór — i nie mówi nic o tym, czy kupujemy drogo
    // czy tanio. Na to pytanie odpowiada wyłącznie podzbiór pozycji, na których coś się
    // wydarzyło (`ruszone`), i dlatego liczony jest osobno.
    const analiza = useMemo(() => {
        let planR = 0, realR = 0, ruszone = 0, taniej = 0, drozej = 0, wPunkt = 0, oszczednosc = 0, przekroczenie = 0;
        const wgTypu = new Map();
        for (const { node, card, realization } of rows) {
            const p = planValueOf(node, card);
            const t = TYPE_META[node.type]?.label || node.type || '—';
            if (!wgTypu.has(t)) wgTypu.set(t, { typ: t, planCaly: 0, planRuszone: 0, realRuszone: 0 });
            const g = wgTypu.get(t);
            g.planCaly += p;
            if (!(realization.qty > 0 || node.realizationClosed)) continue;
            const d = Math.round((realization.value - p) * 100) / 100;
            planR += p; realR += realization.value; ruszone += 1;
            g.planRuszone += p; g.realRuszone += realization.value;
            if (d < 0) { taniej += 1; oszczednosc -= d; }
            else if (d > 0) { drozej += 1; przekroczenie += d; }
            else wPunkt += 1;
        }
        const z2 = v => Math.round(v * 100) / 100;
        // Prognoza liczona OSOBNO dla każdego rodzaju kosztów: rabat wynegocjowany na materiale
        // nie ma prawa obniżać prognozy robocizny, bo to zupełnie inny rynek.
        //
        // Odchylenie bierzemy pod uwagę dopiero, gdy rodzaj ma za sobą realne wydatki — co
        // najmniej `PROG_MIN_UDZIAL` swojego budżetu. Niżej próbka nic nie znaczy i potrafi wywrócić
        // prognozę: praca wyceniona na 67 311 zł z jednym wpisem na 100 zł dawała prognozę
        // 3 365 zł, czyli 64 tys. „oszczędności" wyczarowane z jednej pozycji. Rodzaj poniżej
        // progu (w tym taki bez żadnych wydatków) wchodzi po 100% wyceny — brak danych nie jest
        // powodem, żeby obiecywać oszczędność.
        let prognoza = 0;
        for (const g of wgTypu.values()) {
            g.pelna = !(g.planCaly > 0 && g.planRuszone > 0 && g.realRuszone / g.planCaly >= PROG_MIN_UDZIAL);
            g.wsp = g.pelna ? 1 : g.realRuszone / g.planRuszone;
            prognoza += g.planCaly * g.wsp;
        }
        return {
            ruszone, taniej, drozej, wPunkt,
            planRuszone: z2(planR), realRuszone: z2(realR), deltaRuszone: z2(realR - planR),
            oszczednosc: z2(oszczednosc), przekroczenie: z2(przekroczenie),
            prognoza: z2(prognoza),
            typy: [...wgTypu.values()].map(g => ({ ...g, planCaly: z2(g.planCaly), planRuszone: z2(g.planRuszone), realRuszone: z2(g.realRuszone) })),
        };
    }, [rows]);

    // ─ Eksport Excel ─────────────────────────────────────────────────────────

    // @anchor realization-export-excel — eksport DOKŁADNIE tego, co widać na ekranie: wiersze po
    // wyszukiwarce, filtrach kolumn i sortowaniu, zawężone rolą (praca, usługa, nocleg i paliwo
    // wchodzą wyłącznie u managera — `visibleTypes`). Drugi arkusz „Podsumowanie" niesie globalne
    // porównanie wyceny z realizacją, licznik rozliczonych pozycji i rozbicie po typie liścia.
    // Kolumny o prostej relacji arytmetycznej są ŻYWYMI formułami (zasada eksportów Excel):
    // wartość wyceny = ilość × koszt jedn., Δ = zakup − wycena, sumy przez SUM/SUMIF/COUNTIF —
    // po zmianie liczby w arkuszu wszystko przelicza się samo.
    const exportExcel = async () => {
        if (exporting || rows.length === 0) return;
        setExporting(true);
        try {
            const wb = new ExcelJS.Workbook();
            // Kolejność zakładek bierze się z kolejności `addWorksheet`, więc oba arkusze zakładamy
            // tutaj, a wypełniamy niżej: „Podsumowanie" ma otwierać plik (najpierw wnioski, potem
            // dane), ale liczy się z gotowej tabeli. Formuły `Realizacja!…` adresują po nazwie,
            // więc kolejność arkuszy im nie przeszkadza.
            const ps = wb.addWorksheet('Podsumowanie');
            const ws = wb.addWorksheet('Realizacja');
            // Waluta w postaci, którą Excel rozpoznaje jako PLN, a nie jako format niestandardowy.
            const FMT_PLN = '#,##0.00\\ [$zł-415]';
            ws.columns = [
                { header: 'Przedmiot projektu', key: 'parent', width: 32 },
                { header: 'Nazwa', key: 'name', width: 38 },
                { header: 'Typ', key: 'typ', width: 12 },
                { header: 'Produkt / zakres', key: 'product', width: 28 },
                { header: 'Dostawca', key: 'supplier', width: 24 },
                { header: 'Dokument', key: 'doc', width: 16 },
                { header: 'Ilość wyceny', key: 'qtyPlan', width: 12 },
                { header: 'Jedn.', key: 'unit', width: 8 },
                { header: 'Zakup / wykonanie', key: 'qtyReal', width: 16 },
                { header: 'Δ ilość', key: 'dQty', width: 10 },
                { header: 'Koszt jedn. wyceny', key: 'pricePlan', width: 16 },
                // „Zakup" tylko tam, gdzie faktycznie się kupuje. Arkusz obejmuje wszystkie typy
                // liści, a pracy i usługi się nie kupuje — kolumny zbiorcze mówią „realizacja".
                { header: 'Koszt jedn. realizacji', key: 'pricePurchase', width: 18 },
                { header: 'Koszt całk. wyceny', key: 'valuePlan', width: 18 },
                { header: 'Koszt całk. realizacji', key: 'valueReal', width: 20 },
                { header: 'Δ wartość', key: 'delta', width: 14 },
                { header: 'Rozliczone', key: 'closed', width: 11 },
                { header: 'Wpisy', key: 'entries', width: 8 },
                { header: 'Komentarz', key: 'comment', width: 40 },
            ];
            ws.getRow(1).font = { bold: true };
            ws.views = [{ state: 'frozen', ySplit: 1 }];
            ws.autoFilter = 'A1:R1';

            rows.forEach(({ node, card, realization: r }, i) => {
                const n = i + 2;
                const planUnit = planUnitOf(node, card);
                const purchaseUnit = r.avg ?? purchaseUnitOf(card);
                const planValue = planUnit != null ? planUnit * (Number(node.quantity) || 0) : null;
                const hasReal = r.qty > 0 || node.realizationClosed;
                const scopes = [...new Set(r.entries.map(e => e.scope).filter(Boolean))];
                const product = [card?.manufacturer, card?.model].filter(Boolean).join(' ') || scopes.join('; ');
                ws.addRow({
                    parent: getParentPath(node.path),
                    name: node.name || '',
                    typ: TYPE_META[node.type]?.label || node.type || '',
                    product,
                    supplier: [...new Set(r.entries.map(e => e.supplier?.name).filter(Boolean))].join(', '),
                    doc: [...new Set(r.entries.map(e => e.docNumber).filter(Boolean))].join(', '),
                    qtyPlan: Number(node.quantity) || 0,
                    unit: node.unit || 'szt',
                    qtyReal: r.qty,
                    dQty: { formula: `I${n}-G${n}`, result: Math.round((r.qty - r.plan) * 1000) / 1000 },
                    pricePlan: planUnit,
                    pricePurchase: purchaseUnit,
                    valuePlan: planUnit != null ? { formula: `G${n}*K${n}`, result: planValue ?? 0 } : null,
                    // Zakup to SUMA wpisów o różnych cenach, nie iloczyn — zostaje wartością.
                    valueReal: hasReal ? r.value : null,
                    delta: planValue != null && hasReal ? { formula: `N${n}-M${n}`, result: Math.round((r.value - planValue) * 100) / 100 } : null,
                    closed: node.realizationClosed ? 'tak' : 'nie',
                    entries: r.entries.length,
                    comment: node.comment || '',
                });
            });

            const last = rows.length + 1;
            const sum = ws.addRow({
                parent: 'Razem',
                valuePlan: { formula: `SUM(M2:M${last})`, result: totals.plan },
                valueReal: { formula: `SUM(N2:N${last})`, result: totals.real },
                delta: { formula: `SUM(O2:O${last})`, result: totals.delta },
                entries: { formula: `SUM(Q2:Q${last})`, result: totals.entries },
            });
            sum.font = { bold: true };
            // Kwoty jako waluta PLN, ilości bez formatu (ogólne) — jednostka siedzi w osobnej
            // kolumnie „Jedn.", więc doklejanie separatorów do liczby sztuk tylko myli.
            ['pricePlan', 'pricePurchase', 'valuePlan', 'valueReal', 'delta'].forEach(k => { ws.getColumn(k).numFmt = FMT_PLN; });

            // ─ Podsumowanie ──────────────────────────────────────────────────
            ps.columns = [
                { header: '', key: 'a', width: 44 },
                { header: '', key: 'b', width: 18 },
                { header: '', key: 'c', width: 18 },
                { header: '', key: 'd', width: 14 },
                { header: '', key: 'e', width: 18 },
                { header: '', key: 'f', width: 18 },
            ];
            const naglowek = (t) => { const r = ps.addRow({ a: t }); r.font = { bold: true }; return r; };
            const filtry = Object.entries(colFilters).filter(([, v]) => v).map(([k, v]) => `${COL_DEFS.find(c => c.key === k)?.label || k}: ${v}`);

            // Excel NIE dopasowuje wysokości wiersza, w którym jest scalona komórka — trzeba ją
            // policzyć samemu, inaczej dłuższy tekst urywa się w połowie zdania. Nominalna
            // szerokość scalenia (suma `width` kolumn) to górna granica: łamanie idzie po
            // słowach, więc realnie w wierszu mieści się ok. 83% znaków. Stąd zapas.
            const ZNAKI_A_F = 105;  // scalenie A:F ma 130 jednostek szerokości
            const ZNAKI_B_F = 68;   // scalenie B:F ma 86 jednostek
            const wysokosc = (tekst, znaki) => Math.max(1, Math.ceil(String(tekst).length / znaki)) * 15 + 4;
            // Wiersz „etykieta + długa wartość": wartość rozlana na B:F, żeby lista rodzajów
            // kosztów albo zestaw filtrów nie ginął na szerokości samej kolumny B.
            const wierszOpisowy = (label, tekst) => {
                const r = ps.addRow({ a: label, b: tekst });
                ps.mergeCells(`B${r.number}:F${r.number}`);
                r.getCell('b').alignment = { wrapText: true, vertical: 'top' };
                r.height = wysokosc(tekst, ZNAKI_B_F);
                return r;
            };

            naglowek('Realizacja — podsumowanie');
            wierszOpisowy('Zamówienie', orderName || '—');
            ps.addRow({ a: 'Data eksportu', b: new Date().toISOString().slice(0, 10) });
            // Zakres wprost w arkuszu — bez tego nie da się później odpowiedzieć, czy plik nie ma
            // kosztów własnych, bo ich nie było, czy bo rola ich nie widziała. Przy zawężeniu
            // wymieniamy rodzaje kosztów po nazwie, żeby czytelnik nie musiał zgadywać, czego brak.
            const rodzaje = visibleTypes.map(t => TYPE_META[t]?.label || t);
            wierszOpisowy('Zakres eksportu', visibleTypes.length === LEAF_TYPES.length
                ? 'cały zakres zamówienia'
                : `część zakresu — rodzaje kosztów: ${rodzaje.join(', ')}`);
            ps.addRow({ a: 'Baseline', b: accepted ? 'zaakceptowany' : 'plan z bieżącej wersji' });
            if (searchQuery.trim()) wierszOpisowy('Szukana fraza', searchQuery.trim());
            if (filtry.length) wierszOpisowy('Filtry kolumn', filtry.join(' · '));
            ps.addRow({});

            naglowek('Porównanie globalne');
            ps.addRow({ a: 'Koszt całkowity wyceny', b: { formula: `Realizacja!M${last + 1}`, result: totals.plan } });
            ps.addRow({ a: 'Wartość zakupów / realizacji zadań', b: { formula: `Realizacja!N${last + 1}`, result: totals.real } });
            const wRow = ps.rowCount - 1;
            // Obie pozycje liczone „w plus": ile budżetu ZOSTAŁO (wycena − realizacja) i jaka jego
            // część JEST już wydana (realizacja ÷ wycena). Odwrotnie niż kolumna „Δ wartość"
            // w arkuszu Realizacja, która zostaje znakowanym odchyleniem.
            ps.addRow({ a: 'Wartość niezrealizowanego budżetu ofertowego', b: { formula: `B${wRow}-B${wRow + 1}`, result: Math.round((totals.plan - totals.real) * 100) / 100 } });
            ps.addRow({ a: 'Procentowa realizacja budżetu', b: { formula: `IF(B${wRow}=0,"",B${wRow + 1}/B${wRow})`, result: totals.plan ? totals.real / totals.plan : '' } });
            ps.getCell(`B${ps.rowCount}`).numFmt = '0.0%';
            // wRow = „Koszt całkowity wyceny"; kolejne dwa wiersze to realizacja i Δ wartość.
            for (let r = wRow; r <= wRow + 2; r++) ps.getCell(`B${r}`).numFmt = FMT_PLN;
            ps.addRow({});

            // ─ Prognoza wydatków ─────────────────────────────────────────────
            // Osobny wiersz na każdy rodzaj kosztów: współczynnik wyliczony z pozycji już
            // ruszonych tego rodzaju, przeniesiony na cały jego plan. Rodzaj bez wydatków
            // idzie po 100% wyceny. Na końcu suma — prognoza całego budżetu.
            if (analiza.ruszone) {
                naglowek('Prognoza wydatków');
                const glowka = ps.addRow({ a: 'Rodzaj kosztów', b: 'Wycena', c: 'Wykonanie', d: '% wykonania', e: 'Prognoza', f: 'Δ do oferty' });
                glowka.font = { bold: true };
                const odRow = ps.rowCount + 1;
                const typy = analiza.typy.filter(g => g.planCaly > 0);
                for (const g of typy) {
                    const n = ps.rowCount + 1;
                    const prog = Math.round(g.planCaly * g.wsp * 100) / 100;
                    ps.addRow({
                        a: g.typ,
                        b: g.planCaly,
                        c: g.realRuszone,
                        // Udział wykonania w wycenie rodzaju — to ta liczba decyduje, czy prognoza
                        // idzie z odchylenia, czy zostaje na 100% (próg `PROG_MIN_UDZIAL`).
                        d: { formula: `IF(B${n}=0,"",C${n}/B${n})`, result: g.planCaly ? g.realRuszone / g.planCaly : '' },
                        e: prog,
                        f: { formula: `B${n}-E${n}`, result: Math.round((g.planCaly - prog) * 100) / 100 },
                    });
                }
                const doRow = ps.rowCount;
                const suma = ps.addRow({
                    a: 'Razem',
                    b: { formula: `SUM(B${odRow}:B${doRow})`, result: totals.plan },
                    c: { formula: `SUM(C${odRow}:C${doRow})`, result: totals.real },
                    d: { formula: `IF(B${ps.rowCount + 1}=0,"",C${ps.rowCount + 1}/B${ps.rowCount + 1})`, result: totals.plan ? totals.real / totals.plan : '' },
                    e: { formula: `SUM(E${odRow}:E${doRow})`, result: analiza.prognoza },
                    f: { formula: `SUM(F${odRow}:F${doRow})`, result: Math.round((totals.plan - analiza.prognoza) * 100) / 100 },
                });
                suma.font = { bold: true };
                for (let r = odRow; r <= suma.number; r++) {
                    for (const k of ['B', 'C', 'E', 'F']) ps.getCell(`${k}${r}`).numFmt = FMT_PLN;
                    ps.getCell(`D${r}`).numFmt = '0.0%';
                }

                // Rodzaje trzymane na 100% — bez tego wiersz z wykonaniem 100 zł przy wycenie
                // 67 tys. i prognozą równą wycenie wygląda na błąd rachunku, a nie na decyzję.
                const trzymane = typy.filter(g => g.pelna && g.realRuszone > 0).map(g => g.typ);
                if (trzymane.length) {
                    const r = ps.addRow({ a: `Wykonanie poniżej ${Math.round(PROG_MIN_UDZIAL * 100)}% budżetu rodzaju — prognoza trzymana na 100% wyceny: ${trzymane.join(', ')}.` });
                    ps.mergeCells(`A${r.number}:F${r.number}`);
                    r.getCell('a').alignment = { wrapText: true, vertical: 'top' };
                    r.height = wysokosc(r.getCell('a').value, ZNAKI_A_F);
                }
                ps.addRow({});
            }

            // ─ Analiza ───────────────────────────────────────────────────────
            // Zdania budowane z liczb, nie z szablonu „wstaw wartość" — każdy wariant (jesteśmy
            // do przodu / przekraczamy / nic nie ruszyło) ma własne sformułowanie, bo inaczej
            // przy zerowej realizacji wychodzą komunikaty bez sensu. Kwoty zawsze dodatnie,
            // kierunek niesie słowo.
            const zl = v => `${fmtZl(v)} zł`;
            const pct = (a, b) => `${(a / b * 100).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
            // Liczebnik w mianowniku (1 pozycja / 2 pozycje / 5 pozycji). Po przyimku „z" polski
            // wymaga dopełniacza niezależnie od liczby, więc tam wpisujemy „pozycji" na sztywno.
            const poz = n => n === 1 ? 'pozycja' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'pozycje' : 'pozycji';
            const A = analiza;
            const zdania = [];

            if (!totals.plan) {
                zdania.push(`Pozycje w tym widoku nie mają kwot w wycenie, a na zakupy i wykonanie zadań poszło dotąd ${zl(totals.real)} — nie ma do czego porównać realizacji.`);
            } else if (totals.real > totals.plan) {
                zdania.push(`Wycena zamówienia to ${zl(totals.plan)}, a na zakupy i wykonanie zadań poszło dotąd ${zl(totals.real)} — budżet ofertowy jest wyczerpany i przekroczony o ${zl(totals.real - totals.plan)}, co daje ${pct(totals.real, totals.plan)} wyceny.`);
            } else {
                zdania.push(`Wycena zamówienia to ${zl(totals.plan)}, a na zakupy i wykonanie zadań poszło dotąd ${zl(totals.real)} — zrealizowano ${pct(totals.real, totals.plan)} budżetu ofertowego, do wykorzystania zostaje ${zl(totals.plan - totals.real)}.`);
            }

            if (!A.ruszone) {
                zdania.push(`Żadna z ${totals.count} pozycji w widoku nie ma jeszcze wpisu zakupu ani wykonania, więc nie da się jeszcze powiedzieć, czy kupujemy taniej, czy drożej niż zakładała wycena.`);
            } else {
                const udzial = totals.plan ? `, czyli ${pct(A.planRuszone, totals.plan)} całego budżetu` : '';
                zdania.push(`Realizacja ruszyła na ${A.ruszone} z ${totals.count} pozycji (${pct(A.ruszone, totals.count)}); w wycenie odpowiadały one za ${zl(A.planRuszone)}${udzial}.`);

                if (!A.planRuszone) {
                    zdania.push(`Ruszone pozycje nie miały w wycenie żadnej kwoty, więc całe ${zl(A.realRuszone)} to koszt ponad plan.`);
                } else if (A.deltaRuszone < 0) {
                    zdania.push(`Na tych pozycjach wydano ${zl(A.realRuszone)} przy planie ${zl(A.planRuszone)} — jesteśmy do przodu o ${zl(-A.deltaRuszone)}, czyli kupujemy ${pct(-A.deltaRuszone, A.planRuszone)} poniżej wyceny.`);
                } else if (A.deltaRuszone > 0) {
                    zdania.push(`Na tych pozycjach wydano ${zl(A.realRuszone)} przy planie ${zl(A.planRuszone)} — wydajemy o ${zl(A.deltaRuszone)} więcej, niż zakładano, czyli ${pct(A.deltaRuszone, A.planRuszone)} powyżej wyceny.`);
                } else {
                    zdania.push(`Na tych pozycjach wydano dokładnie tyle, ile zakładała wycena — ${zl(A.realRuszone)}.`);
                }

                // Wyliczenie bez orzeczenia — przy zmiennej liczbie pozycji każda forma czasownika
                // („wypadła / wypadły / wypadło") byłaby błędna dla dwóch pozostałych przypadków.
                zdania.push(`Poniżej wyceny: ${A.taniej} ${poz(A.taniej)} na łączną oszczędność ${zl(A.oszczednosc)}. Powyżej wyceny: ${A.drozej} ${poz(A.drozej)} na łączne przekroczenie ${zl(A.przekroczenie)}${A.wPunkt ? `. Dokładnie w planie: ${A.wPunkt} ${poz(A.wPunkt)}` : ''}.`);

                if (A.planRuszone > 0 && totals.plan) {
                    if (A.planRuszone / totals.plan < 0.2) {
                        zdania.push(`Próba jest jednak mała: ruszone pozycje to dopiero ${pct(A.planRuszone, totals.plan)} wartości wyceny, więc prognozę traktuj orientacyjnie — o rzeczywistym wyniku zamówienia zdecydują pozycje jeszcze nietknięte.`);
                    }
                }
            }

            naglowek('Analiza');
            for (const z of zdania) {
                const r = ps.addRow({ a: z });
                ps.mergeCells(`A${r.number}:F${r.number}`);
                r.getCell('a').alignment = { wrapText: true, vertical: 'top' };
                r.height = wysokosc(z, ZNAKI_A_F);
            }
            ps.addRow({});

            naglowek('Pokrycie');
            ps.addRow({ a: 'Pozycje w widoku', b: totals.count });
            ps.addRow({ a: 'Rozliczone / wykonane', b: totals.done });
            ps.addRow({ a: 'Udział rozliczonych', b: { formula: `IF(B${ps.rowCount - 1}=0,"",B${ps.rowCount}/B${ps.rowCount - 1})`, result: totals.count ? totals.done / totals.count : '' } });
            ps.getCell(`B${ps.rowCount}`).numFmt = '0.0%';
            ps.addRow({ a: 'Wpisy realizacji', b: totals.entries });
            ps.addRow({});

            // Rozbicie po typie — SUMIF/COUNTIF po arkuszu „Realizacja", więc po ręcznej
            // korekcie liczby w tabeli podsumowanie idzie za nią.
            const naglowekTypow = ps.addRow({ a: 'Typ pozycji', b: 'Pozycje', c: 'Rozliczone', d: 'Wycena', e: 'Realizacja', f: 'Δ' });
            naglowekTypow.font = { bold: true };
            const rozbicieOd = ps.rowCount + 1;
            const typy = [...new Set(rows.map(({ node }) => TYPE_META[node.type]?.label || node.type || '—'))];
            for (const t of typy) {
                const mine = rows.filter(({ node }) => (TYPE_META[node.type]?.label || node.type || '—') === t);
                const planT = Math.round(mine.reduce((s, x) => s + planValueOf(x.node, x.card), 0) * 100) / 100;
                const realT = Math.round(mine.reduce((s, x) => s + x.realization.value, 0) * 100) / 100;
                const n = ps.rowCount + 1;
                ps.addRow({
                    a: t,
                    b: { formula: `COUNTIF(Realizacja!$C$2:$C$${last},$A${n})`, result: mine.length },
                    c: { formula: `COUNTIFS(Realizacja!$C$2:$C$${last},$A${n},Realizacja!$P$2:$P$${last},"tak")`, result: mine.filter(x => x.node.realizationClosed).length },
                    d: { formula: `SUMIF(Realizacja!$C$2:$C$${last},$A${n},Realizacja!$M$2:$M$${last})`, result: planT },
                    e: { formula: `SUMIF(Realizacja!$C$2:$C$${last},$A${n},Realizacja!$N$2:$N$${last})`, result: realT },
                    f: { formula: `E${n}-D${n}`, result: Math.round((realT - planT) * 100) / 100 },
                });
            }
            // Format per komórka, nie per kolumna: kolumna D niesie też „% wykonania" w tabeli
            // prognozy, a `getColumn().numFmt` zamieniłby ten procent na złotówki.
            for (let r = rozbicieOd; r <= ps.rowCount; r++) {
                for (const k of ['D', 'E', 'F']) ps.getCell(`${k}${r}`).numFmt = FMT_PLN;
            }

            const buf = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${(orderName || 'zamowienie').replace(/[^\w\d-]+/g, '_')}_analiza finansowa realizacji projektu.xlsx`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e) {
            console.error('[RealizationTab] eksport Excel:', e);
            alert('Nie udało się wygenerować pliku Excel');
        } finally {
            setExporting(false);
        }
    };

    // ─ Zmiana szerokości kolumn ──────────────────────────────────────────────

    const startResize = (key, e) => {
        e.preventDefault();
        e.stopPropagation();
        resizeDrag.current = { key, startX: e.clientX, startW: colWidths[key] };
        const onMove = ev => {
            const d = resizeDrag.current;
            if (!d) return;
            setColWidths(p => ({ ...p, [d.key]: Math.max(70, d.startW + (ev.clientX - d.startX)) }));
        };
        const onUp = () => {
            resizeDrag.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const toggleSort = (key) => setSortConfig(s =>
        s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }
    );

    // @anchor realization-offer-product — produkt Z WYCENY: propozycja `isOffer`, a gdy jej nie ma —
    // produkt katalogowy wymagania. Zwraca `null`, jeśli po stronie wyceny nie ma czym się podeprzeć;
    // wtedy formularz otwiera się pusty i nie ma o co pytać.
    const offerProductOf = (card) => {
        const p = card?.proposals?.find(x => x.isOffer) || null;
        const manufacturer = p?.manufacturer || card?.manufacturer || '';
        const model = p?.model || card?.model || '';
        const productName = p?.productName || card?.productName || '';
        if (!manufacturer && !model && !productName) return null;
        return { manufacturer, model, productName, supplierId: p?.supplier?.id ?? p?.supplierId ?? null, supplierName: p?.supplier?.name || '' };
    };

    // @anchor realization-open-entry-form — otwarcie formularza wpisu. Gdy pozycja ma produkt
    // po stronie wyceny, PYTAMY, czy zakup jej dotyczy: „tak" przepisuje producenta, model
    // i dostawcę, „nie" zostawia pola puste (zamiennik wpisuje się ręcznie). Cena nie jest
    // przepisywana w żadnym wypadku — patrz `realization-entry-form-no-price`.
    const openEntryForm = (node, card) => {
        setExpandedId(node.id);
        setFormNodeId(node.id);
        const offer = offerProductOf(card);
        if (!offer) { setFormSeed(null); return; }
        const opis = [offer.manufacturer, offer.model].filter(Boolean).join(' ') || offer.productName;
        // Pytanie pada wyłącznie nad materiałem i sprzętem — praca i usługa nie mają karty
        // produktowej, więc `offerProductOf` zwraca dla nich `null` i modal się nie pokazuje.
        // Dlatego treść mówi wprost o zakupie i produkcie, bez wariantu dla wykonania.
        const sameProduct = window.confirm(
            `Czy zakupiłeś ten sam co wyceniany produkt?\n` +
            `Wypełnić dane zakupionego produktu danymi z wyceny?\n\n` +
            `${opis}${offer.supplierName ? `\nDostawca z wyceny: ${offer.supplierName}` : ''}\n\n` +
            `OK — uzupełnię producenta, model${offer.supplierName ? ' i dostawcę' : ''}.\n` +
            `Anuluj — wpiszesz zamiennik ręcznie.\n\n` +
            `Koszt jedn. w obu wypadkach zostaje pusty — cenę wpisujesz sam.`
        );
        setFormSeed(sameProduct ? offer : null);
    };

    // ─ Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Nagłówek sekcji „Tabela realizacji" */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-white/[0.02] flex-shrink-0 flex-wrap">
                <ShoppingCart size={14} className="text-teal-400 flex-shrink-0" />
                <span className="text-sm font-bold text-white">Tabela realizacji</span>
                {orderName && <span className="text-xs text-gray-500 truncate">· {orderName}</span>}
                {/* Eksport przy nagłówku, nie przy prawej krawędzi — to działanie na całej tabeli,
                    a nie znacznik stanu jak plakietki roli i baselinu po prawej. */}
                <button
                    onClick={exportExcel}
                    disabled={exporting || rows.length === 0}
                    title="Eksport do Excela — dokładnie te wiersze, które widać, plus arkusz podsumowania"
                    className="flex items-center gap-1.5 px-2 py-1 rounded border border-blue-500/25 bg-blue-500/10 text-blue-300 text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500/20 disabled:opacity-40 transition-colors flex-shrink-0">
                    <FileSpreadsheet size={12} />
                    {exporting ? 'eksportuję…' : 'Excel'}
                </button>
                <div className="h-4 w-px bg-white/10" />
                <span className="text-xs text-gray-400">
                    Pozycje: <span className="font-mono text-gray-200">{totals.done}/{totals.count}</span>
                </span>
                <span className="text-xs text-gray-400">
                    Wpisy: <span className="font-mono text-gray-200">{totals.entries}</span>
                </span>

                <div className="flex-1" />

                {!isManagerOrAdmin && (
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider" title="Praca, usługi, noclegi i paliwo widzi wyłącznie manager">
                        widok: materiały i sprzęt
                    </span>
                )}
                {!accepted && (
                    <span className="text-[10px] text-amber-400/70 uppercase tracking-wider" title="Baseline nie jest zaakceptowany — plan pochodzi z bieżącej wersji wyceny i może się jeszcze zmienić">
                        plan z bieżącej wersji
                    </span>
                )}
                {readOnly && <span className="text-[10px] text-gray-600 uppercase tracking-wider">tylko podgląd</span>}
            </div>

            {leaves.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                    <AlertCircle size={28} className="text-gray-600" />
                    <p className="text-sm">Brak pozycji kosztowych w tym zamówieniu.</p>
                    <p className="text-xs text-gray-600">Ustaw typ wiersza (materiał, sprzęt, praca, usługa…) w Strukturze projektu.</p>
                </div>
            ) : (
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="table-fixed w-full">
                        <colgroup>
                            <col style={{ width: 58 }} />
                            {COL_DEFS.map(c => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
                        </colgroup>
                        <thead className="sticky top-0 z-20">
                            <tr className="border-b border-white/10 bg-gray-950">
                                <th className="bg-gray-950" />
                                {COL_DEFS.map(c => (
                                    <th key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'} bg-gray-950 select-none relative`}>
                                        <button
                                            onClick={() => toggleSort(c.key)}
                                            className={`inline-flex items-center gap-1 text-base font-bold uppercase tracking-widest text-white hover:text-gray-200 transition-colors w-full ${c.align === 'right' ? 'justify-end' : ''}`}
                                        >
                                            <span className="truncate">{c.label}</span>
                                            <span className={sortConfig.key === c.key ? 'text-teal-400 flex-shrink-0' : 'text-gray-600 flex-shrink-0'}>
                                                {sortConfig.key === c.key ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⬍'}
                                            </span>
                                        </button>
                                        <div
                                            onMouseDown={e => startResize(c.key, e)}
                                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-teal-500/40 transition-colors z-10"
                                        />
                                    </th>
                                ))}
                            </tr>
                            <tr className="border-b border-white/5 bg-gray-950">
                                <th className="bg-gray-950" />
                                {COL_DEFS.map(c => (
                                    <th key={c.key} className="px-2 py-1 bg-gray-950">
                                        <input
                                            value={colFilters[c.key] || ''}
                                            onChange={e => setColFilters(p => ({ ...p, [c.key]: e.target.value }))}
                                            placeholder="filtruj..."
                                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white placeholder-gray-700 outline-none focus:border-teal-500/40"
                                        />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {/* @anchor realization-empty-filter-row — komunikat o pustym wyniku filtra
                                MUSI siedzieć w `<tbody>`, a nie zastępować całą tabelę: nagłówek z polami
                                filtrów zostaje na ekranie, więc filtr da się cofnąć bez przeładowania widoku. */}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={COL_DEFS.length + 1} className="px-4 py-16">
                                        <div className="flex flex-col items-center justify-center gap-3 text-gray-500">
                                            <AlertCircle size={28} className="text-gray-600" />
                                            <p className="text-sm">Brak pozycji pasujących do filtra.</p>
                                            <div className="flex items-center gap-2">
                                                {Object.values(colFilters).some(Boolean) && (
                                                    <button
                                                        onClick={() => setColFilters({})}
                                                        className="px-2.5 py-1 rounded border border-teal-500/25 bg-teal-500/10 text-teal-300 text-[10px] font-bold uppercase tracking-wider hover:bg-teal-500/20 transition-colors">
                                                        Wyczyść filtry kolumn
                                                    </button>
                                                )}
                                                {searchQuery.trim() && (
                                                    <span className="text-xs text-gray-600">
                                                        Aktywna wyszukiwarka: „{searchQuery.trim()}"
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {rows.map(({ node, card, realization }) => {
                                const isExpanded = expandedId === node.id;
                                const hasCard = TYPE_META[node.type]?.hasCard !== false;
                                const remaining = Math.round((realization.plan - realization.qty) * 1000) / 1000;
                                return (
                                    <React.Fragment key={node.id}>
                                        <RealizationRow
                                            node={node}
                                            card={card}
                                            realization={realization}
                                            isExpanded={isExpanded}
                                            readOnly={readOnly}
                                            onSaveComment={saveComment}
                                            onToggle={() => {
                                                setExpandedId(isExpanded ? null : node.id);
                                                if (isExpanded) { setFormNodeId(null); setFormSeed(null); }
                                            }}
                                            onAddClick={() => openEntryForm(node, card)}
                                        />
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={COL_DEFS.length + 1} className="p-0">
                                                    <RealizationExpandPanel
                                                        node={node}
                                                        card={card}
                                                        realization={realization}
                                                        token={token}
                                                        readOnly={readOnly}
                                                        onToggleClosed={() => toggleClosed(node)}
                                                        onSaveTechSpec={saveTechSpec}
                                                        onRefreshCard={() => refreshCard(card?.id)}
                                                    />
                                                </td>
                                            </tr>
                                        )}
                                        {/* @anchor realization-tab-entry-rows — wpisy jako wiersze POTOMNE
                                            tabeli głównej: historia rośnie w dół, a kolumny są dokładnie
                                            te same, co w wierszu pozycji. */}
                                        {isExpanded && realization.entries.map(e => (
                                            <RealizationEntryLine
                                                key={e.id}
                                                entry={e}
                                                cols={COL_DEFS}
                                                hasCard={hasCard}
                                                readOnly={readOnly}
                                                onSave={updateActual}
                                                onDelete={deleteActual}
                                            />
                                        ))}
                                        {isExpanded && formNodeId === node.id && !readOnly && (
                                            <RealizationEntryForm
                                                // Remount po zmianie pozycji LUB odpowiedzi na pytanie o produkt —
                                                // `blank()` czyta seed tylko przy inicjalizacji stanu.
                                                key={`form-${node.id}-${formSeed ? 'z-wyceny' : 'pusty'}`}
                                                node={node}
                                                cols={COL_DEFS}
                                                hasCard={hasCard}
                                                defaultQty={remaining > 1e-9 ? remaining : 1}
                                                seedProduct={formSeed}
                                                onAdd={draft => addActual(node, draft)}
                                                onClose={() => { setFormNodeId(null); setFormSeed(null); }}
                                            />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                        {/* @anchor realization-totals-row — podsumowanie kosztów całkowitych wyceny
                            i zakupów dla wszystkich widocznych wierszy; przyklejone do dołu, żeby
                            zostawało na oku przy przewijaniu długiej listy pozycji. */}
                        {/* `sticky` siedzi na komórkach, nie na `<tfoot>` — przyklejanie samego
                            elementu grupującego nie jest wspierane spójnie między przeglądarkami. */}
                        <tfoot className={rows.length === 0 ? 'hidden' : undefined}>
                            <tr>
                                <td className="sticky bottom-0 z-20 bg-gray-950 border-t-2 border-teal-500/30" />
                                {/* Stopka o 2px większa niż wiersze tabeli (13/16px wobec 11/14px):
                                    to podsumowanie całego widoku, więc ma się wybijać z listy. */}
                                {COL_DEFS.map(c => {
                                    const base = 'sticky bottom-0 z-20 bg-gray-950 border-t-2 border-teal-500/30';
                                    if (c.key === 'parent') return (
                                        <td key={c.key} className={`${base} px-3 py-2 text-[13px] font-bold uppercase tracking-widest text-teal-300/80`}>
                                            Razem ({totals.count})
                                        </td>
                                    );
                                    if (c.key === 'total') return (
                                        <td key={c.key} className={`${base} px-3 py-2 text-right font-mono text-base whitespace-nowrap`}>
                                            <div className="text-red-300" title="Suma kosztów całkowitych z wyceny">{fmtZl(totals.plan)} zł</div>
                                            <div className="text-red-400" title="Suma kosztów całkowitych zakupu">{fmtZl(totals.real)} zł</div>
                                            <div className={`text-[13px] font-bold ${totals.delta > 0.005 ? 'text-red-300' : totals.delta < -0.005 ? 'text-teal-300' : 'text-gray-500'}`}>
                                                Δ {totals.delta > 0 ? '+' : ''}{fmtZl(totals.delta)}
                                            </div>
                                        </td>
                                    );
                                    if (c.key === 'actions') return (
                                        <td key={c.key} className={`${base} px-3 py-2 text-right font-mono text-[14px] text-gray-500`}>{totals.entries}</td>
                                    );
                                    return <td key={c.key} className={base} />;
                                })}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}
