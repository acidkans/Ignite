import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import {
    ChevronRight, ChevronDown, CheckCircle, Trash2, AlertCircle,
    Plus, Search, Sparkles,
    FileText, Link as LinkIcon, Download, BookOpen, X, Database, Paperclip,
    Lock, Maximize2,
} from 'lucide-react';
import { API_URL } from '../../../config';
import { useDevice } from '../../../hooks/useDevice';
import SupplierPicker from '../SupplierPicker';
import { UNIT_OPTIONS, wbsTypeFromAny, sanitizeQtyInput, evalQtyFormula, parsePriceInput, DRAWER, usesWorkStatuses, statusMetaForType, statusOptionsForType, statusLabelForType, resolveStatusCode } from './wbsConstants';
import { guardSnapshotEdit } from '../SnapshotEditGuard';
import { guardOfferEdit, requestOfferUnlock, offerLockInputProps } from '../OfferLockGuard';
import AutoResizeTextarea from './AutoResizeTextarea';
import {
    TYPE_META, LEAF_TYPES, STATUS_META, authHeaders, flattenWbsNodes, getParentPath,
    flattenReq, wbsRootOf, purchaseUnitOf, REAL_STATE, realizationOf, fmtQty, fmtZl, fmtDate,
} from './realizationShared';

// ─── Meta ────────────────────────────────────────────────────────────────────

// Meta typów, statusów i cała arytmetyka realizacji siedzą w `realizationShared.js` —
// dzieli je z zakładką „Realizacja", która liczy pokrycie i Δ z tych samych wpisów.

const WBS_NODE_STATUSES = [
    { value: '',          label: '—' },
    { value: 'todo',      label: 'Do zrobienia' },
    { value: 'inprogress',label: 'W trakcie' },
    { value: 'done',      label: 'Gotowe' },
    { value: 'blocked',   label: 'Zablokowane' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeName(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ─── ProposalsSection ─────────────────────────────────────────────────────────

function ProposalImage({ proposalId, token, onDeleted }) {
    const [blobUrl, setBlobUrl] = useState(null);
    const blobRef = useRef(null);
    useEffect(() => {
        let cancelled = false;
        fetch(`${API_URL}/material-requirements/proposals/${proposalId}/image`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(async res => {
            if (!res.ok || cancelled) return;
            const blob = await res.blob();
            if (cancelled) return;
            if (blobRef.current) URL.revokeObjectURL(blobRef.current);
            const url = URL.createObjectURL(blob);
            blobRef.current = url;
            setBlobUrl(url);
        }).catch(() => {});
        return () => {
            cancelled = true;
            if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
        };
    }, [proposalId, token]);

    if (!blobUrl) return null;
    return (
        <div className="relative flex-shrink-0 w-10 h-10 group">
            <img src={blobUrl} alt="produkt" className="w-full h-full object-contain rounded" />
            <button
                onClick={onDeleted}
                title="Usuń obrazek"
                className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 rounded transition-opacity text-red-400 hover:text-red-300"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
}

// @anchor proposal-field-num — pole liczbowe wiersza propozycji: te same zasady wpisywania co
// w kolumnach tabeli (`sanitizeQtyInput` + `evalQtyFormula`) — cyfry, jeden separator dziesiętny
// albo działanie zaczynające się od „=" („=1200*1.23"). Po zapisie w polu zostaje wynik.
const PROPOSAL_FIELDS = [
    { key: 'manufacturer', ph: 'Producent',     ac: true  },
    { key: 'model',        ph: 'Model',          ac: true  },
    { key: 'productName',  ph: 'Nazwa handlowa', ac: true  },
    { key: 'priceNetto',   ph: 'Koszt jedn.',     ac: false, num: true },
    { key: 'availability', ph: 'Dostępność',     ac: false },
    { key: 'sourceUrl',    ph: 'https://...',    ac: false },
];

const AC_KEYS = PROPOSAL_FIELDS.filter(f => f.ac).map(f => f.key);

// Cross-filter: only upstream fields narrow suggestions (manufacturer → model → productName)
const AC_UPSTREAM = { manufacturer: [], model: ['manufacturer'], productName: ['manufacturer', 'model'] };

function findInlineAc(fieldKey, typed, materialDb, vals) {
    if (!typed || !materialDb?.length || !AC_KEYS.includes(fieldKey)) return null;
    const typedLower = typed.toLowerCase();
    let base = materialDb;
    for (const f of (AC_UPSTREAM[fieldKey] || [])) {
        if (vals[f]) base = base.filter(m => (m[f] || '').toLowerCase() === vals[f].toLowerCase());
    }
    const match = base
        .filter(m => (m[fieldKey] || '').toLowerCase().startsWith(typedLower))
        .sort((a, b) => (a[fieldKey] || '').localeCompare(b[fieldKey] || ''))[0];
    return match ? (match[fieldKey] || '') : null;
}

// @anchor proposal-supplier-picker — „Oferent produktu" w wierszu propozycji. Ten sam wybór
// dostawcy co przy wpisie zakupu (`SupplierPicker`: rejestr, NIP z Białej listy, wolny wpis,
// czyszczenie) i to samo pole w bazie co miał dawny `ProductSideCard` — `ProductProposal.supplierId`.
// Znaczenie jest jednak inne i dlatego inna etykieta: tu rejestrujemy, KTO NAM ZAOFERTOWAŁ ten
// produkt. Nie przesądza to, u kogo kupimy — kupno zapisuje dostawca na wpisie realizacji
// (`LeafActual.supplierId`) i te dwa pola wolno mieć różne.
const ProposalSupplierPicker = ({ value, onChange, disabled }) => (
    <SupplierPicker dark size="xs" textClass="text-xs" placeholder="Oferent produktu…"
        value={value ?? null} onChange={onChange} disabled={disabled} />
);

// @anchor proposal-supplier-after — pole, za którym wskakuje „Oferent produktu": między nazwą
// handlową a kosztem jedn. Trzymane jako stała, bo kolejność kolumn niesie sens odczytu wiersza
// i musi być ta sama w istniejącej propozycji i w formularzu „Dodaj ręcznie".
const PROPOSAL_SUPPLIER_AFTER = 'productName';

function ProposalRow({ p, token, onDelete, onSelect, onDeleted: onImageDeleted, onPatch, materialDb }) {
    const [vals, setVals] = useState({
        manufacturer: p.manufacturer || '',
        model: p.model || '',
        productName: p.productName || '',
        priceNetto: p.priceNetto != null ? String(p.priceNetto) : '',
        availability: p.availability || '',
        sourceUrl: p.sourceUrl || '',
    });
    const [inlineAc, setInlineAc] = useState({});
    const inputRefs = useRef({});
    const suppressAcRef = useRef(false);
    const suppressNextBlurRef = useRef(false);

    // @anchor proposal-row-sync — wiersz nadąża za propozycją, gdy zmieni ją KTOŚ INNY niż on sam:
    // edycja pola w karcie pozycji schodzi na wybraną propozycję po stronie backendu, po czym
    // `onRefresh` wraca ze świeżymi danymi. Wcześniej stan pól zasiewał się tylko przy zmianie
    // `p.id`, więc taka aktualizacja nie miała jak wejść do inputa — karta pokazywała koszt jedn.
    // 5000, a wiersz propozycji zostawał pusty, choć w bazie obie wartości były równe.
    // Nadpisujemy WYŁĄCZNIE pola, których wartość przyszła inna niż poprzednio z propsów —
    // to, co użytkownik właśnie wpisuje (różni się od propsów, ale propsy się nie zmieniły),
    // zostaje nietknięte aż do zapisu na blurze.
    const incoming = useMemo(() => ({
        manufacturer: p.manufacturer || '',
        model: p.model || '',
        productName: p.productName || '',
        priceNetto: p.priceNetto != null ? String(p.priceNetto) : '',
        availability: p.availability || '',
        sourceUrl: p.sourceUrl || '',
    }), [p.manufacturer, p.model, p.productName, p.priceNetto, p.availability, p.sourceUrl]);
    const lastIncoming = useRef(incoming);
    const lastId = useRef(p.id);

    useEffect(() => {
        if (lastId.current !== p.id) {
            lastId.current = p.id;
            lastIncoming.current = incoming;
            setVals(incoming);
            setInlineAc({});
            return;
        }
        const patch = {};
        for (const k of Object.keys(incoming)) {
            if (incoming[k] !== lastIncoming.current[k]) patch[k] = incoming[k];
        }
        lastIncoming.current = incoming;
        if (Object.keys(patch).length === 0) return;
        setVals(v => ({ ...v, ...patch }));
        setInlineAc(a => {
            const next = { ...a };
            for (const k of Object.keys(patch)) delete next[k];
            return next;
        });
    }, [p.id, incoming]);

    // After every render: restore selection for the currently active inline suggestion
    useLayoutEffect(() => {
        for (const key of AC_KEYS) {
            const el = inputRefs.current[key];
            const suggestion = inlineAc[key];
            if (suggestion && el && document.activeElement === el) {
                el.setSelectionRange((vals[key] || '').length, suggestion.length);
            }
        }
    });

    const save = (key, raw) => {
        let value = raw;
        if (key === 'priceNetto') {
            value = parsePriceInput(raw);
            // W polu zostaje wynik, nie formuła — inaczej „=2*99" wisiałoby w inpucie,
            // podczas gdy w bazie leży już 198, a resync z propsów tego nie posprząta
            // (`proposal-row-sync` nadpisuje tylko pola, które przyszły INNE niż poprzednio).
            setVals(v => ({ ...v, priceNetto: value != null ? String(value) : '' }));
        }
        onPatch(p.id, { [key]: value });
    };

    const handleChange = (key, typed) => {
        if (suppressAcRef.current) {
            suppressAcRef.current = false;
            setVals(v => ({ ...v, [key]: typed }));
            setInlineAc(a => ({ ...a, [key]: null }));
            return;
        }
        const suggestion = findInlineAc(key, typed, materialDb, { ...vals, [key]: typed });
        setVals(v => ({ ...v, [key]: typed }));
        setInlineAc(a => ({ ...a, [key]: suggestion }));
    };

    const acceptField = (key) => {
        const raw = inlineAc[key] || vals[key];
        const value = key === 'manufacturer' ? raw.toUpperCase() : raw;
        setVals(v => ({ ...v, [key]: value }));
        setInlineAc(a => ({ ...a, [key]: null }));
        return value;
    };

    const focusNext = (key) => {
        const keys = PROPOSAL_FIELDS.map(f => f.key);
        const nextKey = keys[keys.indexOf(key) + 1];
        if (nextKey) { inputRefs.current[nextKey]?.focus(); return true; }
        return false;
    };

    const knownProduct = useMemo(() => {
        if (!materialDb?.length || !vals.manufacturer) return null;
        const mfr = vals.manufacturer.toLowerCase();
        const mdl = (vals.model || '').toLowerCase();
        return materialDb.find(m =>
            (m.manufacturer || '').toLowerCase() === mfr &&
            (!mdl || (m.model || '').toLowerCase() === mdl)
        ) || null;
    }, [materialDb, vals.manufacturer, vals.model]);

    return (
        <div className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors ${p.isSelected ? 'bg-green-500/10 border-green-500/30' : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]'}`}>
            <button onClick={() => onDelete(p)} title="Usuń" className="flex-shrink-0 text-gray-600 hover:text-red-400 transition-colors mr-0.5">
                <Trash2 size={11} />
            </button>
            {p.imageUrl && <ProposalImage proposalId={p.id} token={token} onDeleted={() => onImageDeleted(p)} />}
            {knownProduct && (
                <span title="Produkt znany w bazie materiałów" className="flex-shrink-0 text-cyan-500/70">
                    <Database size={10} />
                </span>
            )}
            {PROPOSAL_FIELDS.map(({ key, ph, ac, num }) => (
                <React.Fragment key={key}>
                <div className="flex-1 min-w-0">
                    <input
                        ref={el => inputRefs.current[key] = el}
                        value={ac && inlineAc[key] ? inlineAc[key] : vals[key]}
                        onChange={e => ac ? handleChange(key, e.target.value) : setVals(v => ({ ...v, [key]: num ? sanitizeQtyInput(e.target.value) : e.target.value }))}
                        onBlur={e => {
                            if (suppressNextBlurRef.current) { suppressNextBlurRef.current = false; return; }
                            if (ac) { const v = acceptField(key); save(key, v); }
                            else save(key, e.target.value);
                        }}
                        onKeyDown={e => {
                            if (e.key === 'Tab') {
                                e.preventDefault();
                                const v = ac ? acceptField(key) : vals[key];
                                suppressNextBlurRef.current = true;
                                save(key, v);
                                focusNext(key);
                            } else if (e.key === 'Enter') {
                                e.preventDefault();
                                const v = ac ? acceptField(key) : vals[key];
                                suppressNextBlurRef.current = true;
                                save(key, v);
                                if (!focusNext(key)) { suppressNextBlurRef.current = false; e.target.blur(); }
                            } else if ((e.key === 'Escape' || e.key === 'Backspace') && inlineAc[key]) {
                                suppressAcRef.current = true;
                                setInlineAc(a => ({ ...a, [key]: null }));
                            }
                        }}
                        placeholder={ph}
                        className="w-full bg-transparent border border-transparent hover:border-white/10 focus:border-blue-500/50 rounded px-1.5 py-0.5 text-white placeholder-gray-700 outline-none transition-colors cursor-pointer focus:cursor-text"
                    />
                </div>
                {/* Oferent siedzi W TYM SAMYM wierszu co produkt, zaraz za nazwą handlową i przed
                    ceną — czyta się „ten produkt, od tej firmy, za tyle". Oferta jest własnością
                    konkretnej propozycji, nie całego wymagania: dwie firmy mogą zaofertować dwa
                    różne modele i każdy musi wiedzieć, od kogo przyszedł. */}
                {key === PROPOSAL_SUPPLIER_AFTER && (
                    <div className="flex-1 min-w-0">
                        <ProposalSupplierPicker value={p.supplierId} onChange={s => onPatch(p.id, { supplierId: s?.id ?? null })} />
                    </div>
                )}
                </React.Fragment>
            ))}
            {p.matchScore != null && (
                <span className="flex-shrink-0 text-blue-400 text-[10px] w-8 text-right">{Math.round(p.matchScore * 100)}%</span>
            )}
            {!p.isSelected ? (
                <button onClick={() => onSelect(p)}
                    className="flex-shrink-0 px-2 py-0.5 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/20 transition-colors ml-1">
                    Wybierz
                </button>
            ) : (
                <CheckCircle size={12} className="text-green-400 flex-shrink-0 ml-1" />
            )}
        </div>
    );
}

function ProposalsSection({ req, token, onRefresh, onPatch, materialDb, onPropagatePrice, wbsNode, offerLocked = false }) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const [proposals, setProposals] = useState(req.proposals || []);
    const [searching, setSearching] = useState(false);
    const [manualForm, setManualForm] = useState(null);
    const [manualAc, setManualAc] = useState({});
    const manualInputRefs = useRef({});
    const suppressManualAcRef = useRef(false);

    useLayoutEffect(() => {
        if (!manualForm) return;
        for (const key of AC_KEYS) {
            const el = manualInputRefs.current[key];
            const suggestion = manualAc[key];
            if (suggestion && el && document.activeElement === el) {
                el.setSelectionRange((manualForm[key] || '').length, suggestion.length);
            }
        }
    });

    const handleManualChange = (key, typed) => {
        if (suppressManualAcRef.current) {
            suppressManualAcRef.current = false;
            setManualForm(f => ({ ...f, [key]: typed }));
            setManualAc(a => ({ ...a, [key]: null }));
            return;
        }
        const suggestion = findInlineAc(key, typed, materialDb, { ...manualForm, [key]: typed });
        setManualForm(f => ({ ...f, [key]: typed }));
        setManualAc(a => ({ ...a, [key]: suggestion }));
    };

    const acceptManualField = (key) => {
        const raw = manualAc[key] || manualForm[key] || '';
        const value = key === 'manufacturer' ? raw.toUpperCase() : raw;
        setManualForm(f => ({ ...f, [key]: value }));
        setManualAc(a => ({ ...a, [key]: null }));
        return value;
    };

    const focusManualNext = (key) => {
        const keys = PROPOSAL_FIELDS.map(f => f.key);
        const nextKey = keys[keys.indexOf(key) + 1];
        if (nextKey) { manualInputRefs.current[nextKey]?.focus(); return true; }
        return false;
    };

    useEffect(() => { setProposals(req.proposals || []); }, [req.id, req.proposals]);

    const searchAI = async () => {
        if (!(await guardSnapshotEdit())) return;
        setSearching(true);
        try {
            const res = await fetch(`${API_URL}/material-requirements/${req.id}/search-products`, { method: 'POST', headers });
            if (res.ok) { const data = await res.json(); setProposals(data); onRefresh(); }
        } finally { setSearching(false); }
    };

    const selectProposal = async (p) => {
        if (!(await guardSnapshotEdit())) return;
        // Wybór propozycji ustawia `isOffer` i przepisuje cenę wyceny — to nośnik wartości
        // ofertowej, więc po akceptacji baseline idzie przez modal OfferLockGuard.
        if (offerLocked && !(await guardOfferEdit())) return;
        await fetch(`${API_URL}/material-requirements/proposals/${p.id}/select`, { method: 'PATCH', headers });
        // Optimistic: zaznacz checkmark natychmiast i zaktualizuj cenę w rodzicu
        setProposals(prev => prev.map(x => ({ ...x, isSelected: x.id === p.id })));
        if (p.priceNetto != null) {
            // Propaguj cenę wybranej propozycji do budżetu WBS (unitCost liścia), tak samo jak
            // ręczna edycja pola „Koszt jedn." w ProductCard. Bez tego cena trafiała tylko do
            // wymagania materiałowego, a wiersz liścia w WBSHybridTable pokazywał starą wartość.
            if (onPropagatePrice) onPropagatePrice(req, wbsNode, p.priceNetto);
            else onPatch?.(req.id, { priceNetto: p.priceNetto });
        }
        onRefresh();
    };

    const deleteProposal = async (p) => {
        if (!(await guardSnapshotEdit())) return;
        await fetch(`${API_URL}/material-requirements/proposals/${p.id}`, { method: 'DELETE', headers });
        setProposals(prev => prev.filter(x => x.id !== p.id));
        onRefresh();
    };

    const deleteProposalImage = async (p) => {
        if (!(await guardSnapshotEdit())) return;
        await fetch(`${API_URL}/material-requirements/proposals/${p.id}/image`, { method: 'DELETE', headers });
        setProposals(prev => prev.map(x => x.id === p.id ? { ...x, imageUrl: null } : x));
        onRefresh();
    };

    const patchProposal = async (id, data) => {
        // Edycja propozycji będącej produktem wyceny zmienia wartość ofertową — backend odbije
        // ją przez `assertOfferEditable`, więc pytamy o odblokowanie zanim poleci PATCH.
        const isOfferProposal = proposals.find(x => x.id === id)?.isOffer;
        if (offerLocked && isOfferProposal && !(await guardOfferEdit())) return;
        await fetch(`${API_URL}/material-requirements/proposals/${id}`, {
            method: 'PATCH', headers, body: JSON.stringify(data),
        });
        // @anchor proposal-patch-refresh — pełne odświeżenie (drzewo WBS + lista wymagań) tylko
        // gdy zmiana rusza budżet: cena wyceny na propozycji `isOffer`, bo backend przepisuje ją
        // wtedy na `MaterialRequirement.budgetedPriceNetto`. Każde inne pole propozycji nie
        // wychodzi poza kartę, więc idzie `silent` — sama karta i tak wraca świeża
        // (`req.proposals` przesiewa listę), a bez tego każdy Enter przemalowywał całą sekcję
        // i wyglądało to jak przeładowanie strony.
        const touchesBudget = data.priceNetto !== undefined && isOfferProposal;
        onRefresh(touchesBudget ? undefined : { silent: true });
    };

    const addManual = async () => {
        // Merge any pending inline AC suggestions before submitting
        const form = { ...manualForm };
        for (const key of AC_KEYS) {
            if (manualAc[key]) form[key] = key === 'manufacturer' ? manualAc[key].toUpperCase() : manualAc[key];
        }
        if (!form.productName) return;
        const payload = { ...form, isManual: true };
        payload.priceNetto = parsePriceInput(form.priceNetto);
        const res = await fetch(`${API_URL}/material-requirements/${req.id}/proposals`, {
            method: 'POST', headers, body: JSON.stringify(payload),
        });
        if (res.ok) {
            const created = await res.json();
            setManualForm(null);
            setManualAc({});
            setProposals(prev => [...prev, created]);
            onRefresh();
        }
    };

    return (
        <div className="flex flex-col gap-1 mt-2">
            <div className="flex items-center gap-2">
                <span className="text-[10px] italic uppercase tracking-widest text-white font-semibold">Propozycje produktów</span>
                <button onClick={searchAI} disabled={searching}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors disabled:opacity-40">
                    <Sparkles size={10} /> {searching ? 'Szukam...' : 'Szukaj AI'}
                </button>
                <button onClick={() => setManualForm(manualForm ? null : { productName: '', manufacturer: '', model: '', priceNetto: '', availability: '', sourceUrl: '', supplierId: null })}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 transition-colors">
                    <Plus size={10} /> Dodaj ręcznie
                </button>
            </div>

            {manualForm && (() => {
                const mfr = (manualAc.manufacturer || manualForm.manufacturer || '').toLowerCase();
                const mdl = (manualAc.model || manualForm.model || '').toLowerCase();
                const knownManual = mfr && materialDb?.find(m =>
                    (m.manufacturer || '').toLowerCase() === mfr &&
                    (!mdl || (m.model || '').toLowerCase() === mdl)
                );
                return (
                <div className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 border border-white/10">
                    <div className="w-5 flex-shrink-0 flex items-center justify-center">
                        {knownManual && <Database size={10} title="Produkt znany w bazie materiałów" className="text-cyan-500/70" />}
                    </div>
                    {PROPOSAL_FIELDS.map(({ key, ph, ac, num }) => (
                        <React.Fragment key={key}>
                        <div className="flex-1 min-w-0">
                            <input
                                ref={el => manualInputRefs.current[key] = el}
                                value={ac && manualAc[key] ? manualAc[key] : (manualForm[key] || '')}
                                onChange={e => ac ? handleManualChange(key, e.target.value) : setManualForm(f => ({ ...f, [key]: num ? sanitizeQtyInput(e.target.value) : e.target.value }))}
                                onBlur={() => ac && acceptManualField(key)}
                                onKeyDown={e => {
                                    if (e.key === 'Tab') {
                                        e.preventDefault();
                                        if (ac) acceptManualField(key);
                                        focusManualNext(key);
                                    } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (ac) acceptManualField(key);
                                        if (!focusManualNext(key)) addManual();
                                    } else if (e.key === 'Escape') {
                                        if (manualAc[key]) { suppressManualAcRef.current = true; setManualAc(a => ({ ...a, [key]: null })); }
                                        else setManualForm(null);
                                    } else if (e.key === 'Backspace' && manualAc[key]) {
                                        suppressManualAcRef.current = true;
                                        setManualAc(a => ({ ...a, [key]: null }));
                                    }
                                }}
                                placeholder={ph}
                                className="w-full bg-black/30 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                            />
                        </div>
                        {key === PROPOSAL_SUPPLIER_AFTER && (
                            <div className="flex-1 min-w-0">
                                <ProposalSupplierPicker value={manualForm.supplierId}
                                    onChange={s => setManualForm(f => ({ ...f, supplierId: s?.id ?? null }))} />
                            </div>
                        )}
                        </React.Fragment>
                    ))}
                    <button onClick={() => setManualForm(null)} className="flex-shrink-0 px-2 py-0.5 text-xs text-gray-500 hover:text-white transition-colors ml-1">Anuluj</button>
                    <button onClick={addManual} className="flex-shrink-0 px-3 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white transition-colors">Dodaj</button>
                </div>
                );
            })()}

            {proposals.length === 0 && !manualForm && (
                <p className="text-[11px] text-gray-600 italic">Brak propozycji — kliknij „Szukaj AI" lub dodaj ręcznie.</p>
            )}

            {proposals.map(p => (
                <ProposalRow
                    key={p.id}
                    p={p}
                    token={token}
                    materialDb={materialDb}
                    onDelete={deleteProposal}
                    onSelect={selectProposal}
                    onDeleted={deleteProposalImage}
                    onPatch={patchProposal}
                />
            ))}
        </div>
    );
}

// ─── OfferPickerDropdown ──────────────────────────────────────────────────────

function OfferPickerDropdown({ offers, onSelect, onClose }) {
    const ref = useRef(null);
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const allPositions = offers.flatMap(offer =>
        (offer.positions || []).map((pos, idx) => ({ offer, pos, idx }))
    ).filter(({ pos }) => pos.priceNetto != null);

    if (!allPositions.length) return (
        <div ref={ref} className="absolute z-50 top-full left-0 mt-1 w-72 bg-gray-900 border border-amber-500/30 rounded-xl shadow-xl p-3 text-xs text-gray-500">
            Brak pozycji z cenami w ofertach tego węzła.
        </div>
    );

    return (
        <div ref={ref} className="absolute z-50 top-full left-0 mt-1 w-80 bg-gray-900 border border-amber-500/30 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {offers.map(offer => {
                const positions = (offer.positions || []).filter(p => p.priceNetto != null);
                if (!positions.length) return null;
                return (
                    <div key={offer.id}>
                        <div className="px-3 py-1.5 text-[9px] font-semibold text-amber-400/70 bg-white/5 truncate uppercase tracking-widest">{offer.fileName}</div>
                        {positions.map((pos, idx) => (
                            <button key={idx} onClick={() => onSelect(offer.id, (offer.positions || []).indexOf(pos))}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-500/10 transition-colors flex items-center gap-2 border-b border-white/5 last:border-0">
                                <span className="text-gray-500 shrink-0 w-6 text-right">{pos.lp ?? idx + 1}.</span>
                                <span className="flex-1 truncate text-gray-200">{pos.name || pos.description || '—'}</span>
                                <span className="text-amber-300 whitespace-nowrap font-mono text-[10px] shrink-0">
                                    {pos.priceNettoPln != null
                                        ? `${Number(pos.priceNettoPln).toFixed(2)} zł`
                                        : `${Number(pos.priceNetto).toFixed(2)} ${pos.currency || 'zł'}`}
                                </span>
                            </button>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

// ─── ProductCard ──────────────────────────────────────────────────────────────

// @anchor product-card
export function ProductCard({ card, wbsNode, token, materialDb, offers, onRefresh, onRefreshOffers, onPropagatePrice, readOnly, onPatch, offerLocked = false }) {
    const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    // @anchor product-card-offer-lock — po akceptacji baseline karta zostaje otwarta (opis, wymagania
    // techniczne, zdjęcie), ale nośniki wartości ofertowej — „Koszt jedn.", wybór propozycji, przypięcie
    // pozycji z oferty — przechodzą przez modal `OfferLockGuard`. Backend pilnuje tego samego
    // (`assertOfferEditable`); front zamienia surowe 403 na pytanie o odblokowanie przez managera.
    const lockProps = offerLockInputProps(offerLocked);

    const [fields, setFields] = useState({
        manufacturer: card?.manufacturer || '',
        model: card?.model || '',
        productName: card?.productName || '',
        availability: card?.availability || '',
        technicalSpec: card?.technicalSpec || '',
        priceNetto: card?.priceNetto ? String(card.priceNetto) : '',
        productUrl: card?.productUrl || '',
    });
    const [comboOpen, setComboOpen] = useState(null);
    const [priceWarn, setPriceWarn] = useState(false);
    const priceWarnTimer = useRef(null);
    const [offerPicker, setOfferPicker] = useState(false);
    const offerSnap = useMemo(() => {
        try { return card?.offerPositionSnapshot ? JSON.parse(card.offerPositionSnapshot) : null; } catch { return null; }
    }, [card?.offerPositionSnapshot]);
    // offerPositionSnapshot jest samowystarczalnym workiem: trzyma i dostawcę, i pozycję oferty.
    // Pole „Koszt jedn." wolno zablokować TYLKO gdy snapshot niesie realną pozycję oferty (cena/lp),
    // nie gdy zawiera sam dostawcę — inaczej dodanie dostawcy blokuje ręczną edycję ceny.
    const hasOfferPos = !!offerSnap && (offerSnap.priceNetto != null || offerSnap.lp != null);

    const assignOffer = useCallback(async (offerId, positionIdx) => {
        setOfferPicker(false);
        if (offerLocked && !(await guardOfferEdit())) return;
        const res = await fetch(`${API_URL}/material-requirements/${card.id}/offer`, {
            method: 'PATCH', headers,
            body: JSON.stringify({ offerId, positionIdx }),
        });
        const updated = res.ok ? await res.json() : null;
        onRefresh();
        const pricePln = updated?.budgetedPriceNetto ?? null;
        if (pricePln != null && onPropagatePrice) {
            onPropagatePrice(card, wbsNode, pricePln);
        }
    }, [card, wbsNode, headers, onRefresh, onPropagatePrice, offerLocked]);

    const removeOffer = useCallback(async () => {
        if (!(await guardSnapshotEdit())) return;
        if (offerLocked && !(await guardOfferEdit())) return;
        await fetch(`${API_URL}/material-requirements/${card.id}/offer`, {
            method: 'DELETE', headers,
        });
        onRefresh();
    }, [card?.id, headers, onRefresh, offerLocked]);
    useEffect(() => () => { if (priceWarnTimer.current) clearTimeout(priceWarnTimer.current); }, []);
    const [localImageUrl, setLocalImageUrl] = useState(null);
    const [imageKey, setImageKey] = useState(0);
    // @anchor product-card-combo-refs
    const comboRefs = useRef({});
    const [fetchedImageUrl, setFetchedImageUrl] = useState(null);
    const [showCatalogModal, setShowCatalogModal] = useState(false);
    const [catalogImageUrl, setCatalogImageUrl] = useState(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const pdfBlobUrlRef = useRef(null);

    const openPdfPreview = useCallback(async (type = 'datasheet') => {
        const res = await fetch(`${API_URL}/material-requirements/${card.id}/${type}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        if (pdfBlobUrlRef.current) URL.revokeObjectURL(pdfBlobUrlRef.current);
        const url = URL.createObjectURL(blob);
        pdfBlobUrlRef.current = url;
        setPdfPreviewUrl(url);
    }, [card?.id, token]);

    const closePdfPreview = useCallback(() => {
        setPdfPreviewUrl(null);
        if (pdfBlobUrlRef.current) { URL.revokeObjectURL(pdfBlobUrlRef.current); pdfBlobUrlRef.current = null; }
    }, []);
    const fileInputRef = useRef(null);
    const pasteInputRef = useRef(null);
    const localImageUrlRef = useRef(null);
    const fetchedImageUrlRef = useRef(null);
    const catalogImageUrlRef = useRef(null);
    const [catalogMaterial, setCatalogMaterial] = useState(null);

    useEffect(() => {
        setFields({
            manufacturer: card?.manufacturer || '',
            model: card?.model || '',
            productName: card?.productName || '',
            availability: card?.availability || '',
            technicalSpec: card?.technicalSpec || '',
            priceNetto: card?.priceNetto ? String(card.priceNetto) : '',
            productUrl: card?.productUrl || '',
        });
    // Zresetuj formularz przy zmianie karty (nowe id) LUB gdy materialId się zmieni
    // (kliknięcie "Wybierz" na propozycji — pola producent/model/produktName powinny się zaktualizować).
    }, [card?.id, card?.materialId]);

    // Pobierz obrazek z auth nagłówkiem i stwórz blob URL (img src nie może wysłać Authorization)
    useEffect(() => {
        if (!card?.imageUrl || !card?.id) {
            setFetchedImageUrl(null);
            return;
        }
        let cancelled = false;
        fetch(`${API_URL}/material-requirements/${card.id}/image?t=${imageKey}`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(async res => {
            if (!res.ok || cancelled) return;
            const blob = await res.blob();
            if (cancelled) return;
            if (fetchedImageUrlRef.current) URL.revokeObjectURL(fetchedImageUrlRef.current);
            const url = URL.createObjectURL(blob);
            fetchedImageUrlRef.current = url;
            setFetchedImageUrl(url);
        }).catch(() => { if (!cancelled) setFetchedImageUrl(null); });
        return () => { cancelled = true; };
    }, [card?.id, card?.imageUrl, imageKey, token]);

    // Pobierz dane i obrazek karty katalogowej gdy modal otwarty
    useEffect(() => {
        if (!showCatalogModal || !card?.materialId) {
            if (catalogImageUrlRef.current) { URL.revokeObjectURL(catalogImageUrlRef.current); catalogImageUrlRef.current = null; }
            setCatalogImageUrl(null);
            setCatalogMaterial(null);
            return;
        }
        let cancelled = false;
        // Fetch danych materiału — card.materialId to id z tabeli materials, nie material-requirements
        fetch(`${API_URL}/materials/${card.materialId}`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(async res => {
            if (!res.ok || cancelled) return;
            const data = await res.json();
            if (!cancelled) setCatalogMaterial(data);
        }).catch(() => {});
        // Fetch obrazka
        fetch(`${API_URL}/materials/${card.materialId}/image`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(async res => {
            if (!res.ok || cancelled) return;
            const blob = await res.blob();
            if (cancelled) return;
            if (catalogImageUrlRef.current) URL.revokeObjectURL(catalogImageUrlRef.current);
            const url = URL.createObjectURL(blob);
            catalogImageUrlRef.current = url;
            setCatalogImageUrl(url);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [showCatalogModal, card?.materialId, token]);

    // Zwolnij objectURL przy odmontowaniu
    useEffect(() => () => {
        if (localImageUrlRef.current) URL.revokeObjectURL(localImageUrlRef.current);
        if (fetchedImageUrlRef.current) URL.revokeObjectURL(fetchedImageUrlRef.current);
        if (catalogImageUrlRef.current) URL.revokeObjectURL(catalogImageUrlRef.current);
    }, []);

    const uploadBlob = useCallback(async (blob, filename = 'image.png') => {
        if (readOnly || !card?.id) return;
        if (!(await guardSnapshotEdit())) return;
        if (localImageUrlRef.current) URL.revokeObjectURL(localImageUrlRef.current);
        const objUrl = URL.createObjectURL(blob);
        localImageUrlRef.current = objUrl;
        setLocalImageUrl(objUrl);
        const formData = new FormData();
        formData.append('file', blob, filename);
        const res = await fetch(`${API_URL}/material-requirements/${card.id}/upload-image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        if (res.ok) { setImageKey(k => k + 1); onRefresh(); }
    }, [card?.id, token, readOnly, onRefresh]);

    const handlePaste = useCallback((e) => {
        const items = Array.from(e.clipboardData?.items || []);
        const imgItem = items.find(i => i.type.startsWith('image/'));
        if (!imgItem) return;
        e.preventDefault();
        const blob = imgItem.getAsFile();
        if (blob) uploadBlob(blob, 'screenshot.png');
    }, [uploadBlob]);

    const handleFileSelect = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file || readOnly || !card?.id) return;
        // Natychmiastowy podgląd
        if (localImageUrlRef.current) URL.revokeObjectURL(localImageUrlRef.current);
        const objUrl = URL.createObjectURL(file);
        localImageUrlRef.current = objUrl;
        setLocalImageUrl(objUrl);
        await uploadBlob(file, file.name);
        e.target.value = '';
    }, [uploadBlob, readOnly, card?.id]);

    const setF = (k, v) => setFields(prev => ({ ...prev, [k]: v }));
    // Ostrzeżenie "tylko cyfry" przy polu Koszt jedn. po odrzuceniu znaku.
    const flashPriceWarn = () => {
        setPriceWarn(true);
        if (priceWarnTimer.current) clearTimeout(priceWarnTimer.current);
        priceWarnTimer.current = setTimeout(() => setPriceWarn(false), 2500);
    };

    const patchCard = useCallback(async (data) => {
        if (!card?.id) return;
        // Optimistic update — natychmiast, żeby zwinięcie/rozwinięcie nie gubiło wartości
        onPatch?.(card.id, data);
        await fetch(`${API_URL}/material-requirements/${card.id}`, {
            method: 'PATCH', headers, body: JSON.stringify(data),
        });
        onRefresh();
    }, [card?.id, headers, onRefresh, onPatch]);

    // Cross-filtering comboboxes
    const ciEq = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

    const getFilteredSuggestions = useCallback((fieldKey) => {
        // Kaskada tylko w górę hierarchii (manufacturer → model → productName), tak jak w findInlineAc/AC_UPSTREAM.
        // Filtrowanie po polach "w dół" (np. model po productName) blokowało sugestie, gdy productName
        // zostało z poprzedniego produktu i nie pasowało do nowego modelu tego samego producenta.
        let base = materialDb;
        for (const f of (AC_UPSTREAM[fieldKey] || [])) {
            if (fields[f]) base = base.filter(m => ciEq(m[f], fields[f]));
        }
        const typed = (fields[fieldKey] || '').toLowerCase();
        const filtered = base.filter(m => {
            const v = m[fieldKey] || '';
            return v && (typed ? v.toLowerCase().includes(typed) : true);
        });
        const seen = new Set();
        return filtered.filter(m => {
            const v = (m[fieldKey] || '').toLowerCase();
            return !seen.has(v) && seen.add(v);
        }).sort((a, b) => (a[fieldKey] || '').localeCompare(b[fieldKey] || ''));
    }, [materialDb, fields]);

    const selectMaterial = useCallback(async (mat, fieldKey = 'productName') => {
        // Wypełnij TYLKO klikane pole + pola nadrzędne (upstream), nigdy pola "w dół" hierarchii.
        // Lista sugestii jest zdeduplikowana po wartości klikanego pola (np. po producencie),
        // więc podstawienie modelu/nazwy z pierwszego lepszego materiału tego producenta było błędem —
        // user musiał kasować auto-wpisany model i szukać właściwego. Wybór producenta = tylko producent.
        const applicable = [fieldKey, ...(AC_UPSTREAM[fieldKey] || [])];
        const uiFields = {};
        const updates = {};
        if (applicable.includes('manufacturer') && mat.manufacturer) { const mf = mat.manufacturer.toUpperCase(); uiFields.manufacturer = mf; updates.manufacturer = mf; }
        if (applicable.includes('model') && mat.model) { uiFields.model = mat.model; updates.model = mat.model; }
        if (applicable.includes('productName') && mat.productName) { uiFields.productName = mat.productName; updates.productName = mat.productName; }
        // materialId + karta katalogowa dopiero gdy znany jest konkretny materiał (model wybrany),
        // nie przy samym producencie — inaczej wiązalibyśmy wymaganie do przypadkowego modelu.
        if (applicable.includes('model')) {
            updates.materialId = mat.id;
            if (mat.dataSheetUrl) { updates.dataSheetUrl = mat.dataSheetUrl; updates.dataSheetName = mat.dataSheetName || mat.productName || 'karta.pdf'; }
        }
        setFields(prev => ({ ...prev, ...uiFields }));
        setComboOpen(null);
        if (Object.keys(updates).length) await patchCard(updates);
    }, [patchCard]);

    const comboFields = [
        ['manufacturer', 'Producent'],
        ['model', 'Model'],
        ['productName', 'Nazwa handlowa'],
    ];

    if (!card) return null;

    return (
        <>
        <div className="flex gap-0 p-0">
            {/* Lewa kolumna — pola (zwężona) */}
            <div className="flex flex-col gap-3 p-4 flex-1 min-w-0">
                {/* Comboboxes */}
                <div className="flex flex-wrap gap-2">
                    {comboFields.map(([key, label]) => {
                        const suggestions = getFilteredSuggestions(key);
                        return (
                            <div key={key} className="relative flex-1 min-w-[120px]">
                                <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">{label}</label>
                                <input
                                    ref={el => { comboRefs.current[key] = el; }}
                                    value={fields[key]}
                                    onChange={e => setF(key, key === 'manufacturer' ? e.target.value.toUpperCase() : e.target.value)}
                                    onFocus={() => setComboOpen(key)}
                                    onBlur={() => {
                                        setTimeout(() => setComboOpen(null), 150);
                                        if (key === 'manufacturer' && !fields.manufacturer) {
                                            setF('model', '');
                                            setF('productName', '');
                                            patchCard({ manufacturer: '', model: '', productName: '', materialId: null });
                                        } else if (fields[key]) {
                                            // Wyślij wszystkie wypełnione pola katalogowe razem — backend
                                            // auto-upsertuje Material+Proposal gdy manufacturer+model oba obecne
                                            const all = {};
                                            if (fields.manufacturer) all.manufacturer = fields.manufacturer;
                                            if (fields.model) all.model = fields.model;
                                            if (fields.productName) all.productName = fields.productName;
                                            if (Object.keys(all).length) patchCard(all);
                                        }
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            setComboOpen(null);
                                            if (key === 'manufacturer' && !fields[key]) {
                                                setF('model', '');
                                                setF('productName', '');
                                                patchCard({ manufacturer: '', model: '', productName: '', materialId: null });
                                            } else {
                                                const all = {};
                                                if (fields.manufacturer) all.manufacturer = fields.manufacturer;
                                                if (fields.model) all.model = fields.model;
                                                if (fields.productName) all.productName = fields.productName;
                                                all[key] = fields[key];
                                                if (Object.keys(all).length) patchCard(all);
                                            }
                                            const comboKeys = comboFields.map(([k]) => k);
                                            const nextKey = comboKeys[comboKeys.indexOf(key) + 1];
                                            if (nextKey) comboRefs.current[nextKey]?.focus();
                                            else comboRefs.current['priceNetto']?.focus();
                                        }
                                    }}
                                    disabled={readOnly}
                                    className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                                    placeholder={`Wpisz ${label.toLowerCase()}...`}
                                />
                                {comboOpen === key && suggestions.length > 0 && (
                                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-gray-900 border border-white/20 rounded shadow-xl max-h-48 overflow-auto custom-scrollbar">
                                        {suggestions.map((m, i) => (
                                            <button key={i} onMouseDown={() => selectMaterial(m, key)}
                                                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 truncate">
                                                {m[key]}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {/* @anchor product-card-supplier — „Oferent produktu" na POZYCJI, obok jej
                        produktu wiodącego (`MaterialRequirement.supplierId`). Propozycje mają
                        własnego oferenta każda z osobna; to pole odpowiada na pytanie „kto
                        zaofertował to, co tu stoi", gdy produkt wpisano wprost w kartę, bez
                        wybierania propozycji. Miejsce to samo co w wierszu propozycji —
                        za nazwą handlową, przed kosztem jedn. */}
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">Oferent produktu</label>
                        <SupplierPicker dark size="sm" textClass="text-xs" placeholder="Kto zaofertował…"
                            value={card?.supplierId ?? null}
                            disabled={readOnly}
                            onChange={s => patchCard({ supplierId: s?.id ?? null })} />
                    </div>
                    <div className="flex-1 min-w-[90px]">
                        <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">Koszt jedn.</label>
                        {hasOfferPos ? (
                            <div>
                                <div className="flex items-center gap-1">
                                    <div className="flex-1 bg-black/30 border border-amber-500/30 rounded px-2 py-1.5 text-xs text-amber-300 font-mono truncate">
                                        {offerSnap.priceNetto != null ? `${Number(offerSnap.priceNetto).toFixed(2)} zł` : '—'}
                                    </div>
                                    {!readOnly && (
                                        <button onClick={removeOffer} title="Usuń przypisanie oferty" className="p-1 text-gray-600 hover:text-red-400 transition-colors shrink-0">
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1 text-[9px] text-amber-400/60 truncate" title={offerSnap.wbsPath || offerSnap.name}>
                                    <Paperclip size={8} className="shrink-0" />
                                    <span className="truncate">Poz.{offerSnap.lp} · {offerSnap.name}</span>
                                </div>
                                {offerSnap.rateComment && (
                                    <div className="mt-0.5 text-[9px] text-amber-400/50 font-mono truncate" title={offerSnap.rateComment}>
                                        {offerSnap.rateComment}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="relative">
                                <input
                                    ref={el => { comboRefs.current['priceNetto'] = el; }}
                                    type="text" inputMode="decimal"
                                    value={fields.priceNetto}
                                    onChange={e => {
                                        const clean = sanitizeQtyInput(e.target.value);
                                        if (clean !== e.target.value) flashPriceWarn();
                                        setF('priceNetto', clean);
                                    }}
                                    onFocus={e => { if (!parseFloat(String(fields.priceNetto).replace(',', '.'))) setF('priceNetto', ''); e.target.select(); }}
                                    onBlur={async () => {
                                        if (offerLocked && !(await guardOfferEdit())) {
                                            setF('priceNetto', card?.priceNetto ? String(card.priceNetto) : '');
                                            return;
                                        }
                                        const raw = String(fields.priceNetto ?? '').trim();
                                        const next = parsePriceInput(raw);
                                        // Nieczytelny wpis zostawiamy w polu i nie kasujemy ceny w bazie
                                        if (raw !== '' && next === null) return;
                                        setF('priceNetto', next != null ? String(next) : '');
                                        if (onPropagatePrice) onPropagatePrice(card, wbsNode, next);
                                        else patchCard({ priceNetto: next });
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            e.target.blur();
                                            comboRefs.current['availability']?.focus();
                                        }
                                    }}
                                    disabled={readOnly}
                                    {...lockProps}
                                    className={`w-full bg-black/30 border rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50 ${offerLocked ? 'border-amber-500/30 opacity-70 cursor-not-allowed' : 'border-white/10'} ${offers?.length > 0 && !readOnly ? 'pr-6' : ''}`}
                                    placeholder="0.00" />
                                {offers?.length > 0 && !readOnly && (
                                    <button onClick={() => { if (!offerPicker) onRefreshOffers?.(); setOfferPicker(v => !v); }} title="Przypisz cenę z oferty"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-600 hover:text-amber-400 transition-colors">
                                        <Paperclip size={10} />
                                    </button>
                                )}
                                {offerPicker && offers?.length > 0 && (
                                    <OfferPickerDropdown offers={offers} onSelect={assignOffer} onClose={() => setOfferPicker(false)} />
                                )}
                                {priceWarn && (
                                    <span className="absolute right-0 top-full mt-0.5 z-20 whitespace-nowrap text-[10px] text-red-300 bg-red-900/90 border border-red-500/40 px-1.5 py-0.5 rounded shadow-lg">tylko cyfry</span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-[90px]">
                        <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">Dostępność</label>
                        <input
                            ref={el => { comboRefs.current['availability'] = el; }}
                            value={fields.availability} onChange={e => setF('availability', e.target.value)}
                            onBlur={() => patchCard({ availability: fields.availability })}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); comboRefs.current['productUrl']?.focus(); } }}
                            disabled={readOnly}
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                            placeholder="np. 7 dni" />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">Adres www</label>
                        <div className="flex items-center gap-1">
                            <input
                                ref={el => { comboRefs.current['productUrl'] = el; }}
                                value={fields.productUrl}
                                onChange={e => setF('productUrl', e.target.value)}
                                onBlur={() => patchCard({ productUrl: fields.productUrl })}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
                                disabled={readOnly}
                                placeholder="https://..."
                                className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                            />
                            {fields.productUrl && (
                                <a href={fields.productUrl} target="_blank" rel="noopener noreferrer"
                                    className="flex-shrink-0 p-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 transition-colors">
                                    <LinkIcon size={11} />
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Wymagania techniczne */}
                <div className="flex-1">
                    <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">Wymagania techniczne</label>
                    <textarea value={fields.technicalSpec} onChange={e => setF('technicalSpec', e.target.value)}
                        onBlur={() => patchCard({ technicalSpec: fields.technicalSpec })}
                        disabled={readOnly} rows={3}
                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50 resize-none"
                        placeholder="Wymagania techniczne (jedno per linia)..." />
                </div>

                {/* Propozycje */}
                {!readOnly && <ProposalsSection req={card} token={token} onRefresh={onRefresh} onPatch={onPatch} materialDb={materialDb} onPropagatePrice={onPropagatePrice} wbsNode={wbsNode} offerLocked={offerLocked} />}
            </div>

            {/* Ikona karty katalogowej — widoczna gdy materiał zaciągnięty z bazy */}
            {card?.materialId && (
                <div className="flex flex-col items-center justify-start pt-3 w-7 flex-shrink-0 border-l border-white/5">
                    <button
                        onClick={() => setShowCatalogModal(true)}
                        title="Karta katalogowa"
                        className="p-1.5 rounded hover:bg-white/10 text-blue-400/60 hover:text-blue-300 transition-colors"
                    >
                        <BookOpen size={20} />
                    </button>
                </div>
            )}

            {/* Prawa kolumna — kliknięcie = file picker, hover+Ctrl+V = schowek */}
            <div
                onMouseEnter={() => !readOnly && pasteInputRef.current?.focus()}
                onClick={() => !readOnly && fileInputRef.current?.click()}
                className={`relative w-44 flex-shrink-0 border-l transition-colors ${readOnly ? 'cursor-default' : 'cursor-pointer hover:border-blue-500/30 hover:bg-blue-500/5'} border-white/5 bg-black/10`}
                title="Kliknij aby wybrać plik | Najedź i Ctrl+V aby wkleić ze schowka"
            >
                {/* file picker */}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                {/* paste trap — uncontrolled text input, dostaje focus na hover */}
                <input
                    ref={pasteInputRef}
                    type="text"
                    onPaste={handlePaste}
                    tabIndex={-1}
                    aria-hidden="true"
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, border: 'none', outline: 'none', padding: 0 }}
                />
                {(localImageUrl || fetchedImageUrl) ? (
                    <img
                        key={imageKey}
                        src={localImageUrl || fetchedImageUrl}
                        alt="podgląd"
                        className="absolute inset-0 w-full h-full object-contain p-2"
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-gray-600 pointer-events-none">
                        <Search size={20} />
                        <span className="text-[10px] text-center px-2">Kliknij aby<br/>wybrać zdjęcie</span>
                    </div>
                )}
            </div>
        </div>

        {/* Modal podglądu PDF */}
        {pdfPreviewUrl && createPortal(
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80" onClick={closePdfPreview}>
                <div className="bg-[#0d1520] border border-white/15 rounded-2xl shadow-2xl flex flex-col" style={{ width: '90vw', height: '90vh' }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-2 text-[10px] text-teal-400 uppercase tracking-widest font-bold">
                            <FileText size={12} /> Karta katalogowa (PDF)
                        </div>
                        <div className="flex items-center gap-2">
                            <a href={pdfPreviewUrl} download className="text-gray-400 hover:text-gray-200 text-[10px] uppercase tracking-wider">Pobierz</a>
                            <button onClick={closePdfPreview} className="text-gray-500 hover:text-gray-300 transition-colors ml-2"><X size={14} /></button>
                        </div>
                    </div>
                    <iframe src={pdfPreviewUrl} className="flex-1 w-full rounded-b-2xl" title="Karta katalogowa" />
                </div>
            </div>,
            document.body
        )}

        {/* Modal karty katalogowej */}
        {showCatalogModal && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" onClick={() => setShowCatalogModal(false)}>
                <div className="bg-[#0d1520] border border-white/15 rounded-2xl shadow-2xl w-80 overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                        <div className="flex items-center gap-2 text-[10px] text-blue-400 uppercase tracking-widest font-bold">
                            <BookOpen size={12} /> Karta katalogowa
                        </div>
                        <button onClick={() => setShowCatalogModal(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
                            <X size={14} />
                        </button>
                    </div>
                    {catalogImageUrl && (
                        <div className="w-full h-36 bg-black/30 border-b border-white/5">
                            <img src={catalogImageUrl} alt="produkt" className="w-full h-full object-contain p-2" />
                        </div>
                    )}
                    {!catalogMaterial && (
                        <div className="p-4 text-xs text-gray-500 text-center">Ładowanie...</div>
                    )}
                    {catalogMaterial && (
                        <>
                        <div className="p-4 flex flex-col gap-2 text-xs">
                            {catalogMaterial.manufacturer && (
                                <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">Producent</span><span className="text-white font-semibold">{catalogMaterial.manufacturer.toUpperCase()}</span></div>
                            )}
                            {catalogMaterial.model && (
                                <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">Model</span><span className="text-gray-200">{catalogMaterial.model}</span></div>
                            )}
                            {catalogMaterial.productName && (
                                <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">Nazwa</span><span className="text-gray-200">{catalogMaterial.productName}</span></div>
                            )}
                            {catalogMaterial.stockStatus != null && (
                                <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">Magazyn</span><span className="text-gray-200">{catalogMaterial.stockStatus} szt.</span></div>
                            )}
                        </div>
                        {(catalogMaterial.dataSheetUrl || catalogMaterial.complianceUrl) && (
                            <div className="px-4 pb-4 flex flex-col gap-2">
                                {catalogMaterial.dataSheetUrl && (
                                    <button onClick={() => openPdfPreview('datasheet')}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg text-teal-300 text-[10px] font-bold uppercase tracking-widest transition-all w-full">
                                        <FileText size={11} /> Karta katalogowa (PDF)
                                    </button>
                                )}
                                {catalogMaterial.complianceUrl && (
                                    <button onClick={() => openPdfPreview('compliance')}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-blue-300 text-[10px] font-bold uppercase tracking-widest transition-all w-full">
                                        <FileText size={11} /> Deklaracja zgodności
                                    </button>
                                )}
                            </div>
                        )}
                        </>
                    )}
                </div>
            </div>,
            document.body
        )}
        </>
    );
}

// @anchor image-lightbox — pełny podgląd zdjęcia produktu. Kafelek podglądu ma 176×86 px i
// `object-contain`, więc zrzut z karty katalogowej jest tam nieczytelny; tu obrazek idzie w
// oryginalnych pikselach. Dwa tryby: „dopasuj" (domyślny, mieści się w oknie) i „1:1" (naturalna
// rozdzielczość, przewijana). Portal do body — kafelek siedzi w komórce tabeli z `overflow:auto`.
function ImageLightbox({ src, title, onClose }) {
    const [natural, setNatural] = useState(false);
    const [dims, setDims] = useState(null);

    useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return createPortal(
        <div
            data-guard-ignore
            className="fixed inset-0 z-[10002] flex flex-col bg-black/80 backdrop-blur-sm"
            onClick={onClose}
        >
            <div className="flex items-center gap-3 px-4 py-2.5 bg-black/60 border-b border-white/10 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <span className="text-sm font-bold text-white truncate flex-1">{title || 'Podgląd produktu'}</span>
                {dims && <span className="text-[11px] text-gray-500 flex-shrink-0">{dims.w} × {dims.h} px</span>}
                <button
                    onClick={() => setNatural(v => !v)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[11px] font-semibold transition-colors flex-shrink-0"
                    title={natural ? 'Dopasuj do okna' : 'Pokaż w oryginalnej rozdzielczości'}
                >
                    {natural ? 'Dopasuj' : '1:1'}
                </button>
                <a
                    href={src} download={`${(title || 'produkt').replace(/[\\/:*?"<>|]+/g, '_')}.png`}
                    onClick={e => e.stopPropagation()}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-colors flex-shrink-0"
                    title="Pobierz obrazek"
                >
                    <Download size={13} />
                </a>
                <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white transition-colors flex-shrink-0" title="Zamknij (Esc)">
                    <X size={16} />
                </button>
            </div>
            <div className={`flex-1 min-h-0 p-4 ${natural ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden'}`}>
                <img
                    src={src}
                    alt={title || 'podgląd produktu'}
                    onClick={e => e.stopPropagation()}
                    onLoad={e => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                    className={natural ? 'max-w-none' : 'max-w-full max-h-full object-contain'}
                />
            </div>
        </div>,
        document.body,
    );
}

// @anchor requirement-image-box — podgląd produktu POZYCJI (używany w zakładce Realizacja).
// Zachowuje się jak kafel zdjęcia w ProductCard: klik = wybór pliku, najechanie + Ctrl+V = wklejenie
// ze schowka (ukryty input przechwytuje `paste`, bo `document` nie dostaje zdarzenia bez focusu).
// Obrazek trzymany jest na wymaganiu (`MaterialRequirement.imageUrl`), więc działa też zanim
// pozycja ma produkt katalogowy; odczyt spada na obrazek z katalogu, gdy własnego nie ma.
export function RequirementImageBox({ card, token, onRefresh, className = '' }) {
    const [localUrl, setLocalUrl] = useState(null);
    const [fetchedUrl, setFetchedUrl] = useState(null);
    const [imageKey, setImageKey] = useState(0);
    const [uploading, setUploading] = useState(false);
    // @anchor requirement-image-lightbox-open — pełny podgląd otwiera osobna ikona „⤢", nie klik
    // w kafelek: klik zostaje przy wyborze pliku, żeby nie zmieniać nawyku wgrywania zdjęć.
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const localRef = useRef(null);
    const fetchedRef = useRef(null);
    const fileInputRef = useRef(null);
    const pasteInputRef = useRef(null);

    // Blob URL zamiast <img src> — endpoint wymaga nagłówka Authorization.
    useEffect(() => {
        if (!card?.id) { setFetchedUrl(null); return; }
        let cancelled = false;
        fetch(`${API_URL}/material-requirements/${card.id}/image?t=${imageKey}`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(async res => {
            if (!res.ok || cancelled) { if (!cancelled) setFetchedUrl(null); return; }
            const blob = await res.blob();
            if (cancelled) return;
            if (fetchedRef.current) URL.revokeObjectURL(fetchedRef.current);
            const url = URL.createObjectURL(blob);
            fetchedRef.current = url;
            setFetchedUrl(url);
        }).catch(() => { if (!cancelled) setFetchedUrl(null); });
        return () => { cancelled = true; };
    }, [card?.id, card?.imageUrl, imageKey, token]);

    useEffect(() => () => {
        if (localRef.current) URL.revokeObjectURL(localRef.current);
        if (fetchedRef.current) URL.revokeObjectURL(fetchedRef.current);
    }, []);

    const uploadBlob = useCallback(async (blob, filename = 'screenshot.png') => {
        if (!card?.id || !blob) return;
        if (!(await guardSnapshotEdit())) return;
        // Natychmiastowy podgląd — upload i odświeżenie idą w tle.
        if (localRef.current) URL.revokeObjectURL(localRef.current);
        const objUrl = URL.createObjectURL(blob);
        localRef.current = objUrl;
        setLocalUrl(objUrl);
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', blob, filename);
            const res = await fetch(`${API_URL}/material-requirements/${card.id}/upload-image`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            if (res.ok) {
                setImageKey(k => k + 1);
                await onRefresh?.({ silent: true });
            }
        } finally { setUploading(false); }
    }, [card?.id, token, onRefresh]);

    const handlePaste = useCallback((e) => {
        const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
        if (!item) return;
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) uploadBlob(blob, 'screenshot.png');
    }, [uploadBlob]);

    const handleFileSelect = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (file) await uploadBlob(file, file.name);
        e.target.value = '';
    }, [uploadBlob]);

    const removeImage = useCallback(async (e) => {
        e.stopPropagation();
        if (!card?.id) return;
        if (!(await guardSnapshotEdit())) return;
        await fetch(`${API_URL}/material-requirements/${card.id}/image`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
        });
        if (localRef.current) { URL.revokeObjectURL(localRef.current); localRef.current = null; }
        setLocalUrl(null);
        setImageKey(k => k + 1);
        await onRefresh?.({ silent: true });
    }, [card?.id, token, onRefresh]);

    const src = localUrl || fetchedUrl;

    return (
        <div
            onMouseEnter={() => pasteInputRef.current?.focus()}
            onClick={() => fileInputRef.current?.click()}
            title="Kliknij aby wybrać plik | Najedź i Ctrl+V aby wkleić ze schowka"
            className={`group relative w-44 h-[86px] flex-shrink-0 rounded border border-white/10 bg-black/30 cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors ${className}`}
        >
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
            {/* pułapka na wklejenie — niewidoczny input dostaje focus po najechaniu myszą */}
            <input
                ref={pasteInputRef} type="text" onPaste={handlePaste} tabIndex={-1} aria-hidden="true"
                data-guard-ignore
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, border: 'none', outline: 'none', padding: 0 }}
            />
            {src ? (
                <>
                    <img src={src} alt="podgląd produktu" className="absolute inset-0 w-full h-full object-contain p-1.5" />
                    <button
                        onClick={e => { e.stopPropagation(); setLightboxOpen(true); }}
                        title="Powiększ — pełna rozdzielczość"
                        className="absolute top-0.5 left-0.5 p-1 rounded bg-black/70 text-gray-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Maximize2 size={11} />
                    </button>
                    <button
                        onClick={removeImage} title="Usuń obrazek"
                        className="absolute top-0.5 right-0.5 p-1 rounded bg-black/70 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Trash2 size={11} />
                    </button>
                    {lightboxOpen && (
                        <ImageLightbox
                            src={src}
                            title={[card?.manufacturer, card?.model, card?.name].filter(Boolean).join(' · ')}
                            onClose={() => setLightboxOpen(false)}
                        />
                    )}
                </>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-600 pointer-events-none">
                    <Search size={16} />
                    <span className="text-[10px] text-center px-2 leading-tight">
                        {uploading ? 'Wysyłam…' : <>Kliknij aby wybrać<br />lub Ctrl+V</>}
                    </span>
                </div>
            )}
        </div>
    );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

// @anchor materials-group-spine — pionowy „kręgosłup" rozwiniętej pozycji. Ten sam pasek
// biegnie przez wiersz liścia, kartę produktu, pasek zakupów i wpisy realizacji, więc widać
// jednym rzutem oka, gdzie grupa się zaczyna i kończy. Niebieski, bo to strona WYCENY —
// turkus jest zarezerwowany dla zakupu/realizacji (`PurchasesBar`, „Rozliczone").
const GROUP_SPINE = `${DRAWER.spine} ${DRAWER.accent.offer.spine}`;

// @anchor materials-row-status-label — etykieta statusu w kolumnie „Status". Liście z kartą
// (materiał, sprzęt) biorą ją z `MaterialRequirement.status`, a praca, usługa, nocleg i paliwo
// wprost z `WbsNode.status`, bo karty nie mają i do tej pory pokazywały w tej kolumnie „—".
// Szukajka i sortowanie MUSZĄ czytać to samo, co komórka — inaczej wpisanie „nowe" nie
// znajduje pozycji, którą widać na ekranie.
const rowStatusLabel = (node, card) =>
    usesWorkStatuses(node?.type)
        ? statusLabelForType(node.type, node?.status)
        : (STATUS_META[card?.status]?.label || card?.status || '');

// @anchor materials-card-surface — karta produktu dostaje własną, jaśniejszą i chłodniejszą
// płaszczyznę zamiast `bg-black/20`. Poprzednio różnica względem wiersza tabeli wynosiła
// kilka procent krycia bieli i nie było widać, gdzie kończy się tabela, a zaczyna karta.
const CARD_SURFACE = DRAWER.surface;

function WbsMaterialRow({ node, card, accepted = false, offerLocked = false, isExpanded, onToggle, onOpenPurchases, onPatchNode, onCreateCard, materialDb, offers, token, readOnly, onRefresh, onPatchCard, onPropagatePrice, realization, isTouch = false }) {
    const meta = TYPE_META[node.type] || TYPE_META.material;
    const TypeIcon = meta.icon;
    const reqStatus = card?.status;
    const StatusMeta = STATUS_META[reqStatus];

    const [editQty, setEditQty] = useState(false);
    // Prefill: pokaż realną wartość; 0/null/puste → '' (zero znika przy edycji, nie magiczna 1).
    const qtyPrefill = (q) => (parseFloat(String(q).replace(',', '.')) ? String(q) : '');
    const [qtyVal, setQtyVal] = useState(qtyPrefill(node.quantity));
    const [warnField, setWarnField] = useState(null);
    const warnTimer = useRef(null);
    // Pokaż na chwilę ostrzeżenie "tylko cyfry" przy komórce liczbowej ('qty' | 'price').
    const flashWarn = (field) => {
        setWarnField(field);
        if (warnTimer.current) clearTimeout(warnTimer.current);
        warnTimer.current = setTimeout(() => setWarnField(null), 2500);
    };
    useEffect(() => () => { if (warnTimer.current) clearTimeout(warnTimer.current); }, []);
    useEffect(() => {
        if (!editQty) setQtyVal(qtyPrefill(node.quantity));
    }, [node.quantity, editQty]);

    const [editPrice, setEditPrice] = useState(false);
    // Prefill ceny: realna wartość; 0/null/puste → '' (zero znika przy wejściu w edycję).
    const pricePrefill = (p) => (parseFloat(String(p).replace(',', '.')) ? String(p) : '');
    const [priceVal, setPriceVal] = useState(pricePrefill(card?.priceNetto));
    useEffect(() => {
        if (!editPrice) setPriceVal(pricePrefill(card?.priceNetto));
    }, [card?.priceNetto, editPrice]);

    const [creating, setCreating] = useState(false);

    // @anchor wbs-material-row-comment — ta sama edytowalna kolumna „Komentarz" co w WBSHybridTable
    // (pole `WbsNode.comment`). Lokalny bufor, bo zapis idzie na blur, a `node` wraca z rodzica
    // dopiero po odświeżeniu drzewa — bez bufora znaki gubiłyby się w trakcie pisania.
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
        onPatchNode(node.id, { comment: v });
        // Ten sam sygnał co w WBSHybridTable — MarkerDetailsPanel i SchematTab słuchają go,
        // żeby komentarz markera nie rozjechał się z komentarzem węzła WBS.
        window.dispatchEvent(new CustomEvent('wbs-comment-changed', { detail: { wbsNodeIds: [node.id], comment: v } }));
    };

    const handleQtyBlur = () => {
        setEditQty(false);
        const raw = String(qtyVal);
        const evaluated = evalQtyFormula(raw);
        const n = evaluated !== null ? evaluated : parseFloat(raw.replace(',', '.'));
        const v = Number.isFinite(n) && n >= 0 ? n : 0;
        if (v !== node.quantity) onPatchNode(node.id, { quantity: v });
    };

    const handlePriceBlur = () => {
        setEditPrice(false);
        if (!card?.id) return;
        const raw = String(priceVal ?? '').trim();
        const next = parsePriceInput(raw);
        if (raw !== '' && next === null) return;
        if (next === (card.priceNetto ?? null)) return;
        if (onPropagatePrice) onPropagatePrice(card, node, next);
        else if (onPatchCard) onPatchCard(card.id, { priceNetto: next });
    };

    const handleCreateCard = async () => {
        if (!(await guardSnapshotEdit())) return;
        setCreating(true);
        try { await onCreateCard(node); } finally { setCreating(false); }
    };

    const parent = getParentPath(node.path);

    return (
        <tr className={`transition-colors ${isExpanded ? CARD_SURFACE : 'border-b border-white/[0.03] hover:bg-white/[0.02]'}`}>
            {/* Expand — na dotyku przycisk zajmuje całą komórkę (14 px ikona jest nie do trafienia palcem) */}
            <td className={`text-center ${isTouch ? 'relative p-0' : 'w-9 px-2 py-2.5'} ${isExpanded ? GROUP_SPINE : ''}`}>
                <button
                    onClick={onToggle}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Zwiń wiersz' : 'Rozwiń wiersz'}
                    title={isExpanded ? 'Zwiń' : 'Rozwiń'}
                    style={{ touchAction: 'manipulation' }}
                    className={`transition-colors ${isExpanded ? 'text-blue-400 hover:text-blue-300' : 'text-gray-600 hover:text-gray-300'} ${isTouch ? 'absolute inset-0 flex items-center justify-center active:bg-blue-500/25 active:text-blue-300' : ''}`}
                >
                    {isExpanded ? <ChevronDown size={isTouch ? 20 : 14} /> : <ChevronRight size={isTouch ? 20 : 14} />}
                </button>
            </td>
            {/* Przedmiot projektu */}
            <td className="px-3 py-2.5">
                <span className="text-sm text-white break-words" title={node.path}>{parent}</span>
            </td>
            {/* Nazwa — klik rozwija wiersz (drugie, szerokie pole trafienia dla palca) */}
            <td className="px-3 py-2.5 cursor-pointer" onClick={onToggle} style={{ touchAction: 'manipulation' }}>
                <div className="text-sm text-white break-words">{node.name}</div>
                {node.phase && <div className="text-xs text-gray-500 mt-0.5">{node.phase}</div>}
            </td>
            {/* Wymagania techniczne */}
            <td className="px-3 py-2.5">
                <span className="text-sm text-white break-words whitespace-pre-wrap">{card?.technicalSpec || '—'}</span>
            </td>
            {/* Ilość */}
            <td className="px-3 py-2.5">
                {editQty && !readOnly ? (
                    <div className="relative inline-block">
                        <input autoFocus type="text" inputMode="decimal" value={qtyVal}
                            onChange={e => {
                                const val = e.target.value;
                                if (val.startsWith('=')) { setQtyVal(val); return; }
                                const clean = sanitizeQtyInput(val);
                                if (clean !== val) flashWarn('qty');
                                setQtyVal(clean);
                            }}
                            onFocus={e => e.target.select()} onMouseUp={e => e.target.select()}
                            onBlur={handleQtyBlur}
                            onKeyDown={e => { if (e.key === 'Enter') handleQtyBlur(); if (e.key === 'Escape') { setQtyVal(qtyPrefill(node.quantity)); setEditQty(false); } }}
                            placeholder="0"
                            className="w-16 bg-black/30 border border-blue-500/50 rounded px-2 py-0.5 text-sm text-white outline-none placeholder-gray-600" />
                        {warnField === 'qty' && (
                            <span className="absolute left-0 top-full mt-0.5 z-20 whitespace-nowrap text-[10px] text-red-300 bg-red-900/90 border border-red-500/40 px-1.5 py-0.5 rounded shadow-lg">tylko cyfry</span>
                        )}
                    </div>
                ) : (
                    // Po akceptacji baseline ilość jest wartością ofertową — klik nie wchodzi w edycję,
                    // tylko otwiera modal blokady (manager może odblokować na sesję).
                    <span onClick={() => { if (readOnly) return; if (offerLocked) { requestOfferUnlock(); return; } setEditQty(true); }}
                        title={offerLocked ? 'Ilość zamrożona akceptacją baseline' : undefined}
                        className={`text-sm text-gray-200 whitespace-nowrap ${!readOnly ? (offerLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:text-white') : ''}`}>
                        {node.quantity ?? 0} <span className="text-xs text-gray-500">{node.unit || 'szt'}</span>
                        {offerLocked && <Lock size={9} className="inline-block ml-1 -mt-0.5 text-amber-400/60" />}
                    </span>
                )}
            </td>
            {/* Zakup / wykonanie — licznik Σ wpisów wobec planu; klik rozwija wiersz I sekcję wpisów
                pod kartą produktu (sama karta zostaje otwarta). Pasek przy nadmiarze mieści się
                w 100%: plan zajmuje swój udział w sumie, nadwyżka dostaje resztę na czerwono. */}
            {accepted && (() => {
                const r = realization;
                const st = REAL_STATE[r.state] || REAL_STATE.none;
                const main = r.state === 'none' ? 0 : r.state === 'over' ? (r.plan / r.qty) * 100 : r.state === 'closed' ? 100 : Math.min(100, r.pct);
                const over = r.state === 'over' ? 100 - main : 0;
                return (
                    <td className="px-3 py-2.5 text-right">
                        <div onClick={onOpenPurchases || onToggle} title="Kliknij, aby rozwinąć wpisy zakupu / wykonania" className="flex flex-col items-stretch gap-1 cursor-pointer">
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
                );
            })()}
            {/* Δ ilość — zakup/wykonanie minus plan; liczone z sumy wpisów, nie z pojedynczego */}
            {accepted && (() => {
                const d = Math.round((realization.qty - realization.plan) * 1000) / 1000;
                const cls = d > 1e-9 ? 'text-red-300' : d < -1e-9 ? 'text-teal-300' : 'text-gray-600';
                // Zero odchylenia to nie liczba do czytania — plan trafiony w punkt
                // pokazujemy myślnikiem, tak samo jak brak realizacji.
                const brak = Math.abs(d) < 1e-9 || (realization.qty === 0 && !node.realizationClosed);
                return (
                    <td className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">
                        <span className={cls}>{brak ? '—' : `${d > 0 ? '+' : ''}${fmtQty(d)} ${node.unit || 'szt'}`}</span>
                    </td>
                );
            })()}
            {/* Produkt */}
            <td className="px-3 py-2.5">
                {card ? (
                    <div>
                        {card.manufacturer && <div className="text-sm text-white break-words">{card.manufacturer}</div>}
                        {card.model && <div className="text-xs text-gray-400 break-words">{card.model}</div>}
                        {!card.manufacturer && !card.model && <span className="text-sm text-white italic">Brak produktu</span>}
                    </div>
                ) : meta.hasCard === false ? (
                    // Praca, usługa, nocleg, paliwo nie mają karty produktowej — pokazywanie
                    // „Utwórz kartę" kusiłoby do zakładania wymagań materiałowych na robociźnie.
                    <span className="text-sm text-gray-600">—</span>
                ) : (
                    <button onClick={handleCreateCard} disabled={creating || readOnly}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 text-gray-500 hover:text-gray-300 border border-white/10 transition-colors disabled:opacity-40">
                        <Plus size={11} /> {creating ? '...' : 'Utwórz kartę'}
                    </button>
                )}
            </td>
            {/* Cena - inline edit (klik aby edytować, Enter/blur zapisuje, propaguje na duplikaty wariant A) */}
            <td className="px-3 py-2.5 text-sm font-mono whitespace-nowrap text-right">
                {editPrice && !readOnly && card ? (
                    <div className="relative inline-block">
                        <input autoFocus type="text" inputMode="decimal" value={priceVal}
                            onChange={e => {
                                const clean = sanitizeQtyInput(e.target.value);
                                if (clean !== e.target.value) flashWarn('price');
                                setPriceVal(clean);
                            }}
                            onFocus={e => e.target.select()} onMouseUp={e => e.target.select()}
                            onBlur={handlePriceBlur}
                            onKeyDown={e => { if (e.key === 'Enter') handlePriceBlur(); if (e.key === 'Escape') { setPriceVal(pricePrefill(card?.priceNetto)); setEditPrice(false); } }}
                            placeholder="0.00"
                            className="w-24 bg-black/30 border border-blue-500/50 rounded px-2 py-0.5 text-sm text-white outline-none placeholder-gray-600" />
                        {warnField === 'price' && (
                            <span className="absolute left-0 top-full mt-0.5 z-20 whitespace-nowrap text-[10px] text-red-300 bg-red-900/90 border border-red-500/40 px-1.5 py-0.5 rounded shadow-lg">tylko cyfry</span>
                        )}
                    </div>
                ) : (
                    <span onClick={() => { if (readOnly || !card) return; if (offerLocked) { requestOfferUnlock(); return; } setEditPrice(true); }}
                        title={!card && meta.hasCard === false
                            ? 'Koszt jedn. z wyceny liścia (WbsNode.unitCost) — edycja w Budżecie'
                            : (offerLocked ? 'Koszt jedn. oferty zamrożony akceptacją baseline' : undefined)}
                        className={`text-orange-400 ${!readOnly && card ? (offerLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:text-orange-300') : ''}`}>
                        {/* Praca i usługi nie mają karty — plan siedzi wtedy wprost na liściu,
                            a Δ wartość i tak z niego liczy, więc kolumna musi go pokazać */}
                        {card?.priceNetto != null
                            ? `${fmtZl(card.priceNetto)} zł`
                            : (!card && node.unitCost ? `${fmtZl(node.unitCost)} zł` : '—')}
                        {offerLocked && <Lock size={9} className="inline-block ml-1 -mt-0.5 text-amber-400/60" />}
                    </span>
                )}
            </td>
            {/* Koszt jedn. zakupu — średnia ważona wpisów realizacji (każdy ma własną cenę),
                a przy braku wpisów cena z propozycji `isPurchase` (pozycje sprzed wpisów).
                Read-only: wynika z wpisów, więc edytuje się je, nie komórkę. */}
            {accepted && (() => {
                const fromEntries = realization.avg;
                const pu = fromEntries ?? purchaseUnitOf(card);
                return (
                    <td className="px-3 py-2.5 text-sm font-mono whitespace-nowrap text-right">
                        <span className="text-red-400" title={fromEntries != null && realization.mixedPrices ? 'Średnia ważona z wpisów realizacji' : undefined}>
                            {pu != null ? `${fmtZl(pu)} zł` : '—'}
                            {fromEntries != null && realization.mixedPrices && <span className="text-[10px] text-gray-500 ml-1">śr.</span>}
                        </span>
                    </td>
                );
            })()}
            {/* Δ wartość — realizacja minus plan z wyceny; plan bierzemy z ceny karty, a dla
                pracy i usług z `unitCost` liścia, bo tam nie ma karty produktowej */}
            {accepted && (() => {
                const planUnit = card?.priceNetto ?? node.unitCost ?? null;
                const planValue = planUnit != null ? planUnit * (Number(node.quantity) || 0) : null;
                const has = realization.qty > 0 || node.realizationClosed;
                const d = has && planValue != null ? Math.round((realization.value - planValue) * 100) / 100 : null;
                const cls = d == null ? 'text-gray-600' : d > 0.005 ? 'text-red-300' : d < -0.005 ? 'text-teal-300' : 'text-gray-500';
                return (
                    <td className="px-3 py-2.5 text-sm font-mono whitespace-nowrap text-right">
                        <span className={cls}>{d == null ? '—' : `${d > 0 ? '+' : ''}${fmtZl(d)} zł`}</span>
                    </td>
                );
            })()}
            {/* Status — edytowalny dropdown. Materiał i sprzęt edytują status KARTY
                (`MaterialRequirement.status`), praca, usługa, nocleg i paliwo — status
                WĘZŁA (`WbsNode.status`), bo karty nie mają. Do tej pory ta kolumna
                pokazywała nad nimi „—" i nie dało się z tego widoku ruszyć ich stanu. */}
            <td className="px-3 py-2.5">
                {usesWorkStatuses(node.type) ? (() => {
                    const statusMap = statusMetaForType(node.type);
                    // Kod materiałowy zapisany tu przed rozdzieleniem list pokazuje się jako
                    // „Nowe"; bazy nie ruszamy, dopiero wybór z listy utrwala nowy kod.
                    const code = resolveStatusCode(node.type, node.status);
                    return (
                        <select
                            value={code}
                            onChange={e => { if (!readOnly) onPatchNode?.(node.id, { status: e.target.value }); }}
                            disabled={readOnly}
                            className={`bg-transparent border border-white/10 rounded px-1.5 py-0.5 text-xs font-semibold outline-none cursor-pointer hover:bg-white/5 transition-colors ${statusMap[code]?.color || 'text-gray-500'}`}
                            style={{ WebkitAppearance: 'auto' }}
                        >
                            {statusOptionsForType(node.type).map(c => (
                                <option key={c} value={c} className="bg-gray-900 text-white font-normal">{statusMap[c].label}</option>
                            ))}
                        </select>
                    );
                })() : card ? (
                    <select
                        value={card.status || 'NEW'}
                        onChange={async e => {
                            if (!readOnly && onPatchCard) await onPatchCard(card.id, { status: e.target.value });
                        }}
                        disabled={readOnly}
                        className={`bg-transparent border border-white/10 rounded px-1.5 py-0.5 text-xs font-semibold outline-none cursor-pointer hover:bg-white/5 transition-colors ${StatusMeta?.color || 'text-gray-500'}`}
                        style={{ WebkitAppearance: 'auto' }}
                    >
                        {Object.entries(STATUS_META).map(([v, m]) => (
                            <option key={v} value={v} className="bg-gray-900 text-white font-normal">{m.label}</option>
                        ))}
                    </select>
                ) : (
                    <span className="text-sm text-gray-600">—</span>
                )}
            </td>
            {/* Komentarz — `WbsNode.comment`, wspólne pole z kolumną „Komentarz" w WBSHybridTable.
                Nie jest wartością ofertową, więc akceptacja baseline (offerLocked) go nie zamraża. */}
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
        </tr>
    );
}

// ─── Wiersze realizacji ───────────────────────────────────────────────────────

// @anchor realization-row-font — jeden rozmiar czcionki dla WSZYSTKICH okien wpisu zakupu:
// pola, dropdown dostawcy, wartość wpisu, etykiety i przyciski wiersza. Równy polom karty
// produktu (`text-xs`) i wierszom propozycji — rozwinięty liść ma jeden rozmiar tekstu od
// karty aż po ostatni wpis, bo to jedna grupa i skoki wielkości ją rozbijały.
const ROW_FONT = 'text-xs';

// @anchor realization-row-input — wspólny wygląd pól w wierszach zakupowych. Ta sama
// wysokość i rozmiar tekstu co w polach karty produktu.
const ROW_INPUT = `w-full bg-black/40 border border-white/10 rounded px-2 py-1 ${ROW_FONT} text-white outline-none focus:border-teal-500/50 placeholder-gray-700`;

// @anchor realization-entry-row — jeden wpis realizacji jako wiersz potomny pozycji,
// w całości edytowalny w miejscu: data, komentarz, dostawca, nr dokumentu, ilość,
// producent, model i koszt jedn. Zapis idzie na blur (Enter = blur), tylko dla pola,
// które faktycznie się zmieniło — bez „zapisz", bo wiersz jest formularzem sam w sobie.
// Producent i model siedzą NA WPISIE, nie na pozycji: druga dostawa bywa zamiennikiem
// i musi się dać zapisać osobno od pierwszej.
function RealizationEntryRow({ entry, node, cols, readOnly, onSave, onDelete }) {
    const author = [entry.author?.firstName, entry.author?.lastName].filter(Boolean).join(' ') || entry.author?.email || '';
    const [draft, setDraft] = useState({});

    const orig = (k) => (k === 'entryDate' ? fmtDate(entry.entryDate) : (entry[k] ?? ''));
    const get = (k) => (draft[k] !== undefined ? draft[k] : String(orig(k)));
    const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
    const drop = (k) => setDraft(d => { const n = { ...d }; delete n[k]; return n; });
    // @anchor realization-entry-num-keys — pola liczbowe wpisu. Wpisuje się w nie tak samo
    // jak w kolumny tabeli i w koszt jedn. propozycji: cyfry albo działanie od „=".
    // Formuła musi zostać policzona TUTAJ, bo backend dostaje surową wartość z pola.
    const NUM_KEYS = ['qty', 'unitCost'];
    const commit = (k) => {
        const raw = get(k);
        if (NUM_KEYS.includes(k)) {
            const n = parsePriceInput(raw);
            // Pusto albo nieczytelnie — zostaw wpis jak był, nie zeruj ilości ani kosztu
            if (n === null) { drop(k); return; }
            if (Number(orig(k)) !== n) onSave(entry.id, { [k]: n });
            drop(k);
            return;
        }
        const next = raw;
        if (String(orig(k)) === String(next)) { drop(k); return; }
        onSave(entry.id, { [k]: next });
        drop(k);
    };
    const onKey = (e, k) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { drop(k); e.currentTarget.blur(); }
    };
    const field = (k, extra = '', props = {}) => (
        <input value={get(k)} disabled={readOnly}
            onChange={e => set(k, props.sanitize ? sanitizeQtyInput(e.target.value) : e.target.value)}
            onBlur={() => commit(k)} onKeyDown={e => onKey(e, k)}
            placeholder={props.placeholder} aria-label={props.label}
            className={`${ROW_INPUT} ${extra} disabled:opacity-60`} />
    );

    const wartosc = (Number(get('qty')) || 0) * (Number(String(get('unitCost')).replace(',', '.')) || 0);

    return (
        <tr className={`group/entry ${CARD_SURFACE} ${DRAWER.hoverRow} border-b border-white/[0.03]`}>
            {/* Wąska kolumna rozwijania niesie znacznik „to jest wpis, nie pozycja" */}
            <td className={`px-2 py-2 text-center ${GROUP_SPINE} text-gray-700 font-mono ${ROW_FONT}`}>·</td>
            {cols.map(c => {
                if (c.key === 'parent') return (
                    <td key={c.key} className="px-2 py-2">
                        {field('entryDate', 'font-mono', { label: 'Data zdarzenia' })}
                    </td>
                );
                if (c.key === 'name') return (
                    <td key={c.key} className="px-2 py-2">
                        {field('comment', '', { placeholder: 'komentarz — co zrobione', label: 'Komentarz wpisu' })}
                        {author && <div className={`${ROW_FONT} text-gray-600 mt-0.5 truncate`} title={author}>· {author}</div>}
                    </td>
                );
                if (c.key === 'techSpec') return (
                    <td key={c.key} className={`px-2 py-2 ${ROW_FONT}`}>
                        {readOnly
                            ? <span className={`${ROW_FONT} text-gray-400`}>{entry.supplier?.name || '—'}</span>
                            : <SupplierPicker dark size="sm" textClass={ROW_FONT} value={entry.supplier?.id ?? null} onChange={s => onSave(entry.id, { supplierId: s?.id ?? null })} />}
                    </td>
                );
                if (c.key === 'qty') return (
                    <td key={c.key} className="px-2 py-2">
                        {field('docNumber', 'font-mono', { placeholder: 'FV / PZ', label: 'Numer dokumentu' })}
                    </td>
                );
                if (c.key === 'realization') return (
                    <td key={c.key} className="px-2 py-2">
                        {field('qty', 'font-mono text-right', { label: 'Ilość wpisu', sanitize: true })}
                    </td>
                );
                if (c.key === 'product') return (
                    <td key={c.key} className="px-2 py-2 space-y-1">
                        {TYPE_META[node?.type]?.hasCard !== false ? <>
                            {field('manufacturer', '', { placeholder: 'producent', label: 'Producent' })}
                            {field('model', '', { placeholder: 'model', label: 'Model' })}
                        </> : field('scope', '', { placeholder: 'zakres — co obejmuje', label: 'Zakres' })}
                    </td>
                );
                if (c.key === 'purchasePrice') return (
                    <td key={c.key} className="px-2 py-2">
                        {field('unitCost', 'font-mono text-right', { label: 'Koszt jednostkowy', sanitize: true })}
                    </td>
                );
                if (c.key === 'deltaValue') return (
                    // bez „zł" — waluta wynika z nagłówka kolumny
                    <td key={c.key} className={`px-1.5 py-2 text-right font-mono ${ROW_FONT} text-gray-400 whitespace-nowrap`}>
                        {fmtZl(wartosc)}
                        {!readOnly && (
                            <button onClick={() => onDelete(entry.id)} title="Usuń wpis realizacji"
                                className="ml-2 opacity-0 group-hover/entry:opacity-100 text-gray-600 hover:text-red-400 transition-all align-middle"><Trash2 size={14} /></button>
                        )}
                    </td>
                );
                return <td key={c.key} className="px-2 py-2" />;
            })}
        </tr>
    );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

// Kolumna `purchasePrice` (Koszt jedn. zakupu) pojawia się TYLKO po akceptacji baseline
// (baselineOnly) — odfiltrowywana w `visibleCols`. Etap ofertowania: sam „Koszt jedn. oferty".
const COL_DEFS = [
    { key: 'parent',        label: 'Przedmiot projektu',   defaultW: 190 },
    { key: 'name',          label: 'Nazwa',                defaultW: 240 },
    { key: 'techSpec',      label: 'Wymagania techniczne', defaultW: 210 },
    { key: 'qty',           label: 'Ilość wyceny',         defaultW: 130 },
    // @anchor wbs-materials-realization-col — licznik „Σ wpisów / plan" z paskiem;
    // klik rozwija wiersze wpisów, tam też siedzi „+ dopisz"
    { key: 'realization',   label: 'Zakup / wykonanie',    defaultW: 150, align: 'right', baselineOnly: true },
    { key: 'deltaQty',      label: 'Δ ilość',              defaultW: 110, align: 'right', baselineOnly: true },
    { key: 'product',       label: 'Produkt',              defaultW: 200 },
    { key: 'price',         label: 'Koszt jedn. oferty',   defaultW: 128, align: 'right' },
    { key: 'purchasePrice', label: 'Koszt jedn. zakupu',   defaultW: 150, align: 'right', baselineOnly: true },
    { key: 'deltaValue',    label: 'Δ wartość',            defaultW: 140, align: 'right', baselineOnly: true },
    { key: 'status',        label: 'Status oferty',        defaultW: 148 },
    { key: 'comment',       label: 'Komentarz',            defaultW: 200 },
];

// @anchor pl-entries-label — polska odmiana liczebnika w pasku wpisów: 1 wpis, 2–4 wpisy,
// 5+ wpisów (z wyjątkiem nastek: 12 wpisów, nie „12 wpisy").
const entriesLabel = (n) => {
    const t = n % 10;
    const s = n % 100;
    if (n === 1) return '1 wpis';
    if (t >= 2 && t <= 4 && !(s >= 12 && s <= 14)) return `${n} wpisy`;
    return `${n} wpisów`;
};

// @anchor purchases-bar — pasek „Zakupy / wykonanie" pod kartą produktu: przełącznik sekcji wpisów
// i zarazem jej podsumowanie (Σ wpisów wobec planu, liczba wpisów, wartość) plus przycisk
// „Rozlicz". Osobny wiersz tabeli, bo wpisy są wierszami potomnymi liścia i muszą trzymać układ
// kolumn. Renderowany dla KAŻDEGO liścia — także bez karty produktowej (praca, usługa), bo od
// kiedy panel nie ma wiersza dopisywania, bez paska rozwinięcie takiego liścia bywało puste.
// Przycisk „Rozlicz" siedzi tu, a nie w wierszu — w Materiałach nie ma już innego miejsca,
// z którego dałoby się oznaczyć pozycję jako rozliczoną. Pasek NIE jest jednym <button>,
// bo przycisk rozliczenia nie może być zagnieżdżony w przycisku zwijania.
export function PurchasesBar({ node, realization, colSpan, open, onToggle, readOnly, onToggleClosed }) {
    const st = REAL_STATE[realization.state] || REAL_STATE.none;
    const closed = !!node.realizationClosed;
    return (
        <tr>
            <td colSpan={colSpan} className={`p-0 ${CARD_SURFACE} border-b border-white/5 ${GROUP_SPINE}`}>
                <div className="flex items-center gap-3 pr-3">
                    <button
                        onClick={onToggle}
                        title={open ? 'Zwiń wpisy zakupu / wykonania' : 'Rozwiń wpisy zakupu / wykonania'}
                        className="flex-1 flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-white/[0.03] transition-colors select-none"
                    >
                        <ChevronDown size={12} className={`text-teal-400 transition-transform ${open ? '' : '-rotate-90'}`} />
                        <span className="text-[10px] uppercase tracking-widest text-gray-600">zakupy / wykonanie</span>
                        <span className={`font-mono ${st.text}`}>{fmtQty(realization.qty)}</span>
                        <span className="font-mono text-gray-500">/ {fmtQty(realization.plan)} {node.unit || 'szt'}</span>
                        <span className="text-gray-500">{entriesLabel(realization.entries.length)}</span>
                        {realization.value > 0 && (
                            <span className="text-gray-400">wartość <span className="font-mono text-red-400">{fmtZl(realization.value)} zł</span></span>
                        )}
                    </button>
                    {readOnly
                        ? closed && <span className="text-[9px] font-bold uppercase tracking-widest text-teal-300/80">rozliczone</span>
                        : (
                            <button onClick={onToggleClosed}
                                title={closed ? 'Pozycja rozliczona — kliknij, aby wznowić' : 'Rozlicz pozycję mimo niedowykonania planu'}
                                className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors ${
                                    closed
                                        ? 'border-teal-500/30 bg-teal-500/10 text-teal-300'
                                        : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                                }`}>
                                {closed ? 'Rozliczone' : 'Rozlicz'}
                            </button>
                        )}
                </div>
            </td>
        </tr>
    );
}

// @anchor wbs-materials-panel
export default function WbsMaterialsPanel({
    nodeId,
    versionId,
    readOnly = false,
    accepted = false,
    // @anchor wbs-materials-offer-locked — akceptacja baseline zamraża kolumny „Ilość" i
    // „Koszt jedn. oferty" oraz wartości ofertowe w karcie produktu (`ProductCard`); wiersze
    // realizacji i kolumna „Koszt jedn. zakupu" zostają edytowalne. Rozdzielone od `accepted`
    // (ta steruje widocznością kolumn zakupowych), bo manager może odblokować edycję nie
    // zmieniając stanu akceptacji.
    offerLocked = false,
    onWbsUpdate,
    onWbsNodeUnitCostChange,
    onPatchNode,
    onQuantityChange,
    externalWbsNodes,
    refreshKey = 0,
    searchQuery = '',
    projectName = '',
    orderName = '',
    onExportReady,
}) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    // @anchor wbs-materials-is-touch — dotyk czytamy raz w panelu i przekazujemy do wierszy
    // (`useDevice` w każdym wierszu zakładałby setki listenerów matchMedia).
    const { isTouch } = useDevice();

    const [internalWbsNodes, setInternalWbsNodes] = useState([]);
    const wbsNodes = externalWbsNodes ?? internalWbsNodes;

    const [cards, setCards] = useState({});
    const [materialDb, setMaterialDb] = useState([]);
    const [offers, setOffers] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    // @anchor wbs-materials-purchases-open — sekcja wpisów zakupu/wykonania siedzi POD kartą produktu
    // i domyślnie jest zwinięta: rozwinięcie wiersza służy najpierw karcie („co miało być kupione"),
    // a wpisy dopisuje się świadomie. Stan jest jeden na panel (rozwinięty bywa tylko jeden wiersz)
    // i pamiętany w localStorage — logistyk przeglądający serię zakupów nie otwiera sekcji przy każdej
    // pozycji od nowa. Dotyczy tak samo liści bez karty (praca, usługa): one też dostają pasek.
    const [purchasesOpen, setPurchasesOpen] = useState(() => {
        try { return localStorage.getItem('wbsPurchasesOpen') === '1'; } catch { return false; }
    });
    // @anchor wbs-materials-toggle-purchases — przełącznik sekcji wpisów; `next` wymusza stan
    // (klik w kolumnę „Zakup / wykonanie" ma otwierać, nie przełączać w ciemno).
    const togglePurchases = useCallback((next) => {
        setPurchasesOpen(prev => {
            const v = next === undefined ? !prev : next;
            try { localStorage.setItem('wbsPurchasesOpen', v ? '1' : '0'); } catch { /* tryb prywatny */ }
            return v;
        });
    }, []);
    const [loading, setLoading] = useState(!externalWbsNodes);

    // ─ Sorting / filtering / column widths ──────────────────────────────────
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [colFilters, setColFilters] = useState({});
    const [colWidths, setColWidths] = useState(
        () => Object.fromEntries(COL_DEFS.map(c => [c.key, c.defaultW]))
    );
    const resizeDrag = useRef(null);

    // Kolumny widoczne: „Koszt jedn. zakupu" tylko po akceptacji baseline (accepted).
    const visibleCols = useMemo(() => COL_DEFS.filter(c => !c.baselineOnly || accepted), [accepted]);

    const matNodes = useMemo(() =>
        wbsNodes.filter(n => LEAF_TYPES.includes(n.type)),
        [wbsNodes]
    );

    // @anchor wbs-materials-actuals — wpisy realizacji całego zamówienia, grupowane po
    // korzeniu klonu liścia. Jeden fetch na panel: wiersze wpisów i licznik w nagłówku
    // liczą się z tej samej listy, więc nie rozjeżdżają się po dopisaniu.
    const [actuals, setActuals] = useState([]);
    const actualsByRoot = useMemo(() => {
        const map = {};
        for (const a of actuals) {
            if (!map[a.wbsRootId]) map[a.wbsRootId] = [];
            map[a.wbsRootId].push(a);
        }
        return map;
    }, [actuals]);
    const entriesOf = useCallback((node) => actualsByRoot[wbsRootOf(node)] || [], [actualsByRoot]);

    const sortedFilteredNodes = useMemo(() => {
        let nodes = [...matNodes];

        const matchTokens = (text, q) =>
            q.split(/[\s/]+/).filter(Boolean).every(t => text.toLowerCase().includes(t));

        // Global search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            nodes = nodes.filter(n => {
                const c = cards[n.id];
                const parent = getParentPath(n.path);
                return (n.name || '').toLowerCase().includes(q) ||
                    (TYPE_META[n.type]?.label || '').toLowerCase().includes(q) ||
                    matchTokens(parent, q) ||
                    (c?.manufacturer || '').toLowerCase().includes(q) ||
                    (c?.model || '').toLowerCase().includes(q) ||
                    (n.comment || '').toLowerCase().includes(q) ||
                    rowStatusLabel(n, c).toLowerCase().includes(q);
            });
        }

        // Per-column filters
        for (const [key, val] of Object.entries(colFilters)) {
            if (!val) continue;
            const q = val.toLowerCase();
            nodes = nodes.filter(n => {
                const c = cards[n.id];
                const parent = getParentPath(n.path);
                if (key === 'parent') return matchTokens(parent, q);
                if (key === 'name')   return (n.name || '').toLowerCase().includes(q);
                if (key === 'qty')    return String(n.quantity ?? '').includes(q);
                if (key === 'product') return `${c?.manufacturer || ''} ${c?.model || ''}`.toLowerCase().includes(q);
                if (key === 'price')  return String(c?.priceNetto ?? '').includes(q);
                if (key === 'purchasePrice') return String(purchaseUnitOf(c) ?? '').includes(q);
                if (key === 'techSpec') return (c?.technicalSpec || '').toLowerCase().includes(q);
                if (key === 'comment') return (n.comment || '').toLowerCase().includes(q);
                if (key === 'status') return rowStatusLabel(n, c).toLowerCase().includes(q);
                return true;
            });
        }

        // Sort
        nodes.sort((a, b) => {
            const ca = cards[a.id];
            const cb = cards[b.id];
            let cmp = 0;
            if (sortConfig.key === 'parent') {
                const pa = getParentPath(a.path);
                const pb = getParentPath(b.path);
                cmp = pa.localeCompare(pb, 'pl');
            } else if (sortConfig.key === 'name') {
                cmp = (a.name || '').localeCompare(b.name || '', 'pl');
            } else if (sortConfig.key === 'qty') {
                cmp = (a.quantity ?? 1) - (b.quantity ?? 1);
            } else if (sortConfig.key === 'product') {
                const pa = `${ca?.manufacturer || ''} ${ca?.model || ''}`.trim();
                const pb = `${cb?.manufacturer || ''} ${cb?.model || ''}`.trim();
                cmp = pa.localeCompare(pb, 'pl');
            } else if (sortConfig.key === 'price') {
                cmp = (ca?.priceNetto ?? Infinity) - (cb?.priceNetto ?? Infinity);
            } else if (sortConfig.key === 'purchasePrice') {
                cmp = (purchaseUnitOf(ca) ?? Infinity) - (purchaseUnitOf(cb) ?? Infinity);
            } else if (sortConfig.key === 'realization' || sortConfig.key === 'deltaQty' || sortConfig.key === 'deltaValue') {
                // Sortowanie po realizacji: „ile zrobione" wobec planu — najpierw pozycje
                // nieruszone, na końcu przekroczone. Δ wartość idzie kwotą, nie procentem.
                const ra = realizationOf(a, actualsByRoot[wbsRootOf(a)] || []);
                const rb = realizationOf(b, actualsByRoot[wbsRootOf(b)] || []);
                if (sortConfig.key === 'realization') cmp = ra.pct - rb.pct;
                else if (sortConfig.key === 'deltaQty') cmp = (ra.qty - ra.plan) - (rb.qty - rb.plan);
                else {
                    const va = ra.value - (ca?.priceNetto ?? a.unitCost ?? 0) * (a.quantity || 0);
                    const vb = rb.value - (cb?.priceNetto ?? b.unitCost ?? 0) * (b.quantity || 0);
                    cmp = va - vb;
                }
            } else if (sortConfig.key === 'techSpec') {
                cmp = (ca?.technicalSpec || '').localeCompare(cb?.technicalSpec || '', 'pl');
            } else if (sortConfig.key === 'comment') {
                cmp = (a.comment || '').localeCompare(b.comment || '', 'pl');
            } else if (sortConfig.key === 'status') {
                cmp = rowStatusLabel(a, ca).localeCompare(rowStatusLabel(b, cb), 'pl');
            }
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });

        return nodes;
    }, [matNodes, cards, sortConfig, colFilters, searchQuery, actualsByRoot]);

    // ─ Data fetching ─────────────────────────────────────────────────────────

    // @anchor refresh-cards-seq — numer ostatniego odświeżenia listy kart. Odpowiedzi wracają w innej
    // kolejności niż wysłane (widoczne dopiero przy realnym opóźnieniu sieci na produkcji) — starsza
    // nadpisywała nowszą i pola panelu wracały do poprzednich wartości.
    const refreshCardsSeq = useRef(0);

    const fetchCards = useCallback(async () => {
        if (!nodeId) return;
        if (!externalWbsNodes) setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            let flatNodes = externalWbsNodes || [];
            if (!externalWbsNodes) {
                const wbsRes = await fetch(
                    `${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`,
                    { headers }
                );
                if (wbsRes.ok) {
                    const data = await wbsRes.json();
                    flatNodes = flattenWbsNodes(data.items || []);
                    setInternalWbsNodes(flatNodes);
                }
            }
            const reqRes = await fetch(
                `${API_URL}/material-requirements/node/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`,
                { headers }
            );
            if (reqRes.ok) {
                const reqs = await reqRes.json();
                const map = {};
                const reqById = Object.fromEntries(reqs.map(r => [r.id, r]));
                const reqByWbsNodeId = {};
                const reqByName = {};
                for (const r of reqs) {
                    if (r.wbsNodeId) reqByWbsNodeId[r.wbsNodeId] = r;
                    if (r.name) reqByName[String(r.name).trim().toLowerCase()] = r;
                }
                // Ta sama priorytetyzacja dopasowania węzeł↔wymaganie co w WBSHybridTable
                // (MaterialReqExpandPanel): 1) tag req:<id> — bezpośrednie połączenie liść↔wymaganie
                // (najwłaściwsze), 2) wbsNodeId — węzeł jest właścicielem wymagania, 3) fallback po nazwie —
                // węzły snapshot (klonowane ID) i stare bez tagu req:. Bez wspólnej kolejności oba widoki
                // (WBS/HybridTable i WBS/Materiały) pokazywały różne materiały dla tego samego liścia.
                const matNodeList = flatNodes.filter(n => n.type === 'material' || n.type === 'equipment');
                for (const node of matNodeList) {
                    const reqTag = (node.tags || []).find(t => typeof t === 'string' && t.startsWith('req:'));
                    const req =
                        (reqTag && reqById[reqTag.slice(4)]) ||
                        reqByWbsNodeId[node.id] ||
                        reqByName[String(node.name || '').trim().toLowerCase()] ||
                        null;
                    if (req) map[node.id] = flattenReq(req);
                }
                setCards(map);
            }
        } catch (e) {
            console.error('[WbsMaterialsPanel] fetchCards error:', e);
        } finally {
            setLoading(false);
        }
    }, [nodeId, versionId, token, externalWbsNodes]);

    // @anchor fetch-actuals — GET /leaf-actuals/order/:nodeId. Wpisy wiszą na korzeniu
    // klonu liścia, więc pobieramy je dla całego zamówienia raz, niezależnie od wersji.
    const fetchActuals = useCallback(async () => {
        if (!nodeId) return;
        try {
            const res = await fetch(`${API_URL}/leaf-actuals/order/${nodeId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setActuals(await res.json());
        } catch (e) {
            console.error('[WbsMaterialsPanel] fetchActuals error:', e);
        }
    }, [nodeId, token]);

    const fetchMaterialDb = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/materials`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMaterialDb(data.map(m => ({ ...m, manufacturer: m.manufacturer ? m.manufacturer.toUpperCase() : m.manufacturer })));
            }
        } catch {}
    }, [token]);

    const fetchOffers = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/offers/node/${nodeId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setOffers(await res.json());
        } catch {}
    }, [nodeId, token]);

    useEffect(() => {
        fetchCards();
        fetchMaterialDb();
        fetchOffers();
        fetchActuals();
    }, [fetchCards, fetchMaterialDb, fetchOffers, fetchActuals, refreshKey]);

    // @anchor wbs-materials-panel-global-update-listener
    useEffect(() => {
        const handler = ({ detail: { id, updates } }) => {
            setMaterialDb(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
            setCards(prev => {
                let changed = false;
                const next = {};
                for (const [k, v] of Object.entries(prev)) {
                    if (v?.id === id) { next[k] = { ...v, ...updates }; changed = true; }
                    else next[k] = v;
                }
                return changed ? next : prev;
            });
        };
        window.addEventListener('material-req-updated', handler);
        return () => window.removeEventListener('material-req-updated', handler);
    }, []);

    const prevExternalRef = useRef(null);
    useEffect(() => {
        if (!externalWbsNodes) return;
        if (externalWbsNodes !== prevExternalRef.current) {
            prevExternalRef.current = externalWbsNodes;
            fetchCards();
        }
    }, [externalWbsNodes, fetchCards]);

    // ─ Mutations ─────────────────────────────────────────────────────────────

    const patchWbsNode = useCallback(async (wbsNodeId, data) => {
        await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(data),
        });
        if (!externalWbsNodes) {
            setInternalWbsNodes(prev => prev.map(n => n.id === wbsNodeId ? { ...n, ...data } : n));
        }
        onPatchNode?.(wbsNodeId, data);
        if (data.quantity !== undefined && onQuantityChange) {
            const nodeName = wbsNodes.find(n => n.id === wbsNodeId)?.name || '';
            await onQuantityChange(wbsNodeId, data.quantity, nodeName);
        }
        onWbsUpdate?.();
    }, [onWbsUpdate, onPatchNode, externalWbsNodes, wbsNodes, onQuantityChange]);

    // @anchor update-actual — edycja pojedynczego pola wpisu (blur w wierszu).
    // Wysyłamy tylko zmienione pole, więc równoległe poprawki w dwóch komórkach
    // nie nadpisują się nawzajem.
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

    // @anchor delete-actual
    const deleteActual = useCallback(async (id) => {
        const res = await fetch(`${API_URL}/leaf-actuals/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Nie udało się usunąć wpisu');
            return;
        }
        await fetchActuals();
    }, [fetchActuals]);

    // @anchor toggle-realization-closed — rozliczenie pozycji mimo niedowykonania planu.
    // Osobny endpoint (nie PATCH /wbs-nodes), bo to decyzja rozliczeniowa idąca do AuditLog;
    // lokalną kopię węzła aktualizujemy tak samo jak `patchWbsNode`.
    const toggleRealizationClosed = useCallback(async (node) => {
        const closed = !node.realizationClosed;
        const res = await fetch(`${API_URL}/leaf-actuals/close/${node.id}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ closed }),
        });
        if (!res.ok) return;
        if (!externalWbsNodes) {
            setInternalWbsNodes(prev => prev.map(n => n.id === node.id ? { ...n, realizationClosed: closed } : n));
        }
        onPatchNode?.(node.id, { realizationClosed: closed });
    }, [externalWbsNodes, onPatchNode]);

    const createCard = useCallback(async (node) => {
        const reqType = wbsTypeFromAny(node.type) === 'equipment' ? 'equipment' : 'material';
        const res = await fetch(`${API_URL}/material-requirements`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                nodeId,
                versionId: versionId || null,
                name: node.name,
                type: reqType,
                quantity: node.quantity || 1,
                unit: node.unit || 'szt',
                wbsNodeId: node.id,
            }),
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error('[createCard] błąd tworzenia karty:', res.status, errText, 'wbsNodeId:', node.id);
            return;
        }
        const created = await res.json();
        setCards(prev => ({ ...prev, [node.id]: created }));
        setExpandedId(node.id);
    }, [nodeId, versionId]);

    // `opts.silent` — edycja pola propozycji, która nie zmienia budżetu. Pomija onWbsUpdate
    // (reqRefreshKey + refreshMaterialCosts + refreshWbsNodes), bo ten łańcuch przeładowuje całą
    // sekcję i przy każdym opuszczonym polu wyglądał jak restart widoku.
    const refreshCards = useCallback(async (opts) => {
        if (!nodeId) return;
        const seq = ++refreshCardsSeq.current;
        const res = await fetch(
            `${API_URL}/material-requirements/node/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok && seq === refreshCardsSeq.current) {
            const reqs = await res.json();
            const map = {};
            for (const r of reqs) { if (r.wbsNodeId) map[r.wbsNodeId] = flattenReq(r); }
            // Fallback: match by name
            const flatNodes = externalWbsNodes ?? internalWbsNodes;
            const matNodeList = flatNodes.filter(n => n.type === 'material' || n.type === 'equipment');
            for (const r of reqs) {
                if (r.wbsNodeId) continue;
                const reqName = (r.name || r.productName || '').toLowerCase().trim();
                if (!reqName) continue;
                const match = matNodeList.find(n =>
                    (n.name || '').toLowerCase().trim() === reqName && !map[n.id]
                );
                if (match) map[match.id] = flattenReq(r);
            }
            setCards(map);
            if (!opts?.silent) onWbsUpdate?.();
        }
    }, [nodeId, versionId, token, onWbsUpdate, externalWbsNodes, internalWbsNodes]);

    // @anchor materials-patch-card-status-sync — status pozycji mieszka w DWÓCH kolumnach:
    // `MaterialRequirement.status` (czyta go ten panel) i `WbsNode.status` (czytają go tabela WBS
    // i zakładka Realizacja). Ten panel zapisywał tylko kartę, więc status ustawiony w Materiałach
    // nie docierał nigdzie indziej — na produkcji rozjechało się tak 131 pozycji, w większości
    // „karta ma status, węzeł pusty albo PENDING". Widać to było jako różnicę MIĘDZY UŻYTKOWNIKAMI,
    // bo manager ustawia status z drzewa WBS (tamten zapis szedł na oba pola), a logistyk z tego
    // panelu. Zapisujemy więc oba pola, tak samo jak robią to `WBSHybridTable` i `RealizationTab`.
    //
    // Węzłów bywa kilka na jedną kartę: dopasowanie liść↔wymaganie ma fallback po nazwie, więc ta
    // sama karta potrafi obsłużyć kilka liści. Status dostają wszystkie — inaczej część wierszy WBS
    // zostałaby ze starą wartością i rozjazd wróciłby tylnymi drzwiami.
    const patchCard = useCallback(async (cardId, data) => {
        await fetch(`${API_URL}/material-requirements/${cardId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(data),
        });
        if (data?.status !== undefined) {
            const wbsNodeIds = Object.entries(cards).filter(([, c]) => c?.id === cardId).map(([id]) => id);
            await Promise.all(wbsNodeIds.map(id =>
                fetch(`${API_URL}/wbs-nodes/${id}`, {
                    method: 'PATCH',
                    headers: authHeaders(),
                    body: JSON.stringify({ status: data.status }),
                }).catch(e => console.error('[WbsMaterialsPanel] status → WbsNode error:', e))
            ));
            // `onPatchNode` bierze POJEDYNCZY węzeł (`UnifiedWbsPanel` mapuje po `n.id === id`) —
            // tablica przeszłaby bez błędu i po cichu nie zaktualizowała niczego.
            wbsNodeIds.forEach(id => onPatchNode?.(id, { status: data.status }));
        }
        await refreshCards();
    }, [refreshCards, cards, onPatchNode]);

    // Wariant A: ten sam materiał (po nazwie WBS węzła) w obrębie projektu = jedna cena.
    // Materials view jest już ograniczony do scope projektu (nodeId), więc dopasowanie
    // po samej nazwie jest bezpieczne. Używamy node.name (zawsze poprawna), nie card.name -
    // zdarzają się orphan requirements z pustą nazwą (auto-generated) gdzie wiersz pokazuje
    // node.name, ale card.name=''. Wcześniej te karty były pomijane przy propagacji.
    const propagatePriceNetto = useCallback(async (sourceCard, sourceWbsNode, priceNetto) => {
        if (!sourceCard?.id) return;
        const flatNodes = externalWbsNodes ?? internalWbsNodes;
        const nodeNameById = new Map((flatNodes || []).map(n => [n.id, String(n.name || '').trim().toLowerCase()]));
        const targetName = String(sourceWbsNode?.name || sourceCard.name || '').trim().toLowerCase();

        // Zbierz wszystkie pozycje tego samego materiału (Wariant A: dopasowanie po nazwie
        // węzła WBS). Bez nazwy — tylko karta źródłowa.
        const affected = Object.entries(cards).filter(([wbsNodeId, c]) =>
            c?.id && (targetName ? nodeNameById.get(wbsNodeId) === targetName : c.id === sourceCard.id));
        const entries = affected.length > 0 ? affected : [[sourceWbsNode?.id, sourceCard]];
        const cardIds = Array.from(new Set(entries.map(([, c]) => c?.id).filter(Boolean)));
        const wbsNodeIds = Array.from(new Set(entries.map(([nid]) => nid).filter(Boolean)));

        // Optimistic update wszystkich dotkniętych kart
        setCards(prev => {
            const updated = { ...prev };
            for (const [nid, c] of Object.entries(updated)) {
                if (c?.id && cardIds.includes(c.id)) updated[nid] = { ...c, priceNetto };
            }
            return updated;
        });
        // Zapis priceNetto w material-requirements (źródło prawdy materiałów)
        await Promise.all(cardIds.map(id => fetch(`${API_URL}/material-requirements/${id}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ priceNetto }),
        })));
        // Propagacja w drugą stronę: priceNetto → WbsNode.unitCost (budżet WBS)
        for (const nid of wbsNodeIds) {
            await onWbsNodeUnitCostChange?.(nid, priceNetto);
        }
        await refreshCards();
    }, [cards, externalWbsNodes, internalWbsNodes, refreshCards, onWbsNodeUnitCostChange]);

    // ─ Column resize ─────────────────────────────────────────────────────────

    const startResize = useCallback((colKey, e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = colWidths[colKey] || 100;
        resizeDrag.current = { colKey, startX, startW };

        const onMove = (ev) => {
            if (!resizeDrag.current) return;
            const dx = ev.clientX - resizeDrag.current.startX;
            const newW = Math.max(60, resizeDrag.current.startW + dx);
            setColWidths(prev => ({ ...prev, [resizeDrag.current.colKey]: newW }));
        };
        const onUp = () => {
            resizeDrag.current = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [colWidths]);

    // ─ Export ────────────────────────────────────────────────────────────────

    const exportToExcel = useCallback(async () => {
        const TYPE_LABELS_XLS = { material: 'Materiał', equipment: 'Sprzęt', work: 'Praca', service: 'Usługa', lodging: 'Nocleg', fuel: 'Paliwo' };

        // technicalSpec jest wpisywany jedna linia = jedno wymaganie; w Excelu
        // zlewały się bez separatora, więc łączymy je średnikiem.
        const joinTechLines = (tech) => (tech || '').split('\n').map(s => s.trim()).filter(Boolean).join('; ');

        // depth-0 (gałąź WBS) jest w UI uppercase'owane przez CSS (text-transform);
        // ujednolicamy w eksporcie — pierwszy segment ścieżki idzie wielkimi literami.
        const upperFirstSegment = (path) => {
            if (!path) return '';
            const idx = path.indexOf(' › ');
            if (idx < 0) return path.toUpperCase();
            return path.slice(0, idx).toUpperCase() + path.slice(idx);
        };

        const workbook = new ExcelJS.Workbook();
        const detailsSheet = workbook.addWorksheet('Materiały');
        const aggregateSheet = workbook.addWorksheet('Zamówienie (agregacja)');

        // ── Sheet 1: pełna lista (jak wcześniej) ─────────────────────────────
        detailsSheet.columns = [
            { header: 'Typ', key: 'type', width: 12 },
            { header: 'Przedmiot projektu', key: 'parent', width: 24 },
            { header: 'Pełna ścieżka WBS', key: 'path', width: 40 },
            { header: 'Pozycja przedmiotu', key: 'name', width: 28 },
            { header: 'Ilość', key: 'qty', width: 8 },
            { header: 'Jednostka', key: 'unit', width: 10 },
            { header: 'Wymagania techniczne', key: 'tech', width: 40 },
            { header: 'Producent', key: 'manufacturer', width: 18 },
            { header: 'Model', key: 'model', width: 18 },
            { header: 'Nazwa handlowa', key: 'productName', width: 22 },
            { header: 'Koszt jednostkowy', key: 'price', width: 12 },
            // @anchor materials-export-realization — kolumny realizacji: ilość i wartość
            // z wpisów, Δ jako żywe formuły (arkusz ma zostać policzalny po ręcznej korekcie)
            { header: 'Zakup / wykonanie', key: 'realized', width: 15 },
            { header: 'Koszt jedn. zakupu', key: 'realizedUnit', width: 15 },
            { header: 'Wartość realizacji', key: 'realizedValue', width: 16 },
            { header: 'Δ ilość', key: 'deltaQty', width: 10 },
            { header: 'Δ wartość', key: 'deltaValue', width: 14 },
            { header: 'Rozliczone', key: 'closed', width: 11 },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Dostępność', key: 'availability', width: 14 },
            { header: 'Prop. producent', key: 'pManufacturer', width: 18 },
            { header: 'Prop. model', key: 'pModel', width: 18 },
            { header: 'Prop. nazwa handlowa', key: 'pProductName', width: 22 },
            { header: 'Prop. cena', key: 'pPrice', width: 12 },
            { header: 'Prop. wybrana', key: 'pSelected', width: 12 },
        ];
        const detHeader = detailsSheet.getRow(1);
        detHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        detHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

        // Litery kolumn do formuł Δ — po `columns` są już znane, a nazwy trzymają się
        // kluczy, więc dołożenie kolumny nie rozjeżdża odwołań.
        const colL = (key) => detailsSheet.getColumn(key).letter;

        const detailsNodes = [...matNodes].sort((a, b) => (a.path || '').localeCompare(b.path || '', 'pl', { numeric: true, sensitivity: 'base' }));
        for (const node of detailsNodes) {
            const card = cards[node.id] || null;
            const parent = getParentPath(node.path);
            const selectedProposal = (card?.proposals || []).find(p => p.isSelected);
            const allProposals = card?.proposals || [];
            const real = realizationOf(node, entriesOf(node));
            const planUnit = card?.priceNetto ?? node.unitCost ?? null;
            const rowNo = detailsSheet.rowCount + 1;

            detailsSheet.addRow({
                realized: real.entries.length ? real.qty : null,
                realizedUnit: real.avg,
                realizedValue: real.entries.length
                    ? { formula: `${colL('realized')}${rowNo}*${colL('realizedUnit')}${rowNo}`, result: real.value }
                    : null,
                deltaQty: real.entries.length || node.realizationClosed
                    ? { formula: `${colL('realized')}${rowNo}-${colL('qty')}${rowNo}`, result: Math.round((real.qty - real.plan) * 1000) / 1000 }
                    : null,
                deltaValue: (real.entries.length || node.realizationClosed) && planUnit != null
                    ? {
                        formula: `${colL('realizedValue')}${rowNo}-${colL('qty')}${rowNo}*${colL('price')}${rowNo}`,
                        result: Math.round((real.value - planUnit * (Number(node.quantity) || 0)) * 100) / 100,
                    }
                    : null,
                closed: node.realizationClosed ? 'TAK' : '',
                type: TYPE_LABELS_XLS[node.type] || node.type,
                parent,
                path: upperFirstSegment(node.path || ''),
                name: node.name || '',
                qty: Number(node.quantity ?? 1),
                unit: node.unit || 'szt',
                manufacturer: card?.manufacturer || '',
                model: card?.model || '',
                productName: card?.productName || '',
                // Praca i usługi nie mają karty — koszt planu bierzemy wtedy z liścia,
                // inaczej formuła Δ wartość odejmowałaby pustą komórkę.
                price: card?.priceNetto != null ? Number(card.priceNetto) : (node.unitCost != null ? Number(node.unitCost) : null),
                status: rowStatusLabel(node, card),
                tech: joinTechLines(card?.technicalSpec),
                availability: card?.availability || '',
                pManufacturer: selectedProposal?.manufacturer || '',
                pModel: selectedProposal?.model || '',
                pProductName: selectedProposal?.productName || '',
                pPrice: selectedProposal?.priceNetto != null ? Number(selectedProposal.priceNetto) : null,
                pSelected: selectedProposal ? 'TAK' : '',
            });

            for (const p of allProposals.filter(pp => !pp.isSelected)) {
                detailsSheet.addRow({
                    pManufacturer: p.manufacturer || '',
                    pModel: p.model || '',
                    pProductName: p.productName || '',
                    pPrice: p.priceNetto != null ? Number(p.priceNetto) : null,
                    pSelected: 'NIE',
                });
            }
        }
        detailsSheet.getColumn('price').numFmt = '#,##0.00';
        detailsSheet.getColumn('pPrice').numFmt = '#,##0.00';
        detailsSheet.views = [{ state: 'frozen', ySplit: 1 }];
        detailsSheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: detailsSheet.rowCount, column: detailsSheet.columnCount },
        };

        // ── Sheet 2: agregacja po nazwie + wymaganiach (dla logistyka) ───────
        const agg = new Map();
        for (const node of matNodes) {
            const card = cards[node.id] || null;
            const name = (node.name || '').trim();
            const tech = (card?.technicalSpec || '').trim();
            const unit = (node.unit || 'szt').trim();
            const type = TYPE_LABELS_XLS[node.type] || node.type || '';
            if (!name && !tech) continue;
            const key = `${type}||${name.toLowerCase()}||${tech.toLowerCase()}||${unit.toLowerCase()}`;
            const qty = Number(node.quantity) || 0;
            const status = rowStatusLabel(node, card);
            const selectedProposal = (card?.proposals || []).find(p => p.isSelected);
            const chosen = selectedProposal || card || null;
            const product = [chosen?.manufacturer, chosen?.model].filter(Boolean).join(' / ');
            const price = chosen?.priceNetto != null ? Number(chosen.priceNetto) : null;

            if (!agg.has(key)) {
                agg.set(key, {
                    type,
                    name,
                    tech,
                    unit,
                    qty: 0,
                    positions: 0,
                    paths: [],
                    statuses: new Set(),
                    products: new Set(),
                    priceSum: 0,
                    priceCount: 0,
                });
            }
            const row = agg.get(key);
            row.qty += qty;
            row.positions += 1;
            if (node.path) row.paths.push(upperFirstSegment(node.path));
            if (status) row.statuses.add(status);
            if (product) row.products.add(product);
            if (price != null && Number.isFinite(price)) {
                row.priceSum += price * qty;
                row.priceCount += qty;
            }
        }

        aggregateSheet.columns = [
            { header: 'Lp.', key: 'idx', width: 5 },
            { header: 'Gdzie wykorzystywany', key: 'paths', width: 60 },
            { header: 'Nazwa', key: 'name', width: 32 },
            { header: 'Łączna ilość', key: 'qty', width: 14 },
            { header: 'Jednostka', key: 'unit', width: 10 },
            { header: 'Wymagania techniczne', key: 'tech', width: 48 },
            { header: 'Liczba pozycji WBS', key: 'positions', width: 14 },
            { header: 'Proponowany produkt', key: 'product', width: 28 },
            { header: 'Średni koszt jednostkowy', key: 'price', width: 16 },
            { header: 'Szac. wartość netto', key: 'value', width: 16 },
            { header: 'Statusy', key: 'statuses', width: 28 },
        ];
        const aggHeader = aggregateSheet.getRow(1);
        aggHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        aggHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

        const aggRows = [...agg.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl', { numeric: true, sensitivity: 'base' }));

        aggRows.forEach((row, i) => {
            const avgPrice = row.priceCount > 0 ? row.priceSum / row.priceCount : null;
            const value = avgPrice != null ? avgPrice * row.qty : null;
            const added = aggregateSheet.addRow({
                idx: i + 1,
                paths: row.paths.join('\n'),
                name: row.name,
                tech: joinTechLines(row.tech),
                qty: row.qty,
                unit: row.unit,
                positions: row.positions,
                product: [...row.products].join('; '),
                price: avgPrice,
                value,
                statuses: [...row.statuses].join(', '),
            });
            added.alignment = { vertical: 'top', wrapText: true };
        });

        if (aggRows.length > 0) {
            const totalRowNum = aggRows.length + 2;
            const totalsRow = aggregateSheet.addRow({
                name: 'Razem',
                qty: { formula: `=SUM(D2:D${totalRowNum - 1})`, result: aggRows.reduce((s, r) => s + r.qty, 0) },
                positions: { formula: `=SUM(G2:G${totalRowNum - 1})`, result: aggRows.reduce((s, r) => s + r.positions, 0) },
                value: { formula: `=SUM(J2:J${totalRowNum - 1})`, result: aggRows.reduce((s, r) => s + (r.priceCount > 0 ? (r.priceSum / r.priceCount) * r.qty : 0), 0) },
            });
            totalsRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        }

        aggregateSheet.getColumn('qty').numFmt = '#,##0.##';
        aggregateSheet.getColumn('price').numFmt = '#,##0.00';
        aggregateSheet.getColumn('value').numFmt = '#,##0.00';
        aggregateSheet.views = [{ state: 'frozen', ySplit: 1 }];
        if (aggRows.length > 0) {
            aggregateSheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: aggRows.length + 1, column: aggregateSheet.columnCount },
            };
        }

        // ── Sheet 3: wpisy realizacji (rozliczenie zakupów i wykonania) ──────
        // Osobny arkusz, bo tu jest wiele wierszy na jedną pozycję — arkusz „Materiały"
        // ma zostać listą pozycji, a nie dziennikiem dostaw.
        if (actuals.length > 0) {
            const nodeByRoot = new Map(matNodes.map(n => [wbsRootOf(n), n]));
            const realSheet = workbook.addWorksheet('Realizacja (wpisy)');
            realSheet.columns = [
                { header: 'Przedmiot projektu', key: 'parent', width: 24 },
                { header: 'Pozycja', key: 'name', width: 30 },
                { header: 'Typ', key: 'type', width: 12 },
                { header: 'Data', key: 'date', width: 12 },
                { header: 'Ilość', key: 'qty', width: 10 },
                { header: 'Jednostka', key: 'unit', width: 10 },
                { header: 'Producent', key: 'manufacturer', width: 18 },
                { header: 'Model', key: 'model', width: 18 },
                { header: 'Koszt jedn.', key: 'unitCost', width: 13 },
                { header: 'Wartość', key: 'value', width: 14 },
                { header: 'Dokument', key: 'doc', width: 18 },
                { header: 'Dostawca', key: 'supplier', width: 20 },
                { header: 'Komentarz', key: 'comment', width: 42 },
                { header: 'Autor', key: 'author', width: 20 },
            ];
            const realHeader = realSheet.getRow(1);
            realHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            realHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

            const qtyL = realSheet.getColumn('qty').letter;
            const costL = realSheet.getColumn('unitCost').letter;
            for (const e of actuals) {
                const node = nodeByRoot.get(e.wbsRootId) || null;
                const rowNo = realSheet.rowCount + 1;
                realSheet.addRow({
                    parent: node ? getParentPath(node.path) : '',
                    name: node?.name || '—',
                    type: TYPE_LABELS_XLS[node?.type] || node?.type || '',
                    date: fmtDate(e.entryDate),
                    qty: Number(e.qty),
                    unit: node?.unit || 'szt',
                    manufacturer: e.manufacturer || '',
                    model: e.model || '',
                    unitCost: Number(e.unitCost),
                    value: { formula: `${qtyL}${rowNo}*${costL}${rowNo}`, result: Math.round(e.qty * e.unitCost * 100) / 100 },
                    doc: e.docNumber || '',
                    supplier: e.supplier?.name || '',
                    comment: e.comment || '',
                    author: [e.author?.firstName, e.author?.lastName].filter(Boolean).join(' ') || e.author?.email || '',
                });
            }
            const sumRow = realSheet.addRow({ comment: 'RAZEM', value: { formula: `SUM(${realSheet.getColumn('value').letter}2:${realSheet.getColumn('value').letter}${realSheet.rowCount})`, result: null } });
            sumRow.font = { bold: true };
            realSheet.getColumn('unitCost').numFmt = '#,##0.00';
            realSheet.getColumn('value').numFmt = '#,##0.00';
            realSheet.views = [{ state: 'frozen', ySplit: 1 }];
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const safeOrder = String(orderName || projectName || 'zamowienie').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'zamowienie';
        // Zwraca artefakt (zamiast pobierać) — wybór pobierz/wyślij robi ExportChoiceModal w rodzicu.
        return { blob, filename: `${safeOrder}_materialy.xlsx` };
    }, [matNodes, cards, orderName, projectName, actuals, entriesOf]);

    // Notify parent when export function updates
    useEffect(() => { onExportReady?.(exportToExcel); }, [exportToExcel]);

    // ─ Render guards ─────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (matNodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                <AlertCircle size={28} className="text-gray-600" />
                <p className="text-sm">Brak węzłów WBS typu materiał lub sprzęt.</p>
                <p className="text-xs text-gray-600">Ustaw typ wiersza na "materiał" lub "sprzęt" w Strukturze projektu.</p>
            </div>
        );
    }

    const toggleSort = (key) => setSortConfig(s =>
        s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }
    );

    return (
        <div className="flex flex-col h-full bg-slate-800/30">
            {/* Tabela */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="table-fixed w-full">
                    <colgroup>
                        {/* Kolumna rozwijania — na dotyku szersza, bo mieści pełny przycisk */}
                        <col style={{ width: isTouch ? 52 : 36 }} />
                        {visibleCols.map(c => (
                            <col key={c.key} style={{ width: colWidths[c.key] }} />
                        ))}
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                        {/* Sort row */}
                        <tr className="border-b border-white/10 bg-gray-950">
                            <th className="w-9 bg-gray-950" />
                            {visibleCols.map(c => (
                                <th key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'} bg-gray-950 select-none relative`}>
                                    <button
                                        onClick={() => toggleSort(c.key)}
                                        className={`inline-flex items-center gap-1 text-base font-bold uppercase tracking-widest text-white hover:text-gray-200 transition-colors w-full ${c.align === 'right' ? 'justify-end' : ''}`}
                                    >
                                        <span className="truncate">{c.label}</span>
                                        <span className={sortConfig.key === c.key ? 'text-blue-400 flex-shrink-0' : 'text-gray-600 flex-shrink-0'}>
                                            {sortConfig.key === c.key ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⬍'}
                                        </span>
                                    </button>
                                    {/* Resize handle */}
                                    <div
                                        onMouseDown={e => startResize(c.key, e)}
                                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10"
                                    />
                                </th>
                            ))}
                        </tr>
                        {/* Filter row */}
                        <tr className="border-b border-white/5 bg-gray-950">
                            <th className="bg-gray-950" />
                            {visibleCols.map(c => (
                                <th key={c.key} className="px-2 py-1 bg-gray-950">
                                    <input
                                        value={colFilters[c.key] || ''}
                                        onChange={e => setColFilters(p => ({ ...p, [c.key]: e.target.value }))}
                                        placeholder="filtruj..."
                                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white placeholder-gray-700 outline-none focus:border-blue-500/40"
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedFilteredNodes.map(node => {
                            const card = cards[node.id] || null;
                            const isExpanded = expandedId === node.id;
                            const realization = realizationOf(node, entriesOf(node));
                            const hasCard = TYPE_META[node.type]?.hasCard !== false;
                            const purchasesShown = purchasesOpen;
                            return (
                                <React.Fragment key={node.id}>
                                    <WbsMaterialRow
                                        node={node}
                                        card={card}
                                        accepted={accepted}
                                        offerLocked={offerLocked}
                                        isExpanded={isExpanded}
                                        isTouch={isTouch}
                                        realization={realization}
                                        onPropagatePrice={propagatePriceNetto}
                                        onToggle={async () => {
                                            if (isExpanded) {
                                                setExpandedId(null);
                                            } else if (!card && hasCard) {
                                                // Materiał/sprzęt bez karty: rozwinięcie ją zakłada — praca
                                                // i usługa karty nie mają, więc idą prosto do wpisów.
                                                await createCard(node);
                                            } else {
                                                setExpandedId(node.id);
                                            }
                                        }}
                                        onOpenPurchases={async () => {
                                            // Klik w licznik „Zakup / wykonanie": rozwiń wiersz i OD RAZU
                                            // sekcję wpisów — po to się w ten licznik klika. Gdy wiersz
                                            // jest już otwarty, kolejny klik działa jak przełącznik.
                                            if (!isExpanded) {
                                                if (!card && hasCard) await createCard(node);
                                                else setExpandedId(node.id);
                                                togglePurchases(true);
                                            } else {
                                                togglePurchases();
                                            }
                                        }}
                                        onPatchNode={patchWbsNode}
                                        onCreateCard={createCard}
                                        materialDb={materialDb}
                                        offers={offers}
                                        token={token}
                                        readOnly={readOnly}
                                        onRefresh={refreshCards}
                                        onPatchCard={patchCard}
                                    />
                                    {/* @anchor wbs-materials-product-card — rozwinięcie liścia zaczyna
                                        się od karty produktu WYCENY (propozycje AI, wymagania techniczne,
                                        zdjęcie). Zakup nie ma tu własnej strony — konkretne kupione
                                        materiały wpisuje się w sekcji wpisów PONIŻEJ karty. */}
                                    {isExpanded && card && (
                                        <tr>
                                            <td colSpan={visibleCols.length + 1} className={`p-0 ${CARD_SURFACE} ${GROUP_SPINE}`}>
                                                <div className={DRAWER.head}>
                                                    <span className={`${DRAWER.label} ${DRAWER.accent.offer.label}`}>karta produktu</span>
                                                    <span className={DRAWER.name}>{node.name}</span>
                                                </div>
                                                <ProductCard
                                                    card={card}
                                                    wbsNode={node}
                                                    token={token}
                                                    materialDb={materialDb}
                                                    offers={offers}
                                                    onRefresh={refreshCards}
                                                    onRefreshOffers={fetchOffers}
                                                    onPropagatePrice={propagatePriceNetto}
                                                    readOnly={readOnly}
                                                    offerLocked={offerLocked}
                                                    onPatch={(cardId, data) => setCards(prev => {
                                                        const entry = Object.entries(prev).find(([, c]) => c.id === cardId);
                                                        if (!entry) return prev;
                                                        const [nid, c] = entry;
                                                        return { ...prev, [nid]: { ...c, ...data } };
                                                    })}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                    {isExpanded && accepted && (
                                        <PurchasesBar
                                            node={node}
                                            realization={realization}
                                            colSpan={visibleCols.length + 1}
                                            open={purchasesOpen}
                                            onToggle={() => togglePurchases()}
                                            readOnly={readOnly}
                                            onToggleClosed={() => toggleRealizationClosed(node)}
                                        />
                                    )}
                                    {/* @anchor realization-entry-rows — wpisy realizacji jako wiersze
                                        potomne liścia: historia rośnie w dół, w tym samym miejscu,
                                        w którym patrzy się na Δ. Widoczne po akceptacji baseline, bo
                                        dopiero wtedy jest plan, z którym się porównujemy. Wyłącznie
                                        ZAPISANE wpisy — Materiały pokazują to, co faktycznie kupiono;
                                        nowe zdarzenia dopisuje się w zakładce Realizacja. */}
                                    {isExpanded && accepted && purchasesShown && realization.entries.map(e => (
                                        <RealizationEntryRow
                                            key={e.id}
                                            entry={e}
                                            node={node}
                                            cols={visibleCols}
                                            readOnly={readOnly}
                                            onSave={updateActual}
                                            onDelete={deleteActual}
                                        />
                                    ))}
                                    {/* @anchor materials-group-cap — domknięcie grupy rozwiniętej pozycji:
                                        pełna listwa w kolorze kręgosłupa, zawsze ostatnia w fragmencie,
                                        więc nie zależy od tego, które sekcje (karta, zakupy, wpisy) się pokazały. */}
                                    {isExpanded && (
                                        <tr aria-hidden="true">
                                            <td colSpan={visibleCols.length + 1} className={`${DRAWER.cap} ${DRAWER.accent.offer.cap}`} />
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
