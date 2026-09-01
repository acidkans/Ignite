import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { TYPE_OPTIONS, TYPE_LABELS, fmtPLN, wbsTypeFromAny, parseLocaleNumber, usesWorkStatuses, WORK_STATUS_META, resolveStatusCode, defaultStatusForType } from './wbsConstants';
import AutoResizeTextarea from './AutoResizeTextarea';
import WbsNameAutocomplete from './WbsNameAutocomplete';
import { buildNameSuggestionPool, pickTwinDefaults } from './wbsNameSuggest';
import { Plus, Trash2, ChevronRight, ChevronDown, GripVertical, Tag, X, ExternalLink, Paperclip, Image, FileText, Volume2, Link, Unlink, FileDown, Package, Copy, Clipboard, HelpCircle, ListTodo } from 'lucide-react';
import AddTaskModal from '../AddTaskModal';
import { useDevice } from '../../../hooks/useDevice';

// ── Q&A cell — zagnieżdżona tabela Pytanie / Odpowiedź per WBS node ───────────
function QaPairRow({ p, idx, onUpdate, onRemove, onPersist }) {
    const qRef = useRef(null);
    const aRef = useRef(null);
    const syncHeights = useCallback(() => {
        const q = qRef.current;
        const a = aRef.current;
        if (!q || !a) return;
        q.style.height = 'auto';
        a.style.height = 'auto';
        const h = Math.max(q.scrollHeight, a.scrollHeight);
        q.style.height = h + 'px';
        a.style.height = h + 'px';
    }, []);
    useLayoutEffect(() => { requestAnimationFrame(() => syncHeights()); }, [p.question, p.answer, syncHeights]);
    useEffect(() => {
        const q = qRef.current;
        if (!q) return;
        const obs = new ResizeObserver(() => syncHeights());
        obs.observe(q);
        return () => obs.disconnect();
    }, [syncHeights]);

    return (
        <tr className="align-top">
            <td className="pr-1 py-0.5 border-t border-white/5">
                <textarea
                    ref={qRef}
                    rows={1}
                    value={p.question || ''}
                    onChange={e => { onUpdate(idx, 'question', e.target.value); syncHeights(); }}
                    onBlur={() => onPersist?.()}
                    onFocus={syncHeights}
                    placeholder="Pytanie…"
                    className="bg-black/20 border border-white/10 rounded px-1.5 py-0.5 text-[15px] w-full focus:outline-none focus:border-blue-500/50 placeholder-gray-700 text-gray-200"
                    style={{ overflow: 'hidden', minHeight: '1.4em', resize: 'none' }}
                />
            </td>
            <td className="pr-1 py-0.5 border-t border-white/5">
                <textarea
                    ref={aRef}
                    rows={1}
                    value={p.answer || ''}
                    onChange={e => { onUpdate(idx, 'answer', e.target.value); syncHeights(); }}
                    onBlur={() => onPersist?.()}
                    onFocus={syncHeights}
                    placeholder="Odpowiedź…"
                    className="bg-black/20 border border-white/10 rounded px-1.5 py-0.5 text-[15px] w-full focus:outline-none focus:border-blue-500/50 placeholder-gray-700 text-gray-200"
                    style={{ overflow: 'hidden', minHeight: '1.4em', resize: 'none' }}
                />
            </td>
            <td className="py-0.5 border-t border-white/5">
                <button
                    onClick={() => onRemove(idx)}
                    className="p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Usuń pytanie"
                >
                    <X size={9} />
                </button>
            </td>
        </tr>
    );
}

function QaCell({ pairs, onChange, onPersist }) {
    const list = Array.isArray(pairs) ? pairs : [];
    const update = (idx, field, value) => {
        onChange(list.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    };
    const remove = (idx) => { onChange(list.filter((_, i) => i !== idx)); onPersist?.(); };
    const add = () => { onChange([...list, { question: '', answer: '' }]); };

    return (
        <div className="flex flex-col gap-1">
            {list.length > 0 && (
                <table className="w-full text-[15px] border-collapse">
                    <thead>
                        <tr>
                            <th className="text-left font-semibold uppercase tracking-wider text-gray-500 pb-0.5 w-1/2">Pytanie</th>
                            <th className="text-left font-semibold uppercase tracking-wider text-gray-500 pb-0.5 w-1/2">Odpowiedź</th>
                            <th className="w-4" />
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((p, idx) => (
                            <QaPairRow
                                key={idx}
                                p={p}
                                idx={idx}
                                onUpdate={update}
                                onRemove={remove}
                                onPersist={onPersist}
                            />
                        ))}
                    </tbody>
                </table>
            )}
            <button
                onClick={add}
                className="self-start flex items-center gap-1 text-[14px] text-gray-600 hover:text-blue-400 transition-all"
            >
                <HelpCircle size={9} />
                <span>+ pytanie</span>
            </button>
        </div>
    );
}

// ── Q&A modal — pełnoekranowy edytor pytań/odpowiedzi (3/8 szerokości) ─────────
// Wąska kolumna w tabeli zawężała długie pytania do nieczytelności. Badge w
// kolumnie otwiera ten modal, w którym Pytanie/Odpowiedź mają pełną szerokość.
// @anchor qa-modal
function QaModal({ node, onChange, onPersist, onClose }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    const list = Array.isArray(node?.qa) ? node.qa : [];
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="relative bg-gray-950 border border-white/10 rounded-2xl shadow-2xl w-[37.5%] max-h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div>
                        <p className="text-[14px] uppercase tracking-widest text-gray-500 font-bold flex items-center gap-1.5">
                            <HelpCircle size={12} /> Pytania i odpowiedzi
                        </p>
                        <h2 className="text-base font-semibold text-white mt-0.5">{node?.name || 'Element WBS'}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-all" title="Zamknij (Esc)">
                        <X size={14} />
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 p-5">
                    <QaCell pairs={list} onChange={onChange} onPersist={onPersist} />
                </div>
            </div>
        </div>
    );
}
// ── Q&A gałęzi — read-only agregacja ─────────────────────────────────────────
// Zbiera (tylko do odczytu) wszystkie niepuste pary Q&A z poddrzewa węzła —
// wyłącznie dzieci i głębiej, pomijając sam węzeł. Zwraca [{ id, name, depth, pairs }].
// @anchor collect-branch-qa
function collectBranchQa(node, depth = 0, acc = []) {
    for (const child of (node?.children || [])) {
        const pairs = (Array.isArray(child.qa) ? child.qa : [])
            .filter(p => (p?.question || '').trim() || (p?.answer || '').trim());
        if (pairs.length) acc.push({ id: child.id, name: child.name || 'Element WBS', depth, pairs });
        collectBranchQa(child, depth + 1, acc);
    }
    return acc;
}

// Zbiera wypełnione komórki strategii potomków (liście + węzły pośrednie) jako
// [{ id, name, strategy }]. Węzeł top-level sam się pomija. Baza dla renderu (bold nazwa)
// i dla złożenia utrwalanego na top-level.
// @anchor collect-branch-strategy-entries
function collectBranchStrategyEntries(node) {
    const entries = [];
    const walk = (n) => {
        for (const child of (n?.children || [])) {
            const s = (child.strategy || '').trim();
            if (s) entries.push({ id: child.id, name: (child.name || 'Element WBS').trim(), strategy: s });
            walk(child);
        }
    };
    walk(node);
    return entries;
}

// Składa strategię całej gałęzi do utrwalenia na polu strategy węzła top-level (czytają je
// eksporty PDF/Excel). Format: `nazwa:` a strategia od nowego wiersza; wpisy rozdzielone
// pustą linią.
// @anchor compose-branch-strategy
function composeBranchStrategy(node) {
    return collectBranchStrategyEntries(node)
        .map(e => `${e.name}:\n${e.strategy}`)
        .join('\n\n');
}

// Read-only modal pokazujący wszystkie Q&A z gałęzi (dzieci danego węzła), grupowane
// po węźle. Czysty podgląd — bez textarea/onChange/zapisu (edycja nietknięta gdzie indziej).
// @anchor qa-branch-modal
function QaBranchModal({ node, onClose }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    const groups = collectBranchQa(node);
    const total = groups.reduce((s, g) => s + g.pairs.length, 0);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="relative bg-gray-950 border border-white/10 rounded-2xl shadow-2xl w-3/4 max-h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div>
                        <p className="text-[14px] uppercase tracking-widest text-gray-500 font-bold flex items-center gap-1.5">
                            <HelpCircle size={12} /> Q&A gałęzi — podgląd (read-only)
                        </p>
                        <h2 className="text-base font-semibold text-white mt-0.5">{node?.name || 'Element WBS'} · {total} {total === 1 ? 'pytanie' : 'pytań'}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-all" title="Zamknij (Esc)">
                        <X size={14} />
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-5">
                    {groups.length === 0 && (
                        <p className="text-gray-600 text-[15px] italic">Brak pytań i odpowiedzi w tej gałęzi.</p>
                    )}
                    {groups.map(g => (
                        <div key={g.id} style={{ marginLeft: `${g.depth * 16}px` }}>
                            <p className="text-[14px] font-bold text-blue-300/80 mb-1.5">{g.name}</p>
                            <table className="w-full text-[15px] border-collapse">
                                <thead>
                                    <tr>
                                        <th className="text-left font-semibold uppercase tracking-wider text-gray-500 pb-0.5 w-1/2">Pytanie</th>
                                        <th className="text-left font-semibold uppercase tracking-wider text-gray-500 pb-0.5 w-1/2">Odpowiedź</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {g.pairs.map((p, i) => (
                                        <tr key={i} className="align-top">
                                            <td className="pr-2 py-1 border-t border-white/5 text-gray-200 whitespace-pre-wrap break-words">{p.question || '—'}</td>
                                            <td className="pr-2 py-1 border-t border-white/5 text-gray-300 whitespace-pre-wrap break-words">{p.answer || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

import { UNIT_OPTIONS, sanitizeQtyInput, evalQtyFormula, suggestDefaultUnit, getLeafDefaultFrom, DRAWER } from './wbsConstants';
import { ProductCard } from './WbsMaterialsPanel';
import { offerLockInputProps } from '../OfferLockGuard';

const API_URL = '/api';

// ─── MaterialReqExpandPanel ───────────────────────────────────────────────────

function MaterialReqExpandPanel({ node, req, processNodeId, versionId, onSaved, onDeleteNode, onNodeFieldSave, onNodeFieldLocal, reqsLoaded, offerLocked = false }) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const headers = React.useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    const [card, setCard] = React.useState(req || null);
    const [materialDb, setMaterialDb] = React.useState([]);
    const [offers, setOffers] = React.useState([]);

    // @anchor mat-req-reload-seq — numer ostatniego żądania GET karty. Odpowiedzi potrafią wrócić
    // w innej kolejności niż wysłane (na produkcji, przy realnym opóźnieniu sieci); starsza
    // odpowiedź nadpisywała wtedy świeższy stan i pola panelu wracały do poprzednich wartości.
    const reloadSeq = React.useRef(0);
    // `opts.silent` — odśwież tylko tę kartę, bez bumpu reqRefreshKey i przeładowania drzewa WBS.
    const reloadCard = React.useCallback(async (opts) => {
        if (!card?.id) return;
        const seq = ++reloadSeq.current;
        const res = await fetch(`${API_URL}/material-requirements/${card.id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const updated = await res.json();
        if (seq !== reloadSeq.current) return; // wyprzedzona przez nowsze żądanie — odrzuć
        setCard(updated);
        onSaved?.(updated, opts);
    }, [card?.id, token, onSaved]);

    // Jeśli nie ma karty — utwórz ją automatycznie (tylko gdy naprawdę nie istnieje).
    // WAŻNE: versionId=null (baseline), nie snapshot — requirement musi być widoczny we wszystkich wersjach.
    // Snapshot-owe wersjoowanie WBS klonuje węzły (nowe UUID), więc `req` lookup po wbsNodeId
    // zawodzi dla snapshot-ów. Fallback po nazwie (matReqByName) jest obsługiwany przez rodzica przed
    // przekazaniem `req` do panelu, więc tutaj docieramy tylko gdy requirement faktycznie nie istnieje.
    // reqsLoaded pilnuje, żeby auto-create nie odpalił się zanim rodzic skończy pierwszy fetch
    // material-requirements/node/{processNodeId} — inaczej `req` bywa chwilowo null i powstaje
    // duplikat (ghost-requirement), bo prawdziwe wymaganie i tak zaraz przyjdzie z fetcha.
    React.useEffect(() => {
        if (card) { if (req) setCard(req); return; }
        if (!node.id || !reqsLoaded) return;
        const reqType = wbsTypeFromAny(node.type) === 'equipment' ? 'equipment' : 'material';
        fetch(`${API_URL}/material-requirements`, {
            method: 'POST', headers,
            body: JSON.stringify({
                nodeId: processNodeId, versionId: null, name: node.name, type: reqType,
                quantity: node.quantity || 1, unit: node.unit || 'sztuki', wbsNodeId: node.id,
            }),
        }).then(r => r.ok ? r.json() : null).then(data => { if (data) { setCard(data); onSaved?.(data); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id, reqsLoaded]);

    // `req` z rodzica nadpisuje kartę tylko gdy istnieje. Chwilowe null (rozwiązanie węzeł→wymaganie
    // nie trafia po odświeżeniu listy) zwijało cały panel do „Tworzenie karty materiałowej…" —
    // to właśnie wyglądało jak restart widoku w trakcie wypełniania.
    React.useEffect(() => { if (req) setCard(req); }, [req]);

    React.useEffect(() => {
        const auth = { Authorization: `Bearer ${token}` };
        fetch(`${API_URL}/material-requirements/all-materials`, { headers: auth }).then(r => r.ok ? r.json() : []).then(setMaterialDb);
        fetch(`${API_URL}/offers/node/${processNodeId}`, { headers: auth }).then(r => r.ok ? r.json() : []).then(setOffers);
    }, [processNodeId, token]);

    const handleDelete = async () => {
        if (!window.confirm(`Usunąć pozycję „${node.name}" z WBS i wymagania materiałowe?`)) return;
        if (card?.id) await fetch(`${API_URL}/material-requirements/${card.id}`, { method: 'DELETE', headers });
        onDeleteNode?.();
    };

    // Cena z ProductCard → budżet WBS. Aktualizuje lokalny wbsTree (żeby wiersz liścia od razu
    // pokazał nową cenę, nie starą do przeładowania) + persystuje unitCost na węźle ORAZ priceNetto
    // na karcie materiałowej (inaczej KOSZT JEDN wraca do starej wartości po onRefresh).
    const handlePropagatePrice = React.useCallback(async (c, w, price) => {
        onNodeFieldLocal?.(node.id, 'unitCost', price);
        if (c?.id) {
            setCard(prev => (prev ? { ...prev, priceNetto: price } : prev));
            await fetch(`${API_URL}/material-requirements/${c.id}`, {
                method: 'PATCH', headers, body: JSON.stringify({ priceNetto: price }),
            });
        }
        // await, nie fire-and-forget: updateNodeField robi PATCH /budget i dopiero potem
        // refreshWbsNodes. Bez oczekiwania odczyty odpalone przez wołającego wyprzedzały ten
        // zapis i cena w karcie oraz w kolumnie WBS wracała do poprzedniej wartości.
        await onNodeFieldSave?.(node.id, 'unitCost', price);
    }, [node.id, headers, onNodeFieldLocal, onNodeFieldSave]);

    return (
        // Szuflada rozwiniętego liścia — ten sam wygląd co w panelu Materiały (`DRAWER`):
        // płaszczyzna karty, niebieski kręgosłup przy krawędzi i nagłówek 10 px. `ml-8` zostaje,
        // bo drzewo WBS jest wcięte i szuflada musi trzymać się swojego liścia.
        <div className={`${DRAWER.spine} ${DRAWER.accent.offer.spine} ml-8`}>
            <div className={`${DRAWER.head} pb-1`}>
                <span className={`${DRAWER.label} ${DRAWER.accent.offer.label}`}>karta produktu</span>
                <span className={DRAWER.name}>{node.name}</span>
                <button
                    onClick={handleDelete}
                    className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                >
                    <Trash2 size={10} /> Usuń z WBS
                </button>
            </div>
            {card ? (
                <ProductCard
                    card={card}
                    wbsNode={{ id: node.id, name: node.name, quantity: node.quantity }}
                    token={token}
                    materialDb={materialDb}
                    offers={offers}
                    onRefresh={reloadCard}
                    onPropagatePrice={handlePropagatePrice}
                    readOnly={false}
                    offerLocked={offerLocked}
                />
            ) : (
                <div className="px-4 py-3 text-[14px] text-gray-600">Tworzenie karty materiałowej…</div>
            )}
        </div>
    );
}

const STRUCT_STATUS_META = {
    '':        { label: 'Brak',         style: 'bg-transparent text-gray-600 border-transparent' },
    NEW:       { label: 'Nowy',         style: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
    PENDING:   { label: 'Oczekuje',     style: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    PROPOSAL:  { label: 'Propozycja',   style: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    CONFIRMED: { label: 'Potwierdzone', style: 'bg-green-500/20 text-green-300 border-green-500/30' },
    REJECTED:  { label: 'Odrzucone',    style: 'bg-red-500/20 text-red-300 border-red-500/30' },
    ORDERED:   { label: 'Zamówione',    style: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
    EXTRA_ORDER: { label: 'Dodatkowe zamówienie', style: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30' },
    IN_STOCK:  { label: 'Na magazynie', style: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
    ISSUED:    { label: 'Wydane',       style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    DONE:      { label: 'Wykonane',     style: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
    INSTALLED: { label: 'Zainstalowane', style: 'bg-lime-500/20 text-lime-300 border-lime-500/30' },
    MIXED:     { label: 'Mieszany',     style: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
};

// @anchor work-struct-status-meta — te same kody i etykiety co `WORK_STATUS_META`
// (wbsConstants), tylko w plakietkowym kształcie tej tabeli. Etykiety biorę stamtąd,
// a nie przepisuję: piąta kopia listy statusów była dokładnie tym, co poprzednio
// rozjechało widoki i kazało drukować surowy kod zamiast nazwy.
const WORK_STRUCT_STATUS_META = {
    NEW:        { label: WORK_STATUS_META.NEW.label,        style: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
    STARTED:    { label: WORK_STATUS_META.STARTED.label,    style: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    ON_HOLD:    { label: WORK_STATUS_META.ON_HOLD.label,    style: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    COMPLETED:  { label: WORK_STATUS_META.COMPLETED.label,  style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    UNFINISHED: { label: WORK_STATUS_META.UNFINISHED.label, style: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    CANCELLED:  { label: WORK_STATUS_META.CANCELLED.label,  style: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

// @anchor struct-status-meta-for — plakietki właściwe dla typu liścia: praca, usługa,
// nocleg i paliwo idą własnym słownikiem, reszta drzewa zostaje na materiałowym.
const structStatusMetaFor = (type) => (usesWorkStatuses(type) ? WORK_STRUCT_STATUS_META : STRUCT_STATUS_META);

// Eksportowane nazwanym eksportem (jak `ConfirmDeleteModal`), żeby harness
// `test/status-dropdowns.html` renderował PRAWDZIWY select, a nie jego kopię — kopia
// przeszłaby test także wtedy, gdyby lista statusów w komponencie się rozjechała.
export { STRUCT_STATUS_META, WORK_STRUCT_STATUS_META };
// `type` decyduje, KTÓRY słownik statusów widzi użytkownik. Bez niego select spada na
// materiałowy — tak samo jak przed rozdzieleniem list — więc każde wywołanie musi go podać.
export function StatusSelect({ value, onChange, onKeyDown, type = '', ...rest }) {
    const map = structStatusMetaFor(type);
    // Kod spoza słownika tego typu (pozycja sprzed rozdzielenia list ma na pracy `PENDING`)
    // pokazuje się jako „Nowe"; dopiero ręczna zmiana utrwala kod z nowego słownika.
    const code = usesWorkStatuses(type) ? resolveStatusCode(type, value) : (value || '');
    const meta = map[code] || map[''] || map.NEW;
    return (
        <select
            value={code}
            onChange={e => onChange(e.target.value)}
            className={`text-[14px] px-2 py-0.5 rounded-lg border font-medium bg-black/40 cursor-pointer focus:outline-none focus:ring-0 transition-colors ${meta.style}`}
            onClick={e => e.stopPropagation()}
            onKeyDown={onKeyDown}
            {...rest}
        >
            {Object.entries(map)
                .filter(([c]) => c !== 'MIXED')
                .map(([c, { label }]) => (
                <option key={c} value={c} className="bg-gray-900 text-white">{label}</option>
            ))}
        </select>
    );
}

function InheritedStatusBadge({ status }) {
    const meta = STRUCT_STATUS_META[status];
    if (!meta) return <span className="text-[14px] px-2 py-0.5 rounded-lg border font-medium bg-black/40 text-gray-500 border-gray-600/30 flex items-center gap-1 w-max"><Link size={8}/> {status}</span>;
    return <span title="Status dziedziczony z zapotrzebowania" className={`text-[14px] px-2 py-0.5 rounded-lg border font-medium bg-black/40 flex items-center gap-1 w-max cursor-default ${meta.style}`}><Link size={8}/> {meta.label}</span>;
}

// Node types: 'project' (root), 'product' (przedmiot projektu), 'material'|'work'|'service' (typy pracy)
// @anchor mk-node — `type` podany od razu (liść Paliwo, gałąź gwarancyjna) decyduje o statusie
// startowym: praca, usługa, nocleg i paliwo rodzą się jako „Nowe", reszta jak dotąd „Oczekuje".
// Węzeł bez typu zostaje na materiałowym `PENDING` — typ nadaje mu się dopiero w tabeli,
// a od tej chwili `resolveStatusCode` pokazuje właściwą etykietę bez ruszania bazy.
const mkNode = (withDefaults = false, type = '') => {
    const id = crypto.randomUUID();
    return {
        id,
        name: '',
        status: defaultStatusForType(type),
        quantity: '',
        unit: 'sztuki',
        owner: '',
        resources: '',
        cost: '',
        tags: [],
        qa: [],
        type,
        comment: '',
        strategy: '',
        children: [],
    };
};

// ── Recursive tree helpers ────────────────────────────────────────────────────
const updateField = (nodes, id, field, value) =>
    nodes.map(n => n.id === id
        ? { ...n, [field]: value }
        : { ...n, children: updateField(n.children || [], id, field, value) }
    );

const deleteNode = (nodes, id) =>
    nodes.filter(n => n.id !== id)
         .map(n => ({ ...n, children: deleteNode(n.children || [], id) }));

const collectIds = (nodes, id) => {
    for (const n of nodes) {
        if (n.id === id) {
            const ids = [n.id];
            for (const c of (n.children || [])) ids.push(...collectIds([c], c.id));
            return ids;
        }
        const found = collectIds(n.children || [], id);
        if (found.length) return found;
    }
    return [];
};

const addChildTo = (nodes, parentId, child) =>
    nodes.map(n => n.id === parentId
        ? { ...n, children: [...(n.children || []), child] }
        : { ...n, children: addChildTo(n.children || [], parentId, child) }
    );

const findNode = (nodes, id) => {
    for (const n of nodes) {
        if (n.id === id) return n;
        const found = findNode(n.children || [], id);
        if (found) return found;
    }
    return null;
};

// @anchor find-depth
const findDepth = (nodes, id, depth = 0) => {
    for (const n of nodes) {
        if (n.id === id) return depth;
        const found = findDepth(n.children || [], id, depth + 1);
        if (found != null) return found;
    }
    return null;
};

const subtreeContains = (node, id) =>
    node.id === id || (node.children || []).some(c => subtreeContains(c, id));

const extractNode = (nodes, id) => {
    let found = null;
    const clean = arr => arr.reduce((acc, n) => {
        if (n.id === id) { found = n; return acc; }
        return [...acc, { ...n, children: clean(n.children || []) }];
    }, []);
    const cleaned = clean(nodes); // musi być przed odczytem `found` — literał tablicy [found, clean(nodes)] czyta found PRZED wywołaniem clean
    return [found, cleaned];
};

const deepCloneNode = node => ({
    ...node,
    id: crypto.randomUUID(),
    children: (node.children || []).map(deepCloneNode),
});

// Wariant zwracający również mapping (oldId → newId) całego poddrzewa,
// potrzebny do skopiowania powiązanych wymagań technicznych po stronie backendu.
// @anchor clone-dropped-tags — tagi, które NIE mogą przejechać na klon: wskazują kartę
// produktową węzła źródłowego. Nową kartę zakłada `clone-for-wbs`, ono też dopisuje
// węzłowi świeży `req:`.
const isTagDroppedOnClone = (t) =>
    typeof t === 'string' && (t.startsWith('req:') || t === 'auto-requirement');

// @anchor deep-clone-node-with-mappings
// Klon liścia lub gałęzi: nowe UUID i tagi OCZYSZCZONE ze wskaźników na kartę produktową.
// `{ ...n }` kopiuje wszystkie pola, więc `req:<id-źródła>` jechał ze spreadem i wklejony
// węzeł wskazywał kartę oryginału — edycja wymagań technicznych, statusu czy dostawcy na
// kopii lądowała na pozycji, z której kopiowano. Od momentu wklejenia obie pozycje mają być
// niezależne: wspólny może być produkt katalogowy, nigdy pola karty.
const deepCloneNodeWithMappings = (node) => {
    const mappings = [];
    const cloneRec = (n) => {
        const newId = crypto.randomUUID();
        mappings.push({ sourceWbsNodeId: n.id, targetWbsNodeId: newId });
        return {
            ...n,
            id: newId,
            tags: Array.isArray(n.tags) ? n.tags.filter(t => !isTagDroppedOnClone(t)) : n.tags,
            children: (n.children || []).map(cloneRec),
        };
    };
    return { clone: cloneRec(node), mappings };
};

const insertNode = (nodes, targetId, node, position) => {
    if (position === 'into') {
        return nodes.map(n => n.id === targetId
            ? { ...n, children: [...(n.children || []), node] }
            : { ...n, children: insertNode(n.children || [], targetId, node, position) }
        );
    }
    const result = [];
    for (const n of nodes) {
        if (n.id === targetId && position === 'before') result.push(node);
        result.push({ ...n, children: insertNode(n.children || [], targetId, node, position) });
        if (n.id === targetId && position === 'after') result.push(node);
    }
    return result;
};

// ── Stats ─────────────────────────────────────────────────────────────────────
// @anchor sum-children-cost
// Koszt węzła = własny Q×unitCost + suma dzieci.
// Węzeł grupujący (type=group) jest czystym agregatorem — liczy TYLKO sumę dzieci,
// nigdy własną cenę, nawet jeśli ma niezerowe unitCost/margin (spójne z buildRows(VIEWS.BUDGET),
// offerRevenueTotal i backendowym zerowaniem pól cenowych dla type=group).
const sumChildrenCost = node => {
    const kids = node.children || [];
    if (node.type === 'group') return kids.reduce((a, c) => a + sumChildrenCost(c), 0);
    const own = (parseFloat(node.unitCost) || 0) * (parseFloat(node.quantity) || 0);
    if (!kids.length) return own;
    return own + kids.reduce((a, c) => a + sumChildrenCost(c), 0);
};

// @anchor sum-children-offer-price
// Cena ofertowa węzła = własna (ilość×koszt×narzut, jak w budżecie) + suma dzieci.
// Formuła identyczna z BudgetTable.calcDerived: brak narzutu → 0, potem opcjonalny rabat.
// Węzeł grupujący (type=group) jest czystym agregatorem — patrz sumChildrenCost.
const sumChildrenOfferPrice = node => {
    const kids = node.children || [];
    if (node.type === 'group') return kids.reduce((a, c) => a + sumChildrenOfferPrice(c), 0);
    const cost = (parseFloat(node.unitCost) || 0) * (parseFloat(node.quantity) || 0);
    const marginRaw = node.margin != null && node.margin !== '' ? parseLocaleNumber(String(node.margin)) : null;
    const disc = Math.max(0, parseLocaleNumber(String(node.discount ?? '')) ?? 0);
    let own = (marginRaw !== null && marginRaw !== 0) ? cost * (1 + marginRaw / 100) : 0;
    if (own > 0 && disc > 0) own = Math.max(0, own * (1 - disc / 100));
    if (!kids.length) return own;
    return own + kids.reduce((a, c) => a + sumChildrenOfferPrice(c), 0);
};

// ── Depth visual config ───────────────────────────────────────────────────────
const DEPTH_SIZE = [
    'text-base font-bold uppercase',
    'text-base',
    'text-base',
    'text-base',
];
const MAX_DEPTH = DEPTH_SIZE.length - 1;

// Złoty kąt (137.508°) rozdziela barwy sąsiednich gałęzi maksymalnie od siebie.
// Głębszy poziom = wyższe nasycenie i nieprzezroczystość tła.
const GOLDEN_ANGLE = 137.508;
function getBranchStyle(rootIndex, depth) {
    const hue = (rootIndex * GOLDEN_ANGLE) % 360;
    const d = Math.min(depth, 3);
    const sat    = [55, 62, 68, 75][d];
    const alpha  = [0.06, 0.11, 0.17, 0.23][d];
    const alphaH = [0.11, 0.17, 0.24, 0.32][d];
    const bw     = [3, 2, 2, 1][d];
    const bSat   = [65, 68, 70, 73][d];
    const bAlpha = [0.70, 0.55, 0.40, 0.28][d];
    const nSat   = [90, 80, 75, 70][d];
    const nL     = [92, 88, 85, 82][d];
    const fSat   = [50, 55, 60, 65][d];
    const fL     = [78, 74, 70, 67][d];
    return {
        trStyle: {
            '--wbs-bg':  `hsla(${hue|0},${sat}%,55%,${alpha})`,
            '--wbs-bgh': `hsla(${hue|0},${sat}%,55%,${alphaH})`,
            '--wbs-bc':  `hsla(${hue|0},${bSat}%,65%,${bAlpha})`,
            '--wbs-bw':  `${bw}px`,
            '--wbs-nc':  `hsl(${hue|0},${nSat}%,${nL}%)`,
            '--wbs-fc':  `hsl(${hue|0},${fSat}%,${fL}%)`,
        },
        // @anchor wbs-branch-spine — kolor kręgosłupa szuflady. Pełne nasycenie i stała
        // grubość niezależnie od głębokości: kręgosłup ma powiedzieć „to jest jeden blok",
        // a nie „to jest poziom N" (od poziomu jest tło i lewa krawędź wiersza).
        spine: `hsla(${hue|0},72%,66%,0.9)`,
    };
}
// CSS wstrzyknięte raz — hover i kolory przez custom properties na <tr>
// @anchor wbs-drawer-css — szuflada rozwiniętej gałęzi: ten sam pomysł co rozwinięty wiersz
// w panelu Materiały. Gałąź, którą otwarto, jest nagłówkiem szuflady (jaśniejsze tło + górna
// krawędź), całe jej pod-drzewo — gałęzie i liście — dostaje wspólny kręgosłup przy lewej
// krawędzi, a domyka je listwa na dole. Zagnieżdżone otwarte gałęzie zostają przy kręgosłupie
// tej najbardziej zewnętrznej: wszystkie rysują się w tym samym miejscu (x=0 wiersza), więc
// własny kolor każdej z nich tylko migałby przy zwijaniu.
const WBS_BRANCH_CSS = `.wbs-br{background-color:var(--wbs-bg);border-left:var(--wbs-bw) solid var(--wbs-bc);transition:background-color .12s}.wbs-br:hover{background-color:var(--wbs-bgh)}.wbs-br .wbs-name{color:var(--wbs-nc)}.wbs-br .wbs-field{color:var(--wbs-fc)}`
    + `.wbs-br.wbs-drawer,.wbs-drawer-row{border-left:3px solid var(--wbs-spine)}`
    + `.wbs-br.wbs-drawer-head{background-color:var(--wbs-bgh);border-top:1px solid var(--wbs-spine)}`
    // Domknięcie szuflady to PEŁNA listwa w kolorze kręgosłupa, nie krawędź 2 px pod pustym
    // wierszem — ta ginęła między wierszami tabeli i nie było widać, gdzie gałąź się kończy.
    // Ta sama grubość i ten sam zabieg co `materials-group-cap` / `realization-drawer-cap`.
    + `.wbs-drawer-end{border-left:3px solid var(--wbs-spine)}`
    + `.wbs-drawer-end td{height:4px;padding:0;background-color:var(--wbs-spine)}`;

// ── Tag chips ─────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function TagChips({ tags = [], tagColor, onRemove, onTagClick }) {
    const visible = tags.map((t, i) => ({ tag: t, idx: i })).filter(({ tag }) =>
        !UUID_RE.test(tag) && !String(tag).startsWith('req:') && tag !== 'auto-requirement');
    return (
        <div className="flex flex-nowrap gap-1 overflow-hidden max-w-full">
            {visible.map(({ tag, idx }) => (
                <span key={idx} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[14px] font-medium border ${tagColor}`}>
                    <Tag size={8} className="flex-shrink-0" />
                    <span>{tag}</span>
                    {onTagClick && (
                        <button
                            onClick={e => { e.stopPropagation(); onTagClick(tag); }}
                            className="hover:opacity-70 transition-opacity"
                            title="Szczegóły / Schemat"
                        >
                            <ExternalLink size={8} />
                        </button>
                    )}
                    {onRemove && (
                        <button
                            onClick={e => { e.stopPropagation(); onRemove(idx); }}
                            className="hover:opacity-70 transition-opacity"
                        >
                            <X size={8} />
                        </button>
                    )}
                </span>
            ))}
        </div>
    );
}

// ── Attachment thumbnail ──────────────────────────────────────────────────────
function AttachmentThumb({ att, onClick }) {
    const url = `${API_URL}/schematics/file/${att.fileUrl}`;
    if (att.fileType === 'IMAGE') {
        return (
            <button onClick={e => { e.stopPropagation(); onClick(att); }} title={att.fileName}
                className="w-8 h-8 rounded overflow-hidden border border-white/10 hover:border-blue-500/60 transition-all flex-shrink-0 bg-black/20">
                <img src={url} alt={att.fileName} className="w-full h-full object-cover"
                    onError={e => { e.target.style.display = 'none'; }} />
            </button>
        );
    }
    const Icon = att.fileType === 'AUDIO' ? Volume2 : FileText;
    return (
        <button onClick={e => { e.stopPropagation(); onClick(att); }} title={att.fileName}
            className="w-8 h-8 rounded border border-white/10 hover:border-blue-500/60 transition-all flex-shrink-0 flex items-center justify-center bg-white/5">
            <Icon size={14} className="text-gray-400" />
        </button>
    );
}

// ── Marker Attachments Modal ──────────────────────────────────────────────────
function MarkerAttachmentsModal({ wbsNodeId, wbsNodeName, processNodeId, onClose }) {
    const [links, setLinks] = useState([]);
    const [allSchematics, setAllSchematics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingPicker, setLoadingPicker] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [previewAtt, setPreviewAtt] = useState(null);

    const fetchLinks = useCallback(async () => {
        const res = await fetch(`${API_URL}/schematics/wbs-node-markers/${wbsNodeId}`);
        if (res.ok) setLinks(await res.json());
    }, [wbsNodeId]);

    useEffect(() => {
        setLoading(true);
        fetchLinks().finally(() => setLoading(false));
    }, [fetchLinks]);

    const openPicker = async () => {
        setShowPicker(true);
        setLoadingPicker(true);
        const res = await fetch(`${API_URL}/schematics/process-node-markers/${processNodeId}`);
        if (res.ok) setAllSchematics(await res.json());
        setLoadingPicker(false);
    };

    const assign = async (markerId) => {
        await fetch(`${API_URL}/schematics/wbs-node-markers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wbsNodeId, markerId }),
        });
        await fetchLinks();
    };

    const unlink = async (linkId) => {
        await fetch(`${API_URL}/schematics/wbs-node-markers/${linkId}`, { method: 'DELETE' });
        setLinks(prev => prev.filter(l => l.id !== linkId));
    };

    const linkedMarkerIds = new Set(links.map(l => l.markerId));
    const allMarkers = allSchematics.flatMap(s => (s.markers || []).map(m => ({ ...m, schematicName: s.fileName })));

    return (
        <>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="relative bg-gray-950 border border-white/10 rounded-2xl shadow-2xl w-[680px] max-h-[80vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div>
                        <p className="text-[14px] uppercase tracking-widest text-gray-500 font-bold">Znaczniki WBS</p>
                        <h2 className="text-base font-semibold text-white mt-0.5">{wbsNodeName || 'Element WBS'}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={openPicker}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-[15px] font-medium transition-all">
                            <Link size={11} /> Przypisz znacznik
                        </button>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-all">
                            <X size={14} />
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 p-5 space-y-4">
                    {/* Picker */}
                    {showPicker && (
                        <div className="border border-white/10 rounded-xl bg-white/[0.02] p-4">
                            <p className="text-[14px] uppercase tracking-widest text-gray-500 font-bold mb-3">Dostępne znaczniki schematu</p>
                            {loadingPicker && <p className="text-base text-gray-600">Ładowanie...</p>}
                            {!loadingPicker && allMarkers.length === 0 && (
                                <p className="text-base text-gray-600 italic">Brak znaczników w schematach tego węzła</p>
                            )}
                            <div className="space-y-2">
                                {allMarkers.map(m => {
                                    const isLinked = linkedMarkerIds.has(m.id);
                                    return (
                                        <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-base text-white font-medium truncate">{m.name || m.note || `Znacznik (${m.type})`}</p>
                                                <p className="text-[14px] text-gray-600 truncate">{m.schematicName} · str. {m.pageNumber}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                {(m.attachments || []).slice(0, 3).map(att => (
                                                    <AttachmentThumb key={att.id} att={att} onClick={setPreviewAtt} />
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => isLinked ? null : assign(m.id)}
                                                disabled={isLinked}
                                                className={`px-2 py-1 rounded-lg text-[14px] font-medium transition-all flex items-center gap-1 ${
                                                    isLinked
                                                        ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
                                                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30'
                                                }`}
                                            >
                                                <Link size={9} /> {isLinked ? 'Przypisany' : 'Przypisz'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Current links */}
                    {loading && <p className="text-base text-gray-600">Ładowanie...</p>}
                    {!loading && links.length === 0 && !showPicker && (
                        <p className="text-base text-gray-600 italic text-center py-6">
                            Brak przypisanych znaczników. Kliknij „Przypisz znacznik" aby dodać.
                        </p>
                    )}
                    {links.map(link => {
                        const m = link.marker;
                        const atts = m?.attachments || [];
                        return (
                            <div key={link.id} className="border border-white/10 rounded-xl bg-white/[0.02] p-4">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div>
                                        <p className="text-base font-semibold text-white">{m?.name || m?.note || `Znacznik (${m?.type})`}</p>
                                        <p className="text-[14px] text-gray-500 mt-0.5">{m?.schematic?.fileName} · str. {m?.pageNumber}</p>
                                    </div>
                                    <button onClick={() => unlink(link.id)}
                                        className="p-1 rounded hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all flex-shrink-0" title="Odepnij">
                                        <Unlink size={12} />
                                    </button>
                                </div>
                                {atts.length === 0 && (
                                    <p className="text-[14px] text-gray-700 italic">Brak załączników do tego znacznika</p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {atts.map(att => (
                                        <div key={att.id} className="flex flex-col items-center gap-1">
                                            <AttachmentThumb att={att} onClick={setPreviewAtt} />
                                            <span className="text-[9px] text-gray-600 max-w-[32px] truncate">{att.fileName}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>

        {/* Full-screen attachment preview — poza modalem, żeby nie być ograniczonym jego stacking context */}
        {previewAtt && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95"
                onClick={() => setPreviewAtt(null)}>
                <div className="relative w-full h-full flex items-center justify-center p-6" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setPreviewAtt(null)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10 transition-all">
                        <X size={20} />
                    </button>
                    {previewAtt.fileType === 'IMAGE' ? (
                        <img src={`${API_URL}/schematics/file/${previewAtt.fileUrl}`}
                            alt={previewAtt.fileName}
                            className="max-w-full max-h-full rounded-xl object-contain" />
                    ) : previewAtt.fileType === 'AUDIO' ? (
                        <audio controls src={`${API_URL}/schematics/file/${previewAtt.fileUrl}`} />
                    ) : (
                        <div className="bg-gray-900 rounded-xl p-10 text-center">
                            <FileText size={56} className="text-gray-500 mx-auto mb-4" />
                            <p className="text-white text-base">{previewAtt.fileName}</p>
                            <a href={`${API_URL}/schematics/file/${previewAtt.fileUrl}`} target="_blank" rel="noreferrer"
                                className="mt-3 inline-block text-blue-400 text-base hover:underline">Otwórz plik</a>
                        </div>
                    )}
                    {previewAtt.note && (
                        <p className="absolute bottom-6 left-0 right-0 text-base text-gray-400 text-center">{previewAtt.note}</p>
                    )}
                </div>
            </div>
        )}
        </>
    );
}

// ── Attachment preview cell ───────────────────────────────────────────────────
function AttachmentCell({ wbsNodeId, nodeName, markerLinksCache, onOpenModal }) {
    const links = markerLinksCache[wbsNodeId] || [];

    const allAtts = links.flatMap(l => (l.marker?.attachments || []));
    if (allAtts.length === 0) return null;

    const open = (e) => { e?.stopPropagation?.(); onOpenModal({ wbsNodeId, wbsNodeName: nodeName }); };
    const hasImg = allAtts.some(a => a.fileType === 'IMAGE');
    const hasAudio = allAtts.some(a => a.fileType === 'AUDIO');
    const Icon = hasImg ? Image : hasAudio ? Volume2 : Paperclip;

    return (
        <button
            onClick={open}
            title={`${allAtts.length} załącznik(ów) — kliknij aby otworzyć`}
            className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-blue-400 transition-all"
        >
            <Icon size={18} />
        </button>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────
// @anchor wbs-hybrid-table
export default function WBSHybridTable({ wbsTree, setWbsTree, nodeName = 'Projekt', processNodeId, versionId, onSave, onTagClick, onTopLevelAdded, onNodesDeleted, onMaterialNodeCreated, users = [], projectContacts = [], onRequirementDrop = null, isManager = false, requirementsQtyByNode = {}, onRequirementsQtyChange, onNodeStatusChange, unassignedRequirements = [], onRequirementAssign, onNodeFieldSave = null, materialRefreshKey = 0, searchQuery = '', onMaterialReqUpdated = null, onPasteCloned = null, onNodeExpand = null, onRequirementMerge = null, onApplyLeafDefaults = null, leafDefaults = null, offerLocked = false }) {
    // @anchor wbs-hybrid-offer-lock — po akceptacji baseline kolumny Ilość / Koszt jedn. / Narzut %
    // przestają przyjmować wpis (każdy typ liścia); kliknięcie otwiera modal `OfferLockGuard`.
    const offerLockProps = offerLockInputProps(offerLocked);
    // @anchor wbs-hybrid-is-touch — na dotyku kolumna uchwytu zamienia się w duży przycisk
    // rozwijania (drag&drop HTML5 i tak nie działa palcem, więc uchwyt tylko zajmował miejsce).
    const { isTouch } = useDevice();
    const [expanded, setExpanded] = useState(() => new Set());
    const initialExpandDoneRef = useRef(false);
    // Domyślnie rozwiń tylko do 2. poziomu (root + węzły top-level) przy pierwszym
    // załadowaniu — kolejne fetch'e nie nadpiszą ręcznych collapse'ów (ref pilnuje).
    useEffect(() => {
        if (initialExpandDoneRef.current) return;
        const items = wbsTree?.items || [];
        if (items.length === 0) return;
        // Inicjalnie wszystkie gałęzie top-level zwinięte — żeby były wszystkie widoczne.
        // (Akordeon i tak ukrywa rodzeństwo gdy któraś jest rozwinięta — auto-expand pierwszej
        // ukrywał resztę domyślnych gałęzi: Zarządzanie projektem, Paliwo itd.)
        const ids = new Set(['root']);
        setExpanded(ids);
        initialExpandDoneRef.current = true;
    }, [wbsTree]);
    const [dragId, setDragId] = useState(null);
    const dragIdRef = useRef(null);
    const [dragOver, setDragOverState] = useState(null);
    const dragOverRef = useRef(null);
    const setDragOver = (val) => { dragOverRef.current = val; setDragOverState(val); };
    const [editingTagsFor, setEditingTagsFor] = useState(null);
    const [tagInput, setTagInput] = useState('');
    const [markerLinksCache, setMarkerLinksCache] = useState({});
    const [attachmentModal, setAttachmentModal] = useState(null); // { wbsNodeId, wbsNodeName }
    const tagInputRef = useRef(null);
    const [materialStatuses, setMaterialStatuses] = useState({});
    // @anchor mat-req-by-wbs-id
    // Mapa node→wymaganie. Klucze: wbsNodeId ORAZ MaterialRequirement.id (dla rozwiązywania liścia po tagu req:).
    const [matReqByWbsId, setMatReqByWbsId] = useState({});
    // @anchor mat-req-by-name
    // Fallback: gdy node nie ma tagu req: i wbsNodeId nie pasuje (np. snapshot lub stary węzeł),
    // szukamy requirement po nazwie. Zapobiega auto-tworzeniu ghost-requirements.
    const [matReqByName, setMatReqByName] = useState({});
    // @anchor mat-reqs-loaded
    // True dopiero po pierwszym fetch'u material-requirements/node/{processNodeId} — zapobiega
    // auto-create ghost-requirements w MaterialReqExpandPanel, jeśli user rozwinie panel wcześniej.
    const [matReqsLoaded, setMatReqsLoaded] = useState(false);
    const [expandedMaterialIds, setExpandedMaterialIds] = useState(new Set());
    const [reqDragOverNode, setReqDragOverNode] = useState(null);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [costFocusId, setCostFocusId] = useState(null);
    const [qtyFocusId, setQtyFocusId] = useState(null);
    const [warnKey, setWarnKey] = useState(null);
    const warnTimer = useRef(null);
    // @anchor twin-flash
    // Które pola właśnie przepisano z bliźniaka — podświetlane na 2 s, żeby zmiana ceny
    // czy typu nie wydarzyła się niezauważona. `{ id, fields: ['type','unit',...] }`.
    const [twinFlash, setTwinFlash] = useState(null);
    const twinFlashTimer = useRef(null);
    const [showBasket, setShowBasket] = useState(false);
    // Koszyk: id wymagań, dla których rozwinięto podgląd wymagań technicznych (przed przypisaniem).
    const [expandedBasketIds, setExpandedBasketIds] = useState(new Set());
    // Koszyk: id chipa-celu podświetlonego podczas przeciągania innego chipa (scalanie duplikatów).
    const [mergeOverId, setMergeOverId] = useState(null);
    const [copyBuffer, setCopyBuffer] = useState(null); // { node, sourceName }
    // @anchor add-task-node-state
    const [addTaskNode, setAddTaskNode] = useState(null); // { id, name } — węzeł dla którego otwarto modal dodawania zadania
    // @anchor qa-modal-node
    const [qaModalNode, setQaModalNode] = useState(null); // { id, name } — węzeł z otwartym modalem Q&A
    // @anchor qa-branch-node
    const [qaBranchNode, setQaBranchNode] = useState(null); // { id } — węzeł top-level z otwartym read-only podglądem Q&A całej gałęzi
    const [colWidths, setColWidths] = useState({ nazwa: 320, typ: 120, ilosc: 80, jednostka: 90, cena_netto: 100, narzut: 90, cena_ofert: 110, status: 128, wlasciciel: 128, komentarz: 200, strategia: 220, qa: 140, zalaczniki: 44 });
    const resizeDrag = useRef(null);
    // @anchor grid-nav-table-ref
    // Kontener tabeli — zawęża zapytania nawigacji klawiaturowej (grid-nav) do tego drzewa,
    // zamiast przeszukiwać cały document (poprzednia wersja gubiła fokus poza tabelą).
    const tableWrapperRef = useRef(null);

    const startColResize = (col, e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = colWidths[col] ?? 120;
        resizeDrag.current = { col, startX, startW };
        const onMove = (ev) => {
            if (!resizeDrag.current) return;
            const w = Math.max(60, resizeDrag.current.startW + ev.clientX - resizeDrag.current.startX);
            setColWidths(prev => ({ ...prev, [resizeDrag.current.col]: w }));
        };
        const onUp = () => { resizeDrag.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    // @anchor fetch-mat-seq — numer ostatniego fetcha listy wymagań; starsza odpowiedź (kolejny bump
    // materialRefreshKey wyprzedzony przez wolniejsze pierwsze żądanie) nie może nadpisać nowszej mapy.
    const fetchMatSeq = useRef(0);
    // materialStatuses kept for InheritedStatusBadge display only (no longer syncs to wbsTree)
    useEffect(() => {
        if (!processNodeId) return;
        const fetchMat = async () => {
            const seq = ++fetchMatSeq.current;
            try {
                const token = sessionStorage.getItem('token') || localStorage.getItem('token');
                const res = await fetch(`${API_URL}/material-requirements/node/${processNodeId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok && seq === fetchMatSeq.current) {
                    const data = await res.json();
                    const map = {};
                    const reqMap = {};
                    const nameMap = {};
                    data.forEach(r => {
                        if (r.name) map[r.name.toLowerCase()] = r.status;
                        if (r.wbsNodeId) reqMap[r.wbsNodeId] = r;
                        // Indeks też po ID wymagania: liść WBS łączy się z wymaganiem tagiem `req:<id>`,
                        // a wbsNodeId wskazuje gałąź-rodzica (cel dropa), nie liść. Bez tego klucza
                        // ProductCard liścia nie znajdował wymagania i pokazywał puste „Wymagania techniczne".
                        reqMap[r.id] = r;
                        // Fallback po nazwie — dla węzłów snapshot (klonowane ID) i starych węzłów bez req: taga.
                        if (r.name) nameMap[r.name.toLowerCase()] = r;
                    });
                    setMaterialStatuses(map);
                    setMatReqByWbsId(reqMap);
                    setMatReqByName(nameMap);
                }
            } catch (e) { console.warn('[WBS] fetchMat failed', e); }
            finally { setMatReqsLoaded(true); }
        };
        fetchMat();
    }, [processNodeId, materialRefreshKey]);

    const items = wbsTree?.items || [];

    // @anchor name-suggestion-pool
    // Nazwy z całego drzewa jako źródło podpowiedzi w kolumnie Nazwa, wraz z ustawieniami
    // bliźniaków (typ, jednostka, cena, narzut) do przepisania po zatwierdzeniu nazwy.
    // Memo po `items`, więc przelicza się przy każdej zmianie drzewa — zmierzone 1,5 ms
    // dla 2751 węzłów (test/test-name-autocomplete.mjs), czyli bez wpływu na pisanie.
    const nameSuggestionPool = React.useMemo(() => buildNameSuggestionPool(items), [items]);

    // Pre-fetch marker links for all WBS nodes (+ periodic refresh) — jedno zapytanie batch
    // zamiast N (po jednym na węzeł), inaczej drzewo 200 węzłów robiło 200 fetchy co 30s.
    const fetchMarkerLinks = useCallback(async () => {
        if (!processNodeId) return;
        const allIds = [];
        const collectAllIds = (nodes) => nodes.forEach(n => { allIds.push(n.id); collectAllIds(n.children || []); });
        collectAllIds(items);
        if (!allIds.length) return;
        try {
            const res = await fetch(`${API_URL}/schematics/wbs-node-markers/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wbsNodeIds: allIds }),
            });
            if (res.ok) {
                const byNode = await res.json();
                setMarkerLinksCache(byNode);
            }
        } catch (e) { console.warn('[WBS] fetchMarkerLinks failed', e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processNodeId, items.length]);

    useEffect(() => {
        fetchMarkerLinks();
        const iv = setInterval(fetchMarkerLinks, 30000);
        window.addEventListener('wbs-link-changed', fetchMarkerLinks);
        return () => { clearInterval(iv); window.removeEventListener('wbs-link-changed', fetchMarkerLinks); };
    }, [fetchMarkerLinks]);

    // Zwraca listę id węzłów będących rodzeństwem targetId (na tym samym poziomie w drzewie)
    const findSiblingIds = (nodes, targetId) => {
        for (const n of nodes) {
            if (n.id === targetId) return nodes.map(c => c.id);
            const found = findSiblingIds(n.children || [], targetId);
            if (found !== null) return found;
        }
        return null;
    };

    const toggle = (id, e) => {
        e?.stopPropagation();
        setExpanded(prev => {
            const s = new Set(prev);
            const wasOpen = s.has(id);
            if (wasOpen) {
                s.delete(id);
            } else {
                // Accordion: zamknij rodzeństwo na tym samym poziomie drzewa
                const nodeId = id.startsWith('node_') ? id.slice(5) : null;
                if (nodeId) {
                    const siblings = findSiblingIds(items, nodeId);
                    if (siblings) {
                        for (const sibId of siblings) {
                            if (sibId !== nodeId) s.delete(`node_${sibId}`);
                        }
                    }
                }
                s.add(id);
                onNodeExpand?.(id);
            }
            return s;
        });
    };
    const open = id => setExpanded(prev => new Set([...prev, id]));
    const isOpen = id => expanded.has(id);

    const save = newTree => { setWbsTree(newTree); setTimeout(() => onSave?.(), 0); };

    const handleField = (id, field, value) =>
        setWbsTree(t => ({ ...t, items: updateField(t.items || [], id, field, value) }));

    // Zapis strategii na węźle-elemencie (liść / węzeł pośredni): utrwala własną wartość,
    // po czym przelicza złożenie całej gałęzi i utrwala je na węźle top-level (depth 0).
    // Puste złożenie NIE nadpisuje istniejącej strategii top-level (ochrona starych danych).
    // @anchor save-leaf-strategy
    const saveLeafStrategy = (nodeId, value) => {
        onNodeFieldSave?.(nodeId, 'strategy', value);
        const nextItems = updateField(items, nodeId, 'strategy', value);
        const root = nextItems.find(r => subtreeContains(r, nodeId));
        if (!root) return;
        const composed = composeBranchStrategy(root);
        if (composed && composed !== (root.strategy || '')) {
            handleField(root.id, 'strategy', composed);
            onNodeFieldSave?.(root.id, 'strategy', composed);
        }
    };

    // Po usunięciu węzła przelicza złożenie strategii gałęzi top-level, do której należał
    // usunięty węzeł, i utrwala je (także czyści, gdy usunięto ostatni wpis strategii —
    // top-level jest read-only, więc bez tego stary wpis zostawał w eksportach i nie dało
    // się go poprawić). Chroni starą ręczną treść top-level: gdy złożenie puste, nadpisuje
    // tylko jeśli usunięte poddrzewo faktycznie zawierało strategię.
    // @anchor recompose-branch-strategy-after-delete
    const recomposeBranchStrategyAfterDelete = (deletedNode, prevRoots, nextItems) => {
        const root = prevRoots.find(r => subtreeContains(r, deletedNode.id));
        if (!root || root.id === deletedNode.id) return;
        const newRoot = nextItems.find(r => r.id === root.id);
        if (!newRoot) return;
        let deletedHadStrategy = false;
        const walk = n => { if ((n?.strategy || '').trim()) deletedHadStrategy = true; (n?.children || []).forEach(walk); };
        walk(deletedNode);
        const composed = composeBranchStrategy(newRoot);
        if (composed === (newRoot.strategy || '')) return;
        if (!composed && !deletedHadStrategy) return;
        handleField(newRoot.id, 'strategy', composed);
        onNodeFieldSave?.(newRoot.id, 'strategy', composed);
    };

    // @anchor apply-twin-defaults
    // Nazwa zatwierdzona (z podpowiedzi albo wpisana ręcznie) pokrywa się z pozycją już
    // obecną w drzewie → przepisujemy jej ustawienia: typ, jednostkę, cenę i narzut.
    // Zasada nadrzędna: WYPEŁNIAMY TYLKO PUSTE — nic, co użytkownik już wpisał, nie zostaje
    // nadpisane. `unit === 'sztuki'` liczy się jako puste, bo to wartość startowa nowego
    // węzła, tak samo traktuje ją podpowiadacz jednostki przy zmianie typu.
    // Zwraca true, gdy cokolwiek skopiowano — wtedy wołający pomija heurystykę jednostki,
    // bo jednostka realnego bliźniaka jest mocniejszą przesłanką niż zgadywanie z nazwy.
    const applyTwinDefaults = (node, depth, parentId) => {
        const twin = pickTwinDefaults(nameSuggestionPool, node.name, node.id);
        if (!twin) return false;
        const copied = [];
        // Typ: root (depth 0) nie ma kolumny Typ, więc nie ma czego kopiować.
        if (depth >= 1 && twin.type && !node.type) {
            handleField(node.id, 'type', twin.type);
            onNodeFieldSave?.(node.id, 'type', twin.type);
            copied.push('type');
            if (twin.type === 'work') ensureFuelLeaf(node.id);
            if ((twin.type === 'equipment' || twin.type === 'material') && node.name) {
                onMaterialNodeCreated?.({ wbsNodeId: node.id, name: node.name, type: twin.type, parentId });
            }
        }
        if (twin.unit && (!node.unit || node.unit === 'sztuki')) {
            handleField(node.id, 'unit', twin.unit);
            onNodeFieldSave?.(node.id, 'unit', twin.unit);
            copied.push('unit');
        }
        // Cena i narzut są zablokowane po akceptacji baseline — wtedy ich nie ruszamy.
        if (!offerLocked && twin.unitCost && !Number(node.unitCost)) {
            handleField(node.id, 'unitCost', twin.unitCost);
            onNodeFieldSave?.(node.id, 'unitCost', twin.unitCost);
            copied.push('unitCost');
        }
        if (!offerLocked && twin.margin && !Number(node.margin)) {
            handleField(node.id, 'margin', twin.margin);
            onNodeFieldSave?.(node.id, 'margin', twin.margin);
            copied.push('margin');
        }
        if (!copied.length) return false;
        setTwinFlash({ id: node.id, fields: copied });
        if (twinFlashTimer.current) clearTimeout(twinFlashTimer.current);
        twinFlashTimer.current = setTimeout(() => setTwinFlash(null), 2000);
        return copied.includes('unit');
    };

    // @anchor twin-flash-class
    // Podświetlenie komórki przepisanej z bliźniaka — bez tego cena czy typ zmieniłyby się
    // po wyjściu z pola nazwy zupełnie bezgłośnie.
    const twinFlashClass = (id, field) =>
        (twinFlash?.id === id && twinFlash.fields.includes(field))
            ? ' ring-1 ring-amber-400/70 bg-amber-500/10 rounded' : '';

    // Pokaż na chwilę ostrzeżenie "tylko cyfry" przy komórce liczbowej (klucz = `${id}:${field}`).
    const flashWarn = (id, field) => {
        setWarnKey(`${id}:${field}`);
        if (warnTimer.current) clearTimeout(warnTimer.current);
        warnTimer.current = setTimeout(() => setWarnKey(null), 2500);
    };

    const handleDelete = (id, e) => {
        e?.stopPropagation();
        if (!window.confirm('Usunąć ten węzeł i wszystkie podgałęzie?')) return;
        const deletedNode = findNode(items, id);
        const deletedIds = collectIds(items, id);
        const nextItems = deleteNode(items, id);
        save({ ...wbsTree, items: nextItems });
        if (deletedIds.length) onNodesDeleted?.(deletedIds);
        if (deletedNode) recomposeBranchStrategyAfterDelete(deletedNode, items, nextItems);
    };

    const handleAddChild = (parentId, e) => {
        e?.stopPropagation();
        const child = mkNode(false);
        setWbsTree(t => ({ ...t, items: addChildTo(t.items || [], parentId, child) }));
        open(`node_${parentId}`);
        setTimeout(() => onSave?.(), 0);
    };

    // @anchor build-fuel-leaf
    // Liść Paliwo z wartościami domyślnymi z modalu „Domyślne wartości” (jednostka,
    // cena, NARZUT). Wcześniej narzut nie był wypełniany — automatycznie dodane paliwo
    // wchodziło do oferty z pustym narzutem. Fallback: kilometry, 0,70 zł/km.
    const buildFuelLeaf = (extra = {}) => {
        const defs = getLeafDefaultFrom(leafDefaults, 'fuel') || {};
        const unit = defs.unit || 'kilometry';
        const unitCost = defs.unitCost != null && Number(defs.unitCost) !== 0 ? defs.unitCost : 0.7;
        const leaf = { ...mkNode(false, 'fuel'), name: 'Paliwo', unit, unitCost, ...extra };
        if (defs.margin != null) leaf.margin = defs.margin;
        return leaf;
    };

    // @anchor ensure-fuel-leaf
    // Każda gałąź typ=praca dostaje automatycznie liść Paliwo z domyślnymi
    // wartościami. Pomija gdy liść Paliwo już istnieje.
    const ensureFuelLeaf = (parentId) => {
        setWbsTree(t => {
            const parent = findNode(t.items || [], parentId);
            if (!parent || (parent.children || []).some(c => c.type === 'fuel')) return t;
            const fuel = buildFuelLeaf({ comment: 'utworzony automatycznie' });
            return { ...t, items: addChildTo(t.items || [], parentId, fuel) };
        });
        open(`node_${parentId}`);
        setTimeout(() => onSave?.(), 0);
    };

    // Przedmiot projektu nie dostaje już własnej gałęzi „Gwarancja 24m" — wizyta
    // gwarancyjna, paliwo, zarządzanie, dokumentacja powykonawcza i logistyka żyją
    // w gałęzi „Koszty ogólne" tworzonej raz na zlecenie (process-tree.service.ts).
    const handleAddTopLevel = e => {
        e?.stopPropagation();
        const item = mkNode(true);
        setWbsTree(t => ({ ...t, items: [...(t.items || []), item] }));
        open('root');
        open(`node_${item.id}`);
        setTimeout(() => {
            onSave?.();
            onTopLevelAdded?.(item);
        }, 0);
    };

    // ── Tags ──────────────────────────────────────────────────────────────────
    const addTag = (nodeId) => {
        const val = tagInput.trim();
        if (!val) return;
        const node = findNode(items, nodeId);
        const tags = [...(node?.tags || [])];
        if (!tags.includes(val)) {
            tags.push(val);
            handleField(nodeId, 'tags', tags);
            setTimeout(() => onSave?.(), 0);
        }
        setTagInput('');
        tagInputRef.current?.focus();
    };

    const removeTag = (nodeId, tagIndex) => {
        const node = findNode(items, nodeId);
        const tags = (node?.tags || []).filter((_, i) => i !== tagIndex);
        handleField(nodeId, 'tags', tags);
        setTimeout(() => onSave?.(), 0);
    };

    // ── Drag & Drop ───────────────────────────────────────────────────────────
    const onDragStart = (e, nodeId) => {
        e.stopPropagation();
        dragIdRef.current = nodeId;
        setDragId(nodeId);
        e.dataTransfer.effectAllowed = 'move';
        // Firefox wymaga setData żeby drag w ogóle wystartował
        try { e.dataTransfer.setData('application/wbs-node-id', nodeId); } catch {}
    };

    const onDragOver = (e, nodeId, depth) => {
        e.preventDefault();
        e.stopPropagation();
        const dragTypes = Array.from(e.dataTransfer?.types || []);
        if (isManager && onRequirementDrop && dragTypes.includes('application/requirement-id')) {
            setReqDragOverNode(nodeId);
            e.dataTransfer.dropEffect = 'copy';
            return;
        }
        const currentDragId = dragIdRef.current;
        if (!currentDragId || currentDragId === nodeId) return;
        const dragNode = findNode(items, currentDragId);
        if (dragNode && subtreeContains(dragNode, nodeId)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const relY = (e.clientY - rect.top) / rect.height;
        let position;
        if (relY < 0.25) position = 'before';
        else if (relY > 0.75) position = 'after';
        else position = depth < MAX_DEPTH ? 'into' : (relY < 0.5 ? 'before' : 'after');
        setDragOver({ nodeId, position });
        e.dataTransfer.dropEffect = 'move';
    };

    const onDragLeave = e => {
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setDragOver(null);
        setReqDragOverNode(null);
    };

    const onDrop = (e, nodeId) => {
        e.preventDefault();
        e.stopPropagation();
        if (isManager && onRequirementDrop) {
            const reqId = e.dataTransfer.getData('application/requirement-id');
            if (reqId) {
                setReqDragOverNode(null);
                onRequirementDrop(nodeId, reqId);
                return;
            }
        }
        const currentDragId = dragIdRef.current;
        const currentDragOver = dragOverRef.current;
        if (!currentDragId || !currentDragOver || currentDragOver.nodeId !== nodeId || currentDragId === nodeId) {
            dragIdRef.current = null; setDragId(null); setDragOver(null); return;
        }
        const [extracted, withoutDrag] = extractNode(items, currentDragId);
        if (!extracted) { dragIdRef.current = null; setDragId(null); setDragOver(null); return; }
        const newItems = insertNode(withoutDrag, nodeId, extracted, currentDragOver.position);
        save({ ...wbsTree, items: newItems });
        dragIdRef.current = null; setDragId(null); setDragOver(null);
    };

    const onDragEnd = () => { dragIdRef.current = null; setDragId(null); setDragOver(null); setReqDragOverNode(null); };

    // ── Przenoszenie palcem (Pointer Events) ──────────────────────────────────
    // HTML5 drag&drop nie dostaje z dotyku ŻADNYCH zdarzeń (ani Chrome na Androidzie,
    // ani Safari), więc na tablecie gest obsługujemy ręcznie. Stan (`dragIdRef`,
    // `dragOver`) i samo przeniesienie (`extractNode` + `insertNode`) są te same co przy
    // myszy — inna jest wyłącznie warstwa gestu, więc podświetlenia before/after/into
    // i wiersz-widmo działają bez zmian.
    // Uchwyt ma `touch-action: none`, dzięki czemu przeglądarka nie zabierze gestu na
    // przewijanie i nie trzeba wymuszać przytrzymania — chwyt jest natychmiastowy.
    // @anchor wbs-hybrid-pointer-drag
    const pointerDragRef = useRef(null);      // { pointerId, nodeId, startX, startY, moved }
    const autoScrollRafRef = useRef(0);
    const autoScrollSpeedRef = useRef(0);

    // Pętla dosuwania listy, gdy palec stoi przy krawędzi — bez niej nie da się przenieść
    // wiersza poza widoczny fragment tabeli (palec nie generuje wtedy żadnych zdarzeń).
    const autoScrollTick = () => {
        const wrap = tableWrapperRef.current;
        if (!pointerDragRef.current || !wrap) { autoScrollRafRef.current = 0; autoScrollSpeedRef.current = 0; return; }
        if (autoScrollSpeedRef.current) wrap.scrollTop += autoScrollSpeedRef.current;
        autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
    };

    // Wiersz pod palcem + miejsce zrzutu. Ta sama matematyka progów co w `onDragOver`.
    const pointerDropTargetAt = (x, y) => {
        const row = document.elementFromPoint(x, y)?.closest('tr[data-node-id]');
        if (!row) return null;
        const nodeId = row.dataset.nodeId;
        const depth = Number(row.dataset.depth || 0);
        const currentDragId = dragIdRef.current;
        if (!currentDragId || currentDragId === nodeId) return null;
        const dragNode = findNode(items, currentDragId);
        if (dragNode && subtreeContains(dragNode, nodeId)) return null;
        const rect = row.getBoundingClientRect();
        const relY = (y - rect.top) / rect.height;
        let position;
        if (relY < 0.25) position = 'before';
        else if (relY > 0.75) position = 'after';
        else position = depth < MAX_DEPTH ? 'into' : (relY < 0.5 ? 'before' : 'after');
        return { nodeId, position };
    };

    const onHandlePointerDown = (e, nodeId) => {
        if (e.pointerType === 'mouse') return;   // mysz zostaje na natywnym HTML5 DnD
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
        pointerDragRef.current = { pointerId: e.pointerId, nodeId, startX: e.clientX, startY: e.clientY, moved: false };
    };

    const onHandlePointerMove = (e) => {
        const st = pointerDragRef.current;
        if (!st || e.pointerId !== st.pointerId) return;
        // Próg 6 px — samo dotknięcie uchwytu (bez ruchu) nie ma podnosić wiersza.
        if (!st.moved) {
            if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < 6) return;
            st.moved = true;
            dragIdRef.current = st.nodeId;
            setDragId(st.nodeId);
            if (!autoScrollRafRef.current) autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
        }
        e.preventDefault();
        const wrap = tableWrapperRef.current;
        if (wrap) {
            const r = wrap.getBoundingClientRect();
            const EDGE = 56;
            if (e.clientY < r.top + EDGE) autoScrollSpeedRef.current = -Math.ceil((r.top + EDGE - e.clientY) / 4);
            else if (e.clientY > r.bottom - EDGE) autoScrollSpeedRef.current = Math.ceil((e.clientY - (r.bottom - EDGE)) / 4);
            else autoScrollSpeedRef.current = 0;
        }
        setDragOver(pointerDropTargetAt(e.clientX, e.clientY));
    };

    const finishPointerDrag = (e, commit) => {
        const st = pointerDragRef.current;
        if (!st || e.pointerId !== st.pointerId) return;
        pointerDragRef.current = null;
        autoScrollSpeedRef.current = 0;
        try { e.currentTarget.releasePointerCapture(st.pointerId); } catch {}
        const target = dragOverRef.current;
        const draggedId = dragIdRef.current;
        dragIdRef.current = null; setDragId(null); setDragOver(null);
        if (!commit || !st.moved || !target || !draggedId || target.nodeId === draggedId) return;
        const [extracted, withoutDrag] = extractNode(items, draggedId);
        if (!extracted) return;
        save({ ...wbsTree, items: insertNode(withoutDrag, target.nodeId, extracted, target.position) });
    };

    useEffect(() => () => { if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current); }, []);

    // ── Search filter ─────────────────────────────────────────────────────────
    const normalizedSearch = String(searchQuery || '').trim().toLowerCase();
    let searchVisibleIds = null;
    if (normalizedSearch) {
        // Etykieta statusu do szukania idzie przez słownik WŁAŚCIWY dla typu liścia — inaczej
        // wpisanie „nowe" nie znalazłoby ani jednej pozycji pracy, bo w bazie siedzi tam `PENDING`.
        const statusSearchLabel = (n) => {
            const map = structStatusMetaFor(n.type);
            const code = usesWorkStatuses(n.type) ? resolveStatusCode(n.type, n.status) : (n.status || '');
            return code ? (map[code]?.label || code).toLowerCase() : '';
        };
        const nodeMatchesSearch = (n) => {
            const fields = [n.name, n.type, statusSearchLabel(n), n.owner, n.unit, String(n.quantity ?? '')];
            return fields.some(f => String(f || '').toLowerCase().includes(normalizedSearch));
        };
        const matchingIds = new Set();
        const collectMatching = (nodes) => nodes.forEach(n => {
            if (nodeMatchesSearch(n)) matchingIds.add(n.id);
            collectMatching(n.children || []);
        });
        collectMatching(items);
        // Include ancestors of all matching nodes
        const nodeById = new Map();
        const buildMap = (nodes, parent = null) => nodes.forEach(n => { nodeById.set(n.id, { ...n, _parentId: parent }); buildMap(n.children || [], n.id); });
        buildMap(items);
        searchVisibleIds = new Set(matchingIds);
        for (const id of matchingIds) {
            let cur = nodeById.get(id);
            while (cur?._parentId) { searchVisibleIds.add(cur._parentId); cur = nodeById.get(cur._parentId); }
        }
    }

    const rows = [];
    const selectedDepth = selectedNodeId != null ? findDepth(items, selectedNodeId) : null;

    // ── Grid keyboard navigation (Excel-like) ────────────────────────────────
    // @anchor grid-nav-row-order
    // Kolejność renderowanych wierszy węzłów (node.id), wypełniana w trakcie renderNode —
    // pomija wiersze zwinięte/odfiltrowane przez wyszukiwarkę, więc Góra/Dół trafiają
    // tylko w faktycznie widoczne wiersze.
    const navRowOrder = [];
    // @anchor wbs-total-cols — liczba kolumn <col> tabeli: uchwyt + nazwa/typ/ilosc/jednostka
    // + (manager: cena_netto/narzut/cena_ofert) + status/wlasciciel/komentarz/strategia/qa/zalaczniki
    // + kolumna domykajaca. Wiersze rozpiete na calej szerokosci (szuflada karty produktu,
    // listwa domykajaca, pusty stan) MUSZA uzywac tej wartosci — zaszyty colSpan=12 obcinal
    // szuflade przed kolumnami Q&A i Attach., przez co karta byla wezsza niz wiersz drzewa.
    const TOTAL_COLS = isManager ? 15 : 12;
    // @anchor grid-nav-column-order
    const GRID_COLUMN_ORDER = ['nazwa', 'typ', 'ilosc', 'jednostka', ...(isManager ? ['cena_netto', 'narzut'] : []), 'status', 'wlasciciel', 'komentarz', 'strategia'];
    // @anchor handle-grid-key-down
    // Enter/strzałki nawigują między edytowalnymi komórkami jak w arkuszu kalkulacyjnym:
    // Enter/Dół/Góra = ta sama kolumna, sąsiedni wiersz; Lewo/Prawo = sąsiednia kolumna w wierszu.
    // W polach tekstowych strzałki Lewo/Prawo/Góra/Dół nawigują tylko gdy kursor jest na
    // brzegu tekstu — w przeciwnym razie poruszają kursorem tekstowym (zachowanie natywne).
    const handleGridKeyDown = (e, rowKey, colKey) => {
        const target = e.target;
        const isTextarea = target.tagName === 'TEXTAREA';
        const isTextInput = target.tagName === 'INPUT' && target.type === 'text';
        const isText = isTextarea || isTextInput;
        // selectionStart===0 (nie wymaga selectionEnd===0) obejmuje też stan "cały tekst zaznaczony"
        // (np. po onFocus robiącym e.target.select() w polach Ilość/Koszt) — w takim stanie strzałka
        // ma od razu nawigować między komórkami, tak jak w arkuszu, a nie tylko kolapsować zaznaczenie.
        const atStart = isText && target.selectionStart === 0;
        const atEnd = isText && target.selectionEnd === target.value.length;

        const focusCell = (r, c) => {
            const el = tableWrapperRef.current?.querySelector(`[data-nav-row="${CSS.escape(r)}"][data-nav-col="${c}"]`);
            if (!el) return false;
            el.focus();
            if (typeof el.select === 'function') el.select();
            return true;
        };
        const stepRow = (dir) => {
            const idx = navRowOrder.indexOf(rowKey);
            if (idx === -1) return false;
            for (let i = idx + dir; i >= 0 && i < navRowOrder.length; i += dir) {
                if (focusCell(navRowOrder[i], colKey)) return true;
            }
            return false;
        };
        const stepCol = (dir) => {
            const idx = GRID_COLUMN_ORDER.indexOf(colKey);
            if (idx === -1) return false;
            for (let i = idx + dir; i >= 0 && i < GRID_COLUMN_ORDER.length; i += dir) {
                if (focusCell(rowKey, GRID_COLUMN_ORDER[i])) return true;
            }
            return false;
        };

        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                stepRow(1);
                return;
            case 'ArrowDown':
                if (isTextarea && !atEnd) return;
                if (stepRow(1)) e.preventDefault();
                return;
            case 'ArrowUp':
                if (isTextarea && !atStart) return;
                if (stepRow(-1)) e.preventDefault();
                return;
            case 'ArrowRight':
                if (isText && !atEnd) return;
                if (stepCol(1)) e.preventDefault();
                return;
            case 'ArrowLeft':
                if (isText && !atStart) return;
                if (stepCol(-1)) e.preventDefault();
                return;
            default:
                return;
        }
    };

    // ── Root row ──────────────────────────────────────────────────────────────
    rows.push(
        <tr key="root" className="border-b border-white/5 bg-slate-900/50 hover:bg-slate-900/70 cursor-pointer select-none" onClick={e => toggle('root', e)} style={{ touchAction: 'manipulation' }}>
            <td className={isTouch ? 'p-0 text-center' : 'px-3 py-3'}>
                <ChevronRight size={isTouch ? 20 : 14} className={`inline-block text-gray-400 transition-transform ${isOpen('root') ? 'rotate-90' : ''}`} />
            </td>
            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-white uppercase tracking-wide">{nodeName}</span>
                    <button onClick={handleAddTopLevel} className="p-0.5 hover:bg-white/10 rounded text-gray-600 hover:text-blue-400 transition-all" title="Dodaj przedmiot projektu">
                        <Plus size={12} />
                    </button>
                </div>
            </td>
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            {isManager && (
                <td className="px-3 py-3 text-right font-bold text-white text-base" onClick={e => e.stopPropagation()}>
                    {fmtPLN(items.reduce((a, n) => a + sumChildrenCost(n), 0))}
                </td>
            )}
            {isManager && <td className="px-3 py-3" />}
            {isManager && (
                <td className="px-3 py-3 text-right font-bold text-green-400 text-base" onClick={e => e.stopPropagation()}>
                    {fmtPLN(items.reduce((a, n) => a + sumChildrenOfferPrice(n), 0))}
                </td>
            )}
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
        </tr>
    );

    // ── Recursive renderer ────────────────────────────────────────────────────
    // `spine` — kolor kręgosłupa szuflady odziedziczony po najbardziej zewnętrznej otwartej
    // gałęzi. null = ten wiersz nie siedzi w żadnej szufladzie.
    const renderNode = (node, depth, wbsPath, parentId = null, rootIndex = 0, spine = null) => {
        if (searchVisibleIds && !searchVisibleIds.has(node.id)) {
            (node.children || []).forEach((child, ci) => renderNode(child, depth + 1, `${wbsPath}.${ci + 1}`, node.id, rootIndex, spine));
            return;
        }
        const rowId = `node_${node.id}`;
        navRowOrder.push(node.id);
        const bs = getBranchStyle(rootIndex, depth);
        const hasChildren = (node.children || []).length > 0;
        // Szuflada zaczyna się na gałęzi, którą otwarto, i obejmuje całe jej pod-drzewo.
        const isDrawerHead = hasChildren && isOpen(rowId);
        const drawerSpine = spine || (isDrawerHead ? bs.spine : null);
        const drawerClass = drawerSpine ? `wbs-drawer ${isDrawerHead ? 'wbs-drawer-head' : ''}` : '';
        const d = {
            trStyle: drawerSpine ? { ...bs.trStyle, '--wbs-spine': drawerSpine } : bs.trStyle,
            nameClass: `${DEPTH_SIZE[Math.min(depth, MAX_DEPTH)]} wbs-name`,
            fieldClass: 'wbs-field',
        };
        const isDragging = dragId === node.id;
        const overPos = dragOver?.nodeId === node.id ? dragOver.position : null;
        const isEditingTags = editingTagsFor === node.id;

        const dropBorder = overPos === 'before' ? 'border-t-[2px] border-t-blue-500'
            : overPos === 'after'  ? 'border-b-[2px] border-b-blue-500'
            : overPos === 'into'   ? '!bg-blue-500/10 outline outline-1 outline-blue-500/30'
            : '';
        const reqDropHighlight = reqDragOverNode === node.id ? '!bg-emerald-500/10 outline outline-1 outline-emerald-500/40' : '';

        rows.push(
            <tr
                key={rowId}
                data-node-id={node.id}
                data-depth={depth}
                onDragOver={e => onDragOver(e, node.id, depth)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, node.id)}
                style={d.trStyle}
                className={`border-b border-white/5 cursor-pointer group/node transition-opacity wbs-br ${drawerClass} ${isDragging ? 'opacity-25' : ''} ${dropBorder} ${reqDropHighlight} ${selectedNodeId === node.id ? 'outline outline-1 outline-blue-500/40 !bg-blue-500/5' : ''}`}
                onClick={e => { setSelectedNodeId(node.id); hasChildren && toggle(rowId, e); }}
            >
                {/* WBS ID — uchwyt drag (mysz) / pełnokomórkowy przycisk rozwijania (dotyk).
                    Na dotyku uchwyt drag znika (HTML5 DnD nie działa palcem), a chevron dostaje
                    całą komórkę jako pole trafienia — inaczej 12-pikselowa ikona w 32-pikselowej
                    kolumnie jest praktycznie nie do trafienia palcem. */}
                {isTouch ? (
                    <td className={`relative p-0 ${isDrawerHead ? 'bg-white/[0.04]' : ''}`}>
                        <div className="absolute inset-0 flex items-stretch">
                            {/* Uchwyt przeniesienia — `touch-action: none`, więc gest zaczęty tutaj
                                nie przewija listy, tylko podnosi wiersz. `draggable` zostaje dla
                                hybryd (laptop z ekranem dotykowym trafia w gałąź dotykową, ale myszą
                                dalej ma korzystać z natywnego HTML5 DnD — ścieżka wskaźnika
                                ignoruje `pointerType === 'mouse'`). */}
                            <span
                                draggable
                                onDragStart={e => onDragStart(e, node.id)}
                                onDragEnd={onDragEnd}
                                onPointerDown={e => onHandlePointerDown(e, node.id)}
                                onPointerMove={onHandlePointerMove}
                                onPointerUp={e => finishPointerDrag(e, true)}
                                onPointerCancel={e => finishPointerDrag(e, false)}
                                onClick={e => e.stopPropagation()}
                                title="Przeciągnij, aby przenieść"
                                style={{ touchAction: 'none' }}
                                className={`flex items-center justify-center w-9 flex-shrink-0 active:bg-blue-500/25 active:text-blue-300 ${selectedDepth != null && depth === selectedDepth + 1 ? 'text-amber-400' : 'text-gray-600'}`}
                            >
                                <GripVertical size={18} />
                            </span>
                            {hasChildren ? (
                                <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); setSelectedNodeId(node.id); toggle(rowId, e); }}
                                    aria-expanded={isOpen(rowId)}
                                    aria-label={isOpen(rowId) ? 'Zwiń gałąź' : 'Rozwiń gałąź'}
                                    title={isOpen(rowId) ? 'Zwiń' : 'Rozwiń'}
                                    style={{ touchAction: 'manipulation' }}
                                    className="flex-1 flex items-center justify-center text-gray-300 active:bg-blue-500/25 active:text-blue-300 transition-colors"
                                >
                                    <ChevronRight size={20} className={`transition-transform ${isOpen(rowId) ? 'rotate-90' : ''}`} />
                                </button>
                            ) : <span className="flex-1" />}
                        </div>
                    </td>
                ) : (
                    <td
                        className="px-2 py-2.5 cursor-grab min-w-[96px] w-[96px]"
                        draggable
                        onDragStart={e => onDragStart(e, node.id)}
                        onDragEnd={onDragEnd}
                    >
                        <div className="relative flex items-center gap-1.5">
                            <GripVertical
                                size={11}
                                className={`flex-shrink-0 ${selectedDepth != null && depth === selectedDepth + 1 ? 'text-amber-400' : 'text-gray-700 group-hover/node:text-gray-500'}`}
                            />
                            {hasChildren
                                ? <ChevronRight size={12} className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen(rowId) ? 'rotate-90' : ''}`} />
                                : <span className="w-[12px] flex-shrink-0" />
                            }
                        </div>
                    </td>
                )}

                {/* Nazwa */}
                <td className="px-3 py-1.5 select-text relative" style={{ paddingLeft: `calc(0.75rem + ${depth * 24}px)`, paddingRight: '7rem' }} onClick={e => e.stopPropagation()}>
                    <WbsNameAutocomplete
                        value={node.name || ''}
                        pool={nameSuggestionPool}
                        excludeId={node.id}
                        onValueChange={v => handleField(node.id, 'name', v)}
                        onValueBlur={v => {
                            onNodeFieldSave?.(node.id, 'name', v);
                            if ((node.type === 'equipment' || node.type === 'material') && v) {
                                onMaterialNodeCreated?.({ wbsNodeId: node.id, name: v, type: node.type, parentId });
                            }
                            // Nazwa pokrywa się z pozycją już w drzewie → przepisz jej ustawienia.
                            // `node` jeszcze nie widzi nowej nazwy (stan rodzica), więc podajemy `v`.
                            const unitFromTwin = applyTwinDefaults({ ...node, name: v }, depth, parentId);
                            if (!unitFromTwin && (!node.unit || node.unit === 'sztuki')) {
                                const suggested = suggestDefaultUnit(v, node.type);
                                if (suggested) {
                                    handleField(node.id, 'unit', suggested);
                                    onNodeFieldSave?.(node.id, 'unit', suggested);
                                }
                            }
                        }}
                        placeholder={depth === 0 ? 'Nazwa przedmiotu projektu…' : 'Nazwa elementu…'}
                        className={`w-full bg-transparent border-none resize-none focus:outline-none placeholder-gray-700 min-w-[60px] select-text leading-snug ${d.nameClass}`}
                        data-nav-row={node.id}
                        data-nav-col="nazwa"
                        onKeyDown={e => handleGridKeyDown(e, node.id, 'nazwa')}
                    />
                    <div className="absolute top-1/2 -translate-y-1/2 right-1 flex items-center gap-1">
                        <button
                            onClick={e => { e.stopPropagation(); setCopyBuffer({ node: findNode(items, node.id), sourceName: node.name }); }}
                            title="Kopiuj pozycję"
                            className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                        >
                            <Copy size={14} />
                        </button>
                        {copyBuffer && !subtreeContains(copyBuffer.node, node.id) && copyBuffer.node.id !== node.id && (
                            <button
                                onClick={e => {
                                    e.stopPropagation();
                                    const { clone, mappings } = deepCloneNodeWithMappings(copyBuffer.node);
                                    const newTree = { ...wbsTree, items: addChildTo(items, node.id, clone) };
                                    save(newTree);
                                    setCopyBuffer(null);
                                    if (mappings.length > 0) onPasteCloned?.(mappings, newTree);
                                }}
                                title={`Wklej „${copyBuffer.sourceName}" jako dziecko (z wymaganiami technicznymi, typem i statusem)`}
                                className="p-1 rounded text-emerald-500/60 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all"
                            >
                                <Clipboard size={14} />
                            </button>
                        )}
                        {(node.type === 'material' || node.type === 'equipment') && (
                            <button
                                onClick={e => { e.stopPropagation(); setExpandedMaterialIds(prev => { const n = new Set(prev); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n; }); }}
                                title="Karta materiałowa"
                                className={`p-1 rounded transition-all ${expandedMaterialIds.has(node.id) ? 'text-amber-400 bg-amber-500/15' : 'text-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10'}`}
                            >
                                <Package size={14} />
                            </button>
                        )}
                        {depth < MAX_DEPTH && (
                            <button
                                onClick={e => handleAddChild(node.id, e)}
                                className="p-1.5 hover:bg-white/10 rounded text-gray-500 hover:text-blue-400 transition-all"
                                title="Dodaj element podrzędny"
                            >
                                <Plus size={16} />
                            </button>
                        )}
                        <button
                            onClick={e => { e.stopPropagation(); setAddTaskNode({ id: processNodeId, name: node.name }); }}
                            className="p-1 hover:bg-blue-500/10 rounded text-gray-600 hover:text-blue-400 transition-all"
                            title="Dodaj zadanie do tego węzła"
                        >
                            <ListTodo size={13} />
                        </button>
                        <button
                            onClick={e => handleDelete(node.id, e)}
                            className="p-1 hover:bg-red-500/10 rounded text-gray-600 hover:text-red-500 transition-all"
                            title="Usuń"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                </td>

                {/* Typ — dla wszystkich poziomów poza rootem */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {depth >= 1 && (
                        <select
                            value={node.type || ''}
                            onChange={e => {
                                const newType = e.target.value;
                                const isMaterial = newType === 'equipment' || newType === 'material';
                                handleField(node.id, 'type', newType);
                                onNodeFieldSave?.(node.id, 'type', newType);
                                if (newType === 'group') {
                                    handleField(node.id, 'unit', 'pakiet');
                                    onNodeFieldSave?.(node.id, 'unit', 'pakiet');
                                    // Gałąź grupująca nie ma własnej ceny (wartość = suma dzieci) —
                                    // zeruj koszt lokalnie od razu, żeby rollup w tabeli nie trzymał
                                    // starej ceny do czasu refreshu. Backend (updateNode) utrwala zero
                                    // przy zapisie type='group', więc osobny PATCH kosztu jest zbędny.
                                    handleField(node.id, 'unitCost', 0);
                                } else if (isMaterial) {
                                    // Materiał/sprzęt wyceniane indywidualnie (wymagania materiałowe) —
                                    // te dwa typy nie mają ceny domyślnej w modalu „Domyślne wartości".
                                    // Brak ceny domyślnej = ZERUJEMY cenę, a nie zostawiamy starej: zmiana
                                    // typu z pracy zostawiała na materiale stawkę pracy (np. 800 zł/dzień
                                    // na switchu) i wyglądała jak prawdziwa cena zakupu. Właściwy koszt
                                    // wraca z wymagań materiałowych. Narzut czyścimy z tego samego powodu:
                                    // pochodził z domyślnych POPRZEDNIEGO typu, a materiał swojego nie ma.
                                    const suggestedUnit = suggestDefaultUnit(node.name, newType);
                                    const unitToApply = suggestedUnit || (getLeafDefaultFrom(leafDefaults, newType) || {}).unit;
                                    if (unitToApply != null) { handleField(node.id, 'unit', unitToApply); onNodeFieldSave?.(node.id, 'unit', unitToApply); }
                                    handleField(node.id, 'unitCost', 0);
                                    handleField(node.id, 'margin', 0);
                                    onApplyLeafDefaults?.(node.id, { unit: unitToApply, unitCost: 0, margin: 0 });
                                } else if (newType) {
                                    // Praca/usługa/nocleg/paliwo — wartości domyślne z modalu przy KAŻDEJ zmianie typu
                                    // (nowe i istniejące pozycje), od razu w tabeli, edytowalne później.
                                    // Jednostka: nazwa kablowa/światłowodowa ma priorytet nad domyślną z modalu.
                                    // Ilość zachowana (nie przekazujemy jej do defaults) — patrz applyLeafDefaults.
                                    const defs = getLeafDefaultFrom(leafDefaults, newType) || {};
                                    const suggestedUnit = suggestDefaultUnit(node.name, newType);
                                    const unitToApply = suggestedUnit || defs.unit;
                                    if (unitToApply != null) handleField(node.id, 'unit', unitToApply);
                                    if (defs.unitCost != null) handleField(node.id, 'unitCost', defs.unitCost);
                                    if (defs.margin != null) handleField(node.id, 'margin', defs.margin);
                                    onApplyLeafDefaults?.(node.id, { unit: unitToApply, unitCost: defs.unitCost, margin: defs.margin });
                                }
                                if (newType === 'work') {
                                    ensureFuelLeaf(node.id);
                                }
                                if (isMaterial && node.name) {
                                    onMaterialNodeCreated?.({ wbsNodeId: node.id, name: node.name, type: newType, parentId });
                                }
                            }}
                            className={`bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-base w-full focus:outline-none focus:border-blue-500 transition-colors cursor-pointer ${d.fieldClass}${twinFlashClass(node.id, 'type')}`}
                            data-nav-row={node.id}
                            data-nav-col="typ"
                            onKeyDown={e => handleGridKeyDown(e, node.id, 'typ')}
                        >
                            <option value="" className="bg-gray-900">— wybierz typ —</option>
                            {TYPE_OPTIONS.filter(o => o !== '').map(o => (
                                <option key={o} value={o} className="bg-gray-900">{TYPE_LABELS[o] || o}</option>
                            ))}
                        </select>
                    )}
                </td>

                {/* Ilość */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {depth >= 1 && (
                        <div className="relative">
                            <input type="text" inputMode="decimal"
                                value={qtyFocusId === node.id
                                    ? (node.quantity ?? '')
                                    : (parseFloat(String(node.quantity).replace(',', '.')) ? node.quantity : '')}
                                onChange={e => {
                                    const clean = sanitizeQtyInput(e.target.value);
                                    if (clean !== e.target.value) flashWarn(node.id, 'quantity');
                                    handleField(node.id, 'quantity', clean);
                                }}
                                onFocus={e => { setQtyFocusId(node.id); if (!parseFloat(String(node.quantity).replace(',', '.'))) handleField(node.id, 'quantity', ''); e.target.select(); }}
                                onMouseUp={e => e.target.select()}
                                onKeyDown={e => handleGridKeyDown(e, node.id, 'ilosc')}
                                onBlur={e => {
                                    setQtyFocusId(null);
                                    const raw = String(e.target.value);
                                    const evaluated = evalQtyFormula(raw);
                                    const n = evaluated !== null ? evaluated : parseFloat(raw.replace(',', '.'));
                                    const clean = Number.isFinite(n) && n >= 0 ? String(n) : '0';
                                    handleField(node.id, 'quantity', clean);
                                    onRequirementsQtyChange?.(node.id, clean, node.name);
                                }}
                                placeholder="0" {...offerLockProps}
                                className={`bg-transparent border-none focus:outline-none text-base w-full text-right placeholder-gray-700 ${d.fieldClass}${offerLocked ? ' cursor-not-allowed opacity-70' : ''}`}
                                data-nav-row={node.id}
                                data-nav-col="ilosc" />
                            {warnKey === `${node.id}:quantity` && (
                                <span className="absolute right-0 top-full mt-0.5 z-20 whitespace-nowrap text-[10px] text-red-300 bg-red-900/90 border border-red-500/40 px-1.5 py-0.5 rounded shadow-lg">tylko cyfry</span>
                            )}
                        </div>
                    )}
                </td>

                {/* Jednostka */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {depth >= 1 && (
                        node.type === 'group' ? (
                            <div className={`text-base w-full ${d.fieldClass}`}>pakiet</div>
                        ) : (
                            <select value={node.unit || ''}
                                onChange={e => { handleField(node.id, 'unit', e.target.value); onNodeFieldSave?.(node.id, 'unit', e.target.value); }}
                                className={`bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-base w-full focus:outline-none focus:border-blue-500 cursor-pointer ${d.fieldClass}${twinFlashClass(node.id, 'unit')}`}
                                data-nav-row={node.id}
                                data-nav-col="jednostka"
                                onKeyDown={e => handleGridKeyDown(e, node.id, 'jednostka')}>
                                <option value="" className="bg-gray-900">—</option>
                                {UNIT_OPTIONS.map(u => <option key={u} value={u} className="bg-gray-900">{u}</option>)}
                            </select>
                        )
                    )}
                </td>

                {/* Koszt jednostkowy (tylko manager) */}
                {/* @anchor wbs-unit-price-input */}
                {isManager && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        {depth === 0 ? (
                            <div title="Suma kosztów gałęzi" className={`text-base w-full text-right font-semibold ${d.fieldClass}`}>
                                {fmtPLN(sumChildrenCost(node)) || '0,00'}
                            </div>
                        ) : node.type === 'group' ? (
                            <div
                                title="Suma kosztów dzieci"
                                className={`text-base w-full text-right text-gray-400 ${d.fieldClass}`}
                            >
                                {fmtPLN(sumChildrenCost(node)) || '0,00'}
                            </div>
                        ) : (
                            <div className="relative">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={costFocusId === node.id
                                        ? (node.unitCost || '')
                                        : (Number(node.unitCost) ? fmtPLN(Number(node.unitCost)) : '')}
                                    onChange={e => {
                                        const clean = sanitizeQtyInput(e.target.value);
                                        if (clean !== e.target.value) flashWarn(node.id, 'unitCost');
                                        handleField(node.id, 'unitCost', clean);
                                    }}
                                    onFocus={e => { setCostFocusId(node.id); e.target.select(); }}
                                    onBlur={e => {
                                        setCostFocusId(null);
                                        const raw = String(e.target.value);
                                        const evaluated = evalQtyFormula(raw);
                                        const n = evaluated !== null ? evaluated : parseFloat(raw.replace(',', '.'));
                                        const rounded = Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
                                        handleField(node.id, 'unitCost', String(rounded));
                                        onNodeFieldSave?.(node.id, 'unitCost', rounded);
                                    }}
                                    onKeyDown={e => handleGridKeyDown(e, node.id, 'cena_netto')}
                                    placeholder="0,00"
                                    {...offerLockProps}
                                    className={`bg-transparent border-none focus:outline-none text-base w-full text-right placeholder-gray-700 ${d.fieldClass}${offerLocked ? ' cursor-not-allowed opacity-70' : ''}${twinFlashClass(node.id, 'unitCost')}`}
                                    data-nav-row={node.id}
                                    data-nav-col="cena_netto"
                                />
                                {warnKey === `${node.id}:unitCost` && (
                                    <span className="absolute right-0 top-full mt-0.5 z-20 whitespace-nowrap text-[10px] text-red-300 bg-red-900/90 border border-red-500/40 px-1.5 py-0.5 rounded shadow-lg">tylko cyfry</span>
                                )}
                            </div>
                        )}
                    </td>
                )}

                {/* Narzut % (tylko manager) — edytowalny na liściach/węzłach z kosztem */}
                {/* @anchor wbs-margin-input */}
                {isManager && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        {(depth === 0 || node.type === 'group') ? (
                            <div className={`text-base w-full text-right text-gray-600 ${d.fieldClass}`}>—</div>
                        ) : (
                            <div className="relative">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={node.margin != null && node.margin !== '' ? String(node.margin).replace('.', ',') : ''}
                                    onChange={e => {
                                        const clean = sanitizeQtyInput(e.target.value);
                                        if (clean !== e.target.value) flashWarn(node.id, 'margin');
                                        handleField(node.id, 'margin', clean);
                                    }}
                                    onFocus={e => e.target.select()}
                                    onBlur={e => {
                                        const raw = String(e.target.value);
                                        const n = parseFloat(raw.replace(',', '.'));
                                        const val = Number.isFinite(n) ? String(n) : '';
                                        handleField(node.id, 'margin', val);
                                        onNodeFieldSave?.(node.id, 'margin', val === '' ? null : Number(val));
                                    }}
                                    onKeyDown={e => handleGridKeyDown(e, node.id, 'narzut')}
                                    placeholder="—"
                                    {...offerLockProps}
                                    className={`bg-transparent border-none focus:outline-none text-base w-full text-right placeholder-gray-700 ${d.fieldClass}${offerLocked ? ' cursor-not-allowed opacity-70' : ''}${twinFlashClass(node.id, 'margin')}`}
                                    data-nav-row={node.id}
                                    data-nav-col="narzut"
                                />
                                {warnKey === `${node.id}:margin` && (
                                    <span className="absolute right-0 top-full mt-0.5 z-20 whitespace-nowrap text-[10px] text-red-300 bg-red-900/90 border border-red-500/40 px-1.5 py-0.5 rounded shadow-lg">tylko cyfry</span>
                                )}
                            </div>
                        )}
                    </td>
                )}

                {/* Cena ofertowa (ilość×koszt×narzut, sumowana jak koszt — tylko manager) */}
                {/* @anchor wbs-offer-price-cell */}
                {isManager && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        {(() => {
                            const offer = sumChildrenOfferPrice(node);
                            return (
                                <div
                                    title={hasChildren ? 'Suma cen ofertowych gałęzi' : 'Cena ofertowa = ilość × koszt × narzut'}
                                    className={`text-base w-full text-right font-semibold ${offer > 0 ? 'text-green-400' : 'text-gray-600'}`}
                                >
                                    {offer > 0 ? fmtPLN(offer) : '—'}
                                </div>
                            );
                        })()}
                    </td>
                )}

                {/* Status */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {(() => {
                        // @anchor wbs-status-req-link — wymaganie do zsynchronizowania statusem:
                        // tag `req:<id>` jest połączeniem właściwym, ale 15 pozycji na produkcji
                        // trzyma się karty wyłącznie przez `MaterialRequirement.wbsNodeId` (stare
                        // węzły bez taga). Bez tego fallbacku status ustawiony w drzewie nie
                        // docierał do panelu Materiały i oba widoki pokazywały co innego.
                        // Fallback po NAZWIE świadomie pominięty: przy odczycie dopasowuje
                        // węzeł do karty, ale przy zapisie potrafiłby ostemplować statusem
                        // kartę innej pozycji, która nazywa się tak samo.
                        const reqTag = (node.tags || []).find(t => String(t).startsWith('req:'));
                        const reqId = reqTag ? reqTag.slice(4) : (matReqByWbsId[node.id]?.id || null);
                        return (
                            <StatusSelect
                                value={node.status}
                                type={node.type}
                                onChange={v => {
                                    handleField(node.id, 'status', v);
                                    onNodeFieldSave?.(node.id, 'status', v);
                                    if (reqId) onNodeStatusChange?.(node.id, v, reqId);
                                }}
                                data-nav-row={node.id}
                                data-nav-col="status"
                                onKeyDown={e => handleGridKeyDown(e, node.id, 'status')}
                            />
                        );
                    })()}
                </td>

                {/* Właściciel */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {(users.length > 0 || projectContacts.length > 0) ? (
                        <select
                            value={node.owner || ''}
                            onChange={e => { handleField(node.id, 'owner', e.target.value); onNodeFieldSave?.(node.id, 'owner', e.target.value); }}
                            className={`bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-base w-full focus:outline-none focus:border-blue-500 transition-colors cursor-pointer ${d.fieldClass}`}
                            data-nav-row={node.id}
                            data-nav-col="wlasciciel"
                            onKeyDown={e => handleGridKeyDown(e, node.id, 'wlasciciel')}
                        >
                            <option value="" className="bg-gray-900">—</option>
                            {users.length > 0 && users.map(u => {
                                const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
                                const label = u.company ? `${u.company} — ${name}` : name;
                                return <option key={u.id} value={label} className="bg-gray-900">{label}</option>;
                            })}
                            {projectContacts.length > 0 && users.length > 0 && <option disabled className="bg-gray-900">──────────</option>}
                            {projectContacts.length > 0 && projectContacts.map(c => {
                                const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email;
                                const label = c.company ? `${c.company} - ${fullName}` : fullName;
                                const alreadyInUsers = users.some(u => ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email) === fullName);
                                if (alreadyInUsers) return null;
                                return <option key={c.id} value={label} className="bg-gray-900">{label}</option>;
                            })}
                        </select>
                    ) : (
                        <input type="text" value={node.owner || ''} onChange={e => handleField(node.id, 'owner', e.target.value)} onBlur={e => onNodeFieldSave?.(node.id, 'owner', e.target.value)}
                            onKeyDown={e => handleGridKeyDown(e, node.id, 'wlasciciel')}
                            placeholder="—" className={`bg-transparent border-none focus:outline-none text-base w-full placeholder-gray-700 ${d.fieldClass}`}
                            data-nav-row={node.id}
                            data-nav-col="wlasciciel" />
                    )}
                </td>

                {/* Komentarz */}
                <td className="px-3 py-2.5 min-w-[180px]" onClick={e => e.stopPropagation()}>
                    <AutoResizeTextarea
                        value={node.comment || ''}
                        onChange={e => handleField(node.id, 'comment', e.target.value)}
                        onBlur={e => { onNodeFieldSave?.(node.id, 'comment', e.target.value); window.dispatchEvent(new CustomEvent('wbs-comment-changed', { detail: { wbsNodeIds: [node.id], comment: e.target.value } })); }}
                        placeholder="—"
                        className={`bg-transparent border-none resize-none focus:outline-none text-base w-full placeholder-gray-700 leading-snug ${d.fieldClass}`}
                        data-nav-row={node.id}
                        data-nav-col="komentarz"
                        onKeyDown={e => handleGridKeyDown(e, node.id, 'komentarz')}
                    />
                </td>

                {/* Strategia — edytowalna na węzłach-elementach (liście / pośrednie), read-only na top-level.
                    Top-level (depth===0) pokazuje złożenie ze składowych: linia `nazwa: strategia` na każdy
                    wypełniony potomek. Złożenie jest utrwalane na polu strategy top-level (czytają eksporty). */}
                <td className="px-3 py-2.5 min-w-[180px]" onClick={e => e.stopPropagation()}>
                    {depth === 0 ? (() => {
                        const entries = collectBranchStrategyEntries(node);
                        if (entries.length) {
                            return (
                                <div className={`text-base leading-snug text-gray-300 select-text ${d.fieldClass}`}>
                                    {entries.map(e => (
                                        <div key={e.id} className="mb-1.5 last:mb-0">
                                            <span className="font-bold text-gray-200">{e.name}</span>
                                            <div className="whitespace-pre-wrap">{e.strategy}</div>
                                        </div>
                                    ))}
                                </div>
                            );
                        }
                        return (node.strategy || '')
                            ? <div className={`whitespace-pre-wrap text-base leading-snug text-gray-300 select-text ${d.fieldClass}`}>{node.strategy}</div>
                            : <span className="text-gray-700 text-base select-none">—</span>;
                    })() : (
                        <AutoResizeTextarea
                            value={node.strategy || ''}
                            onChange={e => handleField(node.id, 'strategy', e.target.value)}
                            onBlur={e => saveLeafStrategy(node.id, e.target.value)}
                            placeholder="Strategia elementu…"
                            className={`bg-transparent border-none resize-none focus:outline-none text-base w-full placeholder-gray-700 leading-snug ${d.fieldClass}`}
                            data-nav-row={node.id}
                            data-nav-col="strategia"
                            onKeyDown={e => handleGridKeyDown(e, node.id, 'strategia')}
                        />
                    )}
                </td>

                {/* Q&A — na węźle top-level suma Q&A całej gałęzi otwiera read-only podgląd;
                    na pozostałych badge otwiera edytowalny modal 3/4 ekranu (edycja nietknięta). */}
                <td className="px-3 py-2.5 min-w-[90px]" onClick={e => e.stopPropagation()}>
                    {depth === 0 && hasChildren ? (
                        <button
                            onClick={() => setQaBranchNode({ id: node.id })}
                            className="flex items-center gap-1.5 text-[30px] text-gray-500 hover:text-blue-400 transition-all"
                            title="Podgląd Q&A całej gałęzi (read-only)"
                        >
                            <HelpCircle size={30} />
                            <span>{collectBranchQa(node).reduce((s, g) => s + g.pairs.length, 0) || '0'}</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => setQaModalNode({ id: node.id, name: node.name })}
                            className="flex items-center gap-1.5 text-[30px] text-gray-500 hover:text-blue-400 transition-all"
                            title="Otwórz pytania i odpowiedzi"
                        >
                            <HelpCircle size={30} />
                            <span>{(Array.isArray(node.qa) ? node.qa : []).filter(p => p?.question || p?.answer).length || '+'}</span>
                        </button>
                    )}
                </td>

                {/* Załączniki — miniatury zdjęć z markerów */}
                <td className="px-2 py-2 overflow-hidden max-w-0" style={{ width: colWidths.zalaczniki }} onClick={e => e.stopPropagation()}>
                    <AttachmentCell
                        wbsNodeId={node.id}
                        nodeName={node.name}
                        markerLinksCache={markerLinksCache}
                        onOpenModal={setAttachmentModal}
                    />
                </td>

                {/* (delete przeniesiony do komórki nazwy) */}
                <td />
            </tr>
        );

        if ((node.type === 'material' || node.type === 'equipment') && expandedMaterialIds.has(node.id)) {
            rows.push(
                <tr
                    key={`mat-req-${node.id}`}
                    className={drawerSpine ? 'wbs-drawer-row' : ''}
                    style={drawerSpine ? { '--wbs-spine': drawerSpine } : undefined}
                >
                    <td colSpan={TOTAL_COLS} className={`p-0 ${DRAWER.surface}`}>
                        <MaterialReqExpandPanel
                            node={node}
                            req={(() => {
                                // 1. Tag req:<id> — bezpośrednie połączenie liść↔wymaganie (najwłaściwsze)
                                const reqTag = (node.tags || []).find(t => String(t).startsWith('req:'));
                                if (reqTag && matReqByWbsId[reqTag.slice(4)]) return matReqByWbsId[reqTag.slice(4)];
                                // 2. wbsNodeId — aktywna wersja, węzeł jest właścicielem wymagania
                                if (matReqByWbsId[node.id]) return matReqByWbsId[node.id];
                                // 3. Fallback po nazwie — dla węzłów snapshot (klonowane ID) i starych węzłów
                                //    bez tagu req:. Zapobiega tworzeniu ghost-requirements z błędnym versionId.
                                return matReqByName[String(node.name || '').trim().toLowerCase()] || null;
                            })()}
                            processNodeId={processNodeId}
                            versionId={versionId}
                            reqsLoaded={matReqsLoaded}
                            offerLocked={offerLocked}
                            onNodeFieldSave={onNodeFieldSave}
                            onNodeFieldLocal={handleField}
                            onSaved={(updated, opts) => {
                                setMatReqByWbsId(prev => ({ ...prev, [node.id]: updated, ...(updated?.id ? { [updated.id]: updated } : {}) }));
                                if (updated?.name) setMatReqByName(prev => ({ ...prev, [String(updated.name).trim().toLowerCase()]: updated }));
                                // silent = edycja pola propozycji/wymagania bez wpływu na budżet. Pełny
                                // onMaterialReqUpdated przeładowuje całe drzewo WBS i listę wymagań —
                                // przy każdym polu wyglądało to jak restart widoku, a wyścig tego
                                // odczytu z własnym PATCH-em cofał świeżo wpisane wartości.
                                if (opts?.silent) return;
                                onMaterialReqUpdated?.();
                            }}
                            onDeleteNode={() => {
                                const deletedNode = findNode(items, node.id);
                                const deletedIds = collectIds(items, node.id);
                                const nextItems = deleteNode(items, node.id);
                                save({ ...wbsTree, items: nextItems });
                                if (deletedIds.length) onNodesDeleted?.(deletedIds);
                                if (deletedNode) recomposeBranchStrategyAfterDelete(deletedNode, items, nextItems);
                                setExpandedMaterialIds(prev => { const n = new Set(prev); n.delete(node.id); return n; });
                            }}
                        />
                    </td>
                </tr>
            );
        }

        if (searchVisibleIds || isOpen(rowId)) {
            const kids = node.children || [];
            // Akordeon: rodzeństwo jest widoczne jako wiersze, ale tylko rozwinięte dziecko
            // pokazuje swoje pod-drzewo (sterowane przez `isOpen(rowId)` przy każdym wierszu).
            kids.forEach((child, ci) => {
                renderNode(child, depth + 1, `${wbsPath}.${ci + 1}`, node.id, rootIndex, drawerSpine);
            });
        }

        // Listwa domykająca szufladę — rysuje ją wyłącznie gałąź, która szufladę otworzyła
        // (`!spine`), inaczej każda zagnieżdżona gałąź kończyłaby blok w środku.
        if (isDrawerHead && !spine) {
            rows.push(
                <tr key={`${rowId}-drawer-end`} className="wbs-drawer-end" style={{ '--wbs-spine': drawerSpine }}>
                    <td colSpan={TOTAL_COLS} />
                </tr>
            );
        }
    };

    if (isOpen('root')) {
        if (items.length === 0) {
            rows.push(
                <tr key="empty">
                    <td colSpan={TOTAL_COLS} className="px-3 py-3 pl-16 text-[14px] text-gray-700 italic">
                        Brak przedmiotów — kliknij <span className="text-gray-500">+</span> przy projekcie, aby dodać
                    </td>
                </tr>
            );
        }
        // Akordeon: wszystkie top-level gałęzie zawsze widoczne jako wiersze;
        // tylko rozwinięta gałąź pokazuje swoje pod-drzewo (przez `isOpen(rowId)`).
        items.forEach((item, i) => {
            renderNode(item, 0, `${i + 1}`, null, i);
        });
    }

    const closeAttachmentModal = async () => {
        const id = attachmentModal?.wbsNodeId;
        setAttachmentModal(null);
        if (id) {
            const res = await fetch(`${API_URL}/schematics/wbs-node-markers/${id}`);
            if (res.ok) {
                const data = await res.json();
                setMarkerLinksCache(prev => ({ ...prev, [id]: data }));
            }
        }
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <style>{WBS_BRANCH_CSS}</style>
            <AddTaskModal
                open={!!addTaskNode}
                onClose={() => setAddTaskNode(null)}
                nodeId={addTaskNode?.id}
                nodeName={addTaskNode?.name}
            />
            {copyBuffer && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 border-b border-blue-500/20 text-[15px] text-blue-300">
                    <Clipboard size={12} className="flex-shrink-0" />
                    <span>Kopiujesz: <strong>{copyBuffer.sourceName || '—'}</strong> — najedź na wiersz i kliknij <Clipboard size={10} className="inline" /> by wkleić jako dziecko</span>
                    <button onClick={() => setCopyBuffer(null)} className="ml-auto p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-white"><X size={12} /></button>
                </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto overflow-x-auto custom-scrollbar" ref={tableWrapperRef}>
            <div className="w-full">
                <table className="text-base border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <colgroup>
                        {/* Kolumna uchwytu/rozwijania — na dotyku mieści uchwyt przeniesienia (36 px)
                            i przycisk rozwijania (48 px), oba w rozmiarze pod palec */}
                        <col style={{ width: isTouch ? 84 : 32 }} />
                        <col style={{ width: colWidths.nazwa }} />
                        <col style={{ width: colWidths.typ }} />
                        <col style={{ width: colWidths.ilosc }} />
                        <col style={{ width: colWidths.jednostka }} />
                        {isManager && <col style={{ width: colWidths.cena_netto }} />}
                        {isManager && <col style={{ width: colWidths.narzut }} />}
                        {isManager && <col style={{ width: colWidths.cena_ofert }} />}
                        <col style={{ width: colWidths.status }} />
                        <col style={{ width: colWidths.wlasciciel }} />
                        <col style={{ width: colWidths.komentarz }} />
                        <col style={{ width: colWidths.strategia }} />
                        <col style={{ width: colWidths.qa }} />
                        <col style={{ width: colWidths.zalaczniki }} />
                        <col style={{ width: 48 }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-[#0b0f17]">
                        <tr className="border-b border-white/10">
                            <th className="px-1 py-2.5 text-base font-bold uppercase tracking-widest text-white" />
                            {[['nazwa','Nazwa','text-left'],['typ','Typ','text-left'],['ilosc','Ilość','text-right'],['jednostka','Jednostka','text-left'],...(isManager ? [['cena_netto','Koszt jedn.','text-right'],['narzut','Narzut %','text-right'],['cena_ofert','Cena ofert.','text-right']] : []),['status','Status','text-left'],['wlasciciel','Właściciel','text-left'],['komentarz','Komentarz','text-left'],['strategia','Strategia','text-left'],['qa','Q&A','text-left'],['zalaczniki','Attach.','text-left']].map(([key, label, align]) => (
                                <th key={key} className={`px-3 py-2.5 text-base font-bold uppercase tracking-widest text-white ${align} relative select-none`}>
                                    {label}
                                    <div onMouseDown={e => startColResize(key, e)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors" />
                                </th>
                            ))}
                            <th className="w-12" />
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </div>
            </div>{/* end flex-1 scroll */}

            {/* Koszyk nieprzypisanych wymagań */}
            {isManager && unassignedRequirements.length > 0 && (
                <div className="flex-shrink-0 border-t border-white/5 bg-[#0b0f17]">
                    <button
                        onClick={() => setShowBasket(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
                    >
                        <span className="text-[14px] uppercase tracking-widest text-amber-500/70 font-bold flex items-center gap-1.5">
                            <Package size={10} />
                            Koszyk — nieprzypisane ({unassignedRequirements.length})
                            {selectedNodeId && !showBasket && <span className="ml-2 text-gray-600 normal-case tracking-normal font-normal text-[9px]">rozwiń, by przypisać</span>}
                        </span>
                        <ChevronDown size={13} className={`text-amber-500/50 transition-transform ${showBasket ? 'rotate-180' : ''}`} />
                    </button>
                    {showBasket && (
                        <div className="px-4 pb-3 max-h-48 overflow-y-auto custom-scrollbar">
                            {selectedNodeId && (
                                <p className="text-[14px] text-gray-600 mb-2">przeciągnij na wiersz lub kliknij → Przypisz</p>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {unassignedRequirements.map(req => {
                                    const isOpen = expandedBasketIds.has(req.id);
                                    const spec = String(req.technicalSpec || '').trim();
                                    return (
                                    <div
                                        key={req.id}
                                        draggable
                                        onDragStart={e => {
                                            e.dataTransfer.setData('application/requirement-id', req.id);
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        onDragOver={e => { if ((e.dataTransfer.types || []).includes('application/requirement-id')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setMergeOverId(req.id); } }}
                                        onDragLeave={() => setMergeOverId(prev => (prev === req.id ? null : prev))}
                                        onDrop={e => { e.preventDefault(); e.stopPropagation(); const src = e.dataTransfer.getData('application/requirement-id'); setMergeOverId(null); if (src && src !== req.id) onRequirementMerge?.(src, req.id); }}
                                        title={onRequirementMerge ? 'Przeciągnij inny liść tutaj, aby scalić jego wymagania' : undefined}
                                        className={`flex gap-1.5 px-2.5 py-1.5 bg-emerald-900/30 border rounded-lg text-emerald-300 text-[15px] cursor-grab select-none ${mergeOverId === req.id ? 'border-amber-400/70 ring-2 ring-amber-400/50' : 'border-emerald-500/20'} ${isOpen ? 'w-full flex-col items-start' : 'items-center'}`}
                                    >
                                        <div className="flex items-center gap-1.5 w-full">
                                            <button
                                                onClick={e => { e.stopPropagation(); setExpandedBasketIds(prev => { const n = new Set(prev); n.has(req.id) ? n.delete(req.id) : n.add(req.id); return n; }); }}
                                                className="flex items-center gap-1.5 cursor-pointer hover:text-emerald-200 text-left min-w-0"
                                                title="Pokaż wymagania techniczne"
                                            >
                                                <ChevronDown size={11} className={`text-emerald-500/60 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                                <span className="truncate">{req.name || req.productName || '—'}</span>
                                            </button>
                                            {req.quantity > 0 && <span className="text-emerald-500/60 text-[14px] flex-shrink-0">×{req.quantity}{req.unit ? ` ${req.unit}` : ''}</span>}
                                            {selectedNodeId && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); onRequirementAssign?.(selectedNodeId, req.id); }}
                                                    className="ml-auto px-1.5 py-0.5 bg-emerald-600/40 hover:bg-emerald-600/70 rounded text-[9px] font-bold text-emerald-200 cursor-pointer flex-shrink-0"
                                                    title="Przypisz do zaznaczonej gałęzi"
                                                >→ Przypisz</button>
                                            )}
                                        </div>
                                        {isOpen && (
                                            <div className="w-full mt-1 px-2 py-1.5 bg-black/30 border border-emerald-500/10 rounded text-[13px] text-emerald-100/80 whitespace-pre-wrap break-words cursor-text">
                                                {spec || <span className="text-gray-500 italic">(brak wymagań technicznych)</span>}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {attachmentModal && (
                <MarkerAttachmentsModal
                    wbsNodeId={attachmentModal.wbsNodeId}
                    wbsNodeName={attachmentModal.wbsNodeName}
                    processNodeId={processNodeId}
                    onClose={closeAttachmentModal}
                />
            )}

            {qaModalNode && (
                <QaModal
                    node={findNode(items, qaModalNode.id) || { name: qaModalNode.name, qa: [] }}
                    onChange={(next) => handleField(qaModalNode.id, 'qa', next)}
                    onPersist={() => onSave?.()}
                    onClose={() => setQaModalNode(null)}
                />
            )}

            {qaBranchNode && (
                <QaBranchModal
                    node={findNode(items, qaBranchNode.id) || { name: '', children: [] }}
                    onClose={() => setQaBranchNode(null)}
                />
            )}
        </div>
    );
}
