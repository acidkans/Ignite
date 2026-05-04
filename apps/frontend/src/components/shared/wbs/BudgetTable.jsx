import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { fmtPLN, fmtPLNFull, fmtQty, fmtPct, fmtPctFull, TYPE_OPTIONS, TYPE_LABELS, UNIT_OPTIONS, parseLocaleNumber } from './wbsConstants';

const TH_BASE = 'text-left px-3 py-2.5 text-[17px] font-bold uppercase tracking-widest text-white whitespace-normal break-words select-none relative align-bottom';
const TD = 'px-2 py-1.5 align-top break-words';
const INPUT = 'bg-transparent text-white text-sm w-full outline-none focus:bg-white/5 rounded px-1 py-0.5 min-w-0';
const TEXTAREA = 'bg-transparent text-white text-sm w-full outline-none focus:bg-white/5 rounded px-1 py-0.5 min-w-0 resize-none leading-snug whitespace-pre-wrap break-all';
const SELECT = 'bg-[#0b0f17] text-white text-sm w-full outline-none rounded px-1 py-0.5 cursor-pointer border border-white/5 hover:border-white/10 focus:border-blue-500/40 transition-colors';
const FILTER = 'w-full bg-black/30 border border-white/10 rounded px-2 py-0.5 text-xs text-white placeholder-gray-700 outline-none focus:border-blue-500/40';

const NUMERIC_COLS = new Set(['unitCost', 'quantity', 'totalCost', 'margin', 'discount', 'offerPrice']);
const EDITABLE_COLS = ['name', 'type', 'unitCost', 'quantity', 'unit', 'margin', 'discount', 'comment'];

function calcDerived(r) {
    const q = Math.max(0, parseLocaleNumber(String(r.quantity ?? '')) ?? 1);
    const uc = Math.max(0, parseLocaleNumber(String(r.unitCost ?? '')) ?? 0);
    const marginRaw = r.margin != null && r.margin !== '' ? parseLocaleNumber(String(r.margin)) : null;
    const d = Math.max(0, parseLocaleNumber(String(r.discount ?? '')) ?? 0);
    const totalCost = uc * q;
    let offerPrice = (marginRaw !== null && marginRaw !== 0) ? totalCost * (1 + marginRaw / 100) : 0;
    if (offerPrice > 0 && d > 0) offerPrice = Math.max(0, offerPrice * (1 - d / 100));
    return { ...r, totalCost, offerPrice };
}

function AutoTextarea({ defaultValue, onBlur, onFocus, onKeyDown, className, dataRowId, dataCol }) {
    const ref = useRef(null);
    const resize = () => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };
    useLayoutEffect(() => { resize(); }, [defaultValue]);
    return (
        <textarea
            ref={ref}
            rows={1}
            defaultValue={defaultValue}
            onInput={resize}
            onBlur={onBlur}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            data-row-id={dataRowId}
            data-col={dataCol}
            className={className}
            style={{ overflow: 'hidden', minHeight: '1.4em' }}
        />
    );
}

const COLS = [
    { key: 'subjectName', label: 'Przedmiot', defW: 140, sortable: true },
    { key: 'name',        label: 'Nazwa',     defW: 220, sortable: true },
    { key: 'type',        label: 'Typ',       defW: 110, sortable: true, align: 'left' },
    { key: 'unitCost',    label: 'Koszt jedn.', defW: 110, sortable: true, align: 'center' },
    { key: 'quantity',    label: 'Ilość',     defW: 80,  sortable: true, align: 'center' },
    { key: 'unit',        label: 'Jednostki', defW: 100, sortable: true, align: 'center' },
    { key: 'totalCost',   label: 'Koszt całk.', defW: 110, sortable: true, align: 'center' },
    { key: 'margin',      label: 'Narzut %',  defW: 80,  sortable: true, align: 'center' },
    { key: 'discount',    label: 'Rabat %',   defW: 80,  sortable: true, align: 'center' },
    { key: 'offerPrice',  label: 'Cena ofert.', defW: 110, sortable: true, align: 'center' },
    { key: 'comment',     label: 'Komentarz', defW: 220, sortable: true },
];

export default function BudgetTable({
    rows,
    onFieldChange,
    onDeleteRow,
    discountPercent,
    discountAmount,
    onDiscountPercentChange,
    onDiscountAmountChange,
}) {
    const [localRows, setLocalRows] = useState(() => rows.map(calcDerived));
    const [syncVersion, setSyncVersion] = useState(0);
    const [colFilters, setColFilters] = useState({});
    const [sort, setSort] = useState({ key: null, dir: null });
    const [focusedRowId, setFocusedRowId] = useState(null);

    const [colWidths, setColWidths] = useState(
        () => Object.fromEntries(COLS.map(c => [c.key, c.defW]))
    );
    const resizeDrag = useRef(null);
    const blurTimer = useRef(null);
    const tableRef = useRef(null);
    const displayedRowsRef = useRef([]);

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

    useEffect(() => {
        const newRows = rows.map(calcDerived);
        const editableFields = ['name', 'unitCost', 'quantity', 'margin', 'discount', 'comment', 'unit', 'type'];
        let externalChange = newRows.length !== localRows.length;
        if (!externalChange) {
            outer: for (let i = 0; i < newRows.length; i++) {
                const a = localRows[i], b = newRows[i];
                if (!a || a.id !== b.id) { externalChange = true; break; }
                for (const f of editableFields) {
                    if (String(a[f] ?? '') !== String(b[f] ?? '')) { externalChange = true; break outer; }
                }
            }
        }
        setLocalRows(newRows);
        if (externalChange) setSyncVersion(v => v + 1);
    }, [rows]);

    const handleChange = (rowId, field, rawValue) => {
        setLocalRows(prev => prev.map(r => {
            if (r.id !== rowId) return r;
            return calcDerived({ ...r, [field]: rawValue });
        }));
    };

    const toggleSort = (key) => {
        setSort(prev => {
            if (prev.key !== key) return { key, dir: 'asc' };
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return { key: null, dir: null };
        });
    };

    const filteredRows = useMemo(() => {
        const keys = Object.keys(colFilters).filter(k => String(colFilters[k] ?? '').trim() !== '');
        if (keys.length === 0) return localRows;
        const match = (val, q) => String(val ?? '').toLowerCase().includes(q);
        const matchTokens = (val, q) => {
            const text = String(val ?? '').toLowerCase();
            return q.split(/[\s/]+/).filter(Boolean).every(t => text.includes(t));
        };
        return localRows.filter(r => {
            if (r.id === focusedRowId) return true;
            return keys.every(k => {
                const q = String(colFilters[k]).toLowerCase().trim();
                if (k === 'subjectName') return matchTokens(r.subjectPath || r.subjectName, q);
                const val = k === 'type' ? (TYPE_LABELS[r.type] || r.type) : r[k];
                return match(val, q);
            });
        });
    }, [localRows, colFilters, focusedRowId]);

    const displayedRows = useMemo(() => {
        if (!sort.key || !sort.dir) return filteredRows;
        const dir = sort.dir === 'asc' ? 1 : -1;
        const isNum = NUMERIC_COLS.has(sort.key);
        const get = (r) => sort.key === 'type' ? (TYPE_LABELS[r.type] || r.type || '') : r[sort.key];
        return [...filteredRows].sort((a, b) => {
            const av = get(a), bv = get(b);
            if (isNum) {
                const an = parseLocaleNumber(String(av ?? '')) ?? 0;
                const bn = parseLocaleNumber(String(bv ?? '')) ?? 0;
                return (an - bn) * dir;
            }
            return String(av ?? '').localeCompare(String(bv ?? ''), 'pl') * dir;
        });
    }, [filteredRows, sort]);

    useEffect(() => { displayedRowsRef.current = displayedRows; }, [displayedRows]);

    const calcSummary = useCallback((rows) => {
        let totalCost = 0, rawRevenue = 0;
        for (const r of rows) {
            totalCost += parseFloat(r.totalCost) || 0;
            rawRevenue += parseFloat(r.offerPrice) || 0;
        }
        const parsedPct = Number(String(discountPercent ?? '').replace(',', '.'));
        const parsedAmt = Number(String(discountAmount ?? '').replace(',', '.'));
        const discFromPct = Number.isFinite(parsedPct) ? Math.max(0, parsedPct) / 100 * rawRevenue : 0;
        const discFromAmt = Number.isFinite(parsedAmt) ? Math.max(0, parsedAmt) : 0;
        const totalRevenue = Math.max(0, rawRevenue - discFromPct - discFromAmt);
        const profit = totalRevenue - totalCost;
        const marginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
        return { totalCost, totalRevenue, rawRevenue, profit, marginPct, rows: rows.length };
    }, [discountPercent, discountAmount]);

    const summary = useMemo(() => calcSummary(localRows), [localRows, calcSummary]);
    const filteredSummary = useMemo(() => calcSummary(filteredRows), [filteredRows, calcSummary]);
    const isFiltered = filteredRows.length !== localRows.length;

    const handleCellFocus = useCallback((rowId) => {
        clearTimeout(blurTimer.current);
        setFocusedRowId(rowId);
    }, []);

    const handleCellBlur = useCallback(() => {
        blurTimer.current = setTimeout(() => setFocusedRowId(null), 200);
    }, []);

    const navigateCell = useCallback((rowId, colKey, direction) => {
        const rows = displayedRowsRef.current;
        const rowIdx = rows.findIndex(r => r.id === rowId);
        const colIdx = EDITABLE_COLS.indexOf(colKey);
        let targetRowId = rowId;
        let targetColKey = colKey;

        if (direction === 'up') {
            if (rowIdx <= 0) return;
            targetRowId = rows[rowIdx - 1].id;
        } else if (direction === 'down') {
            if (rowIdx >= rows.length - 1) return;
            targetRowId = rows[rowIdx + 1].id;
        } else if (direction === 'left') {
            if (colIdx <= 0) return;
            targetColKey = EDITABLE_COLS[colIdx - 1];
        } else if (direction === 'right') {
            if (colIdx >= EDITABLE_COLS.length - 1) return;
            targetColKey = EDITABLE_COLS[colIdx + 1];
        } else if (direction === 'home') {
            targetColKey = EDITABLE_COLS[0];
        } else return;

        const el = tableRef.current?.querySelector(`[data-row-id="${targetRowId}"][data-col="${targetColKey}"]`);
        if (el) {
            el.focus();
            if (typeof el.select === 'function' && el.tagName !== 'SELECT') el.select();
        }
    }, []);

    const handleKeyDown = useCallback((e, rowId, colKey) => {
        const tag = e.target.tagName;
        const isSelect = tag === 'SELECT';
        const isText = tag === 'INPUT' || tag === 'TEXTAREA';

        switch (e.key) {
            case 'Enter':
                if (tag === 'TEXTAREA' && e.shiftKey) return; // Shift+Enter = newline in textarea
                e.preventDefault();
                navigateCell(rowId, colKey, 'home');
                break;
            case 'ArrowUp':
                if (isSelect) return;
                e.preventDefault();
                navigateCell(rowId, colKey, 'up');
                break;
            case 'ArrowDown':
                if (isSelect) return;
                e.preventDefault();
                navigateCell(rowId, colKey, 'down');
                break;
            case 'ArrowLeft':
                if (isSelect) return;
                if (isText && e.target.selectionStart !== 0) return;
                e.preventDefault();
                navigateCell(rowId, colKey, 'left');
                break;
            case 'ArrowRight':
                if (isSelect) return;
                if (isText && e.target.selectionStart !== e.target.value.length) return;
                e.preventDefault();
                navigateCell(rowId, colKey, 'right');
                break;
        }
    }, [navigateCell]);

    const SortIcon = ({ k }) => {
        if (sort.key !== k) return null;
        return sort.dir === 'asc'
            ? <ArrowUp size={11} className="flex-shrink-0 mt-0.5" />
            : <ArrowDown size={11} className="flex-shrink-0 mt-0.5" />;
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            {/* Karty summary */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-2.5">
                <div className="grid grid-cols-2 xl:grid-cols-6 gap-2">
                    <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 flex justify-between items-start gap-2">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-red-300/90 font-bold">Koszt</div>
                            <div className="text-sm font-black text-red-200">{fmtPLNFull(summary.totalCost)} PLN</div>
                        </div>
                        {isFiltered && (
                            <div className="text-right shrink-0">
                                <div className="text-[10px] uppercase tracking-widest text-red-300/60">Koszt częściowy</div>
                                <div className="text-sm text-red-200/70">{fmtPLNFull(filteredSummary.totalCost)} PLN</div>
                                <div className="text-[10px] text-red-300/50">{filteredSummary.rows} wierszy</div>
                            </div>
                        )}
                    </div>
                    <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2 flex justify-between items-start gap-2">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-green-300/90 font-bold">Przychód</div>
                            <div className="text-sm font-black text-green-200">{fmtPLNFull(summary.totalRevenue)} PLN</div>
                        </div>
                        {isFiltered && (
                            <div className="text-right shrink-0">
                                <div className="text-[10px] uppercase tracking-widest text-green-300/60">Przychód częściowy</div>
                                <div className="text-sm text-green-200/70">{fmtPLNFull(filteredSummary.totalRevenue)} PLN</div>
                            </div>
                        )}
                    </div>
                    <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2 flex justify-between items-start gap-2">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-green-300/90 font-bold">Zysk</div>
                            <div className="text-sm font-black text-green-200">{fmtPLNFull(summary.profit)} PLN</div>
                        </div>
                        {isFiltered && (
                            <div className="text-right shrink-0">
                                <div className="text-[10px] uppercase tracking-widest text-green-300/60">Zysk częściowy</div>
                                <div className="text-sm text-green-200/70">{fmtPLNFull(filteredSummary.profit)} PLN</div>
                            </div>
                        )}
                    </div>
                    <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2 flex justify-between items-start gap-2">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-green-300/90 font-bold">Marża</div>
                            <div className="text-sm font-black text-green-200">{fmtPctFull(summary.marginPct)}</div>
                            <div className="text-[10px] text-green-200/70 mt-0.5">{isFiltered ? `${filteredSummary.rows} / ${summary.rows} wierszy` : `${summary.rows} wierszy`}</div>
                        </div>
                        {isFiltered && (
                            <div className="text-right shrink-0">
                                <div className="text-[10px] uppercase tracking-widest text-green-300/60">Marża częściowa</div>
                                <div className="text-sm text-green-200/70">{fmtPctFull(filteredSummary.marginPct)}</div>
                            </div>
                        )}
                    </div>
                    <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-orange-300/90 font-bold">Rabat — %</div>
                        <div className="relative mt-1">
                            <input
                                type="number" min="0" max="100" step="0.01"
                                value={discountPercent ?? ''}
                                onChange={e => onDiscountPercentChange?.(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                className="w-full rounded-lg border border-orange-400/25 bg-black/30 px-2 py-1.5 pr-8 text-sm font-black text-orange-100 focus:outline-none focus:border-orange-400"
                                placeholder="0,00"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-black text-orange-200/80">%</span>
                        </div>
                        {discountPercent !== '' && discountPercent != null && (
                            <div className="text-[10px] text-orange-200/70 mt-0.5">
                                = {fmtPLNFull(Number.isFinite(Number(String(discountPercent).replace(',', '.'))) ? summary.rawRevenue * Math.max(0, Number(String(discountPercent).replace(',', '.'))) / 100 : 0)} PLN
                            </div>
                        )}
                    </div>
                    <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-orange-300/90 font-bold">Rabat — zł</div>
                        <input
                            type="number" min="0" step="0.01"
                            value={discountAmount ?? ''}
                            onChange={e => onDiscountAmountChange?.(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="mt-1 w-full rounded-lg border border-orange-400/25 bg-black/30 px-2 py-1.5 text-sm font-black text-orange-100 focus:outline-none focus:border-orange-400"
                            placeholder="0,00"
                        />
                        {discountAmount !== '' && discountAmount != null && (
                            <div className="text-[10px] text-orange-200/70 mt-0.5">
                                = {fmtPctFull(summary.rawRevenue > 0 ? Math.max(0, Number(String(discountAmount).replace(',', '.'))) / summary.rawRevenue * 100 : 0)}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabela */}
            <div className="flex-1 overflow-auto bg-slate-800/30">
                <table ref={tableRef} className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: 36 }} />
                        {COLS.map(c => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
                        <col style={{ width: 36 }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-[#0b0f17]">
                        <tr className="border-b border-white/15">
                            <th className={`${TH_BASE} text-center`}>#</th>
                            {COLS.map(c => (
                                <th
                                    key={c.key}
                                    className={`${TH_BASE} ${c.align === 'center' ? 'text-center' : 'text-left'}`}
                                >
                                    {c.sortable ? (
                                        <button
                                            type="button"
                                            onClick={() => toggleSort(c.key)}
                                            className="flex items-start gap-1 w-full text-inherit font-inherit uppercase tracking-widest hover:text-gray-200 transition-colors"
                                            title="Kliknij aby sortować"
                                        >
                                            <span className="min-w-0 flex-1 whitespace-normal break-words text-left">{c.label}</span>
                                            <SortIcon k={c.key} />
                                        </button>
                                    ) : (
                                        <span className="block whitespace-normal break-words">{c.label}</span>
                                    )}
                                    <div
                                        onMouseDown={e => startResize(c.key, e)}
                                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10"
                                    />
                                </th>
                            ))}
                            <th />
                        </tr>
                        <tr className="border-b border-white/10 bg-[#0b0f17]">
                            <th />
                            {COLS.map(c => (
                                <th key={c.key} className="px-2 py-1">
                                    <input
                                        value={colFilters[c.key] || ''}
                                        onChange={e => setColFilters(p => ({ ...p, [c.key]: e.target.value }))}
                                        placeholder="filtruj..."
                                        className={FILTER}
                                    />
                                </th>
                            ))}
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {displayedRows.map((row, idx) => (
                            <tr key={row.id} className="border-b border-white/10 group hover:bg-white/[0.03] transition-colors">
                                <td className={`${TD} text-center text-sm text-white tabular-nums`}>{idx + 1}</td>

                                <td className={TD}>
                                    <span className="text-sm text-white break-words whitespace-pre-wrap">{row.subjectPath || row.subjectName || '—'}</span>
                                </td>

                                <td className={TD}>
                                    <AutoTextarea
                                        key={`${row.id}-name-${syncVersion}`}
                                        defaultValue={row.name || ''}
                                        onBlur={e => { handleCellBlur(); if (e.target.value !== (row.name || '')) onFieldChange(row, 'name', e.target.value); }}
                                        onFocus={() => handleCellFocus(row.id)}
                                        onKeyDown={e => handleKeyDown(e, row.id, 'name')}
                                        dataRowId={row.id}
                                        dataCol="name"
                                        className={TEXTAREA}
                                    />
                                </td>

                                <td className={TD}>
                                    <select
                                        value={row.type || ''}
                                        onChange={e => { handleChange(row.id, 'type', e.target.value); onFieldChange(row, 'type', e.target.value); }}
                                        onFocus={() => handleCellFocus(row.id)}
                                        onBlur={handleCellBlur}
                                        onKeyDown={e => handleKeyDown(e, row.id, 'type')}
                                        data-row-id={row.id}
                                        data-col="type"
                                        className={SELECT}
                                    >
                                        <option value="">—</option>
                                        {TYPE_OPTIONS.map(o => <option key={o} value={o}>{TYPE_LABELS[o] || o}</option>)}
                                    </select>
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-unitCost-${syncVersion}`}
                                        defaultValue={row.unitCost != null && row.unitCost !== 0 ? Number(row.unitCost).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                                        onChange={e => handleChange(row.id, 'unitCost', e.target.value)}
                                        onBlur={e => {
                                            handleCellBlur();
                                            const n = parseLocaleNumber(e.target.value);
                                            if (n != null) e.target.value = n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                            onFieldChange(row, 'unitCost', e.target.value);
                                        }}
                                        onFocus={() => handleCellFocus(row.id)}
                                        onKeyDown={e => handleKeyDown(e, row.id, 'unitCost')}
                                        data-row-id={row.id}
                                        data-col="unitCost"
                                        className={`${INPUT} text-center tabular-nums font-mono ${row.inheritedFromMaterials ? 'text-amber-300' : 'text-red-400'}`}
                                    />
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-quantity-${syncVersion}`}
                                        defaultValue={row.quantity != null && row.quantity !== 0 ? Number(row.quantity).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                                        onChange={e => handleChange(row.id, 'quantity', e.target.value)}
                                        onBlur={e => {
                                            handleCellBlur();
                                            const n = parseLocaleNumber(e.target.value);
                                            if (n != null) e.target.value = n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                            onFieldChange(row, 'quantity', e.target.value);
                                        }}
                                        onFocus={() => handleCellFocus(row.id)}
                                        onKeyDown={e => handleKeyDown(e, row.id, 'quantity')}
                                        data-row-id={row.id}
                                        data-col="quantity"
                                        className={`${INPUT} text-center tabular-nums`}
                                    />
                                </td>

                                <td className={TD}>
                                    <select
                                        value={row.unit || ''}
                                        onChange={e => { handleChange(row.id, 'unit', e.target.value); onFieldChange(row, 'unit', e.target.value); }}
                                        onFocus={() => handleCellFocus(row.id)}
                                        onBlur={handleCellBlur}
                                        onKeyDown={e => handleKeyDown(e, row.id, 'unit')}
                                        data-row-id={row.id}
                                        data-col="unit"
                                        className={SELECT}
                                    >
                                        <option value="">—</option>
                                        {UNIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </td>

                                <td className={`${TD} text-center text-sm tabular-nums font-mono rounded bg-white/[0.03] ${row.totalCost > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                                    {row.totalCost > 0 ? `${fmtPLN(row.totalCost)} zł` : '—'}
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-margin-${syncVersion}`}
                                        defaultValue={row.margin != null && row.margin !== 0 ? String(row.margin).replace('.', ',') : ''}
                                        onChange={e => handleChange(row.id, 'margin', e.target.value)}
                                        onBlur={e => { handleCellBlur(); onFieldChange(row, 'margin', e.target.value); }}
                                        onFocus={() => handleCellFocus(row.id)}
                                        onKeyDown={e => handleKeyDown(e, row.id, 'margin')}
                                        data-row-id={row.id}
                                        data-col="margin"
                                        className={`${INPUT} text-center tabular-nums text-green-300`}
                                    />
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-discount-${syncVersion}`}
                                        defaultValue={row.discount != null && row.discount !== 0 ? String(row.discount).replace('.', ',') : ''}
                                        onChange={e => handleChange(row.id, 'discount', e.target.value)}
                                        onBlur={e => { handleCellBlur(); onFieldChange(row, 'discount', e.target.value); }}
                                        onFocus={() => handleCellFocus(row.id)}
                                        onKeyDown={e => handleKeyDown(e, row.id, 'discount')}
                                        data-row-id={row.id}
                                        data-col="discount"
                                        className={`${INPUT} text-center tabular-nums text-orange-300`}
                                    />
                                </td>

                                <td className={`${TD} text-center text-sm tabular-nums font-mono font-semibold rounded bg-white/[0.03] ${row.offerPrice > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                                    {row.offerPrice > 0 ? `${fmtPLN(row.offerPrice)} zł` : '—'}
                                </td>

                                <td className={TD}>
                                    <AutoTextarea
                                        key={`${row.id}-comment-${syncVersion}`}
                                        defaultValue={row.comment || ''}
                                        onBlur={e => { handleCellBlur(); if (e.target.value !== (row.comment || '')) onFieldChange(row, 'comment', e.target.value); }}
                                        onFocus={() => handleCellFocus(row.id)}
                                        onKeyDown={e => handleKeyDown(e, row.id, 'comment')}
                                        dataRowId={row.id}
                                        dataCol="comment"
                                        className={`${TEXTAREA} text-gray-400`}
                                    />
                                </td>

                                <td className={TD}>
                                    <button
                                        onClick={() => onDeleteRow(row.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-red-400/50 hover:text-red-400 transition-all"
                                        title="Usuń pozycję"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {displayedRows.length === 0 && (
                            <tr>
                                <td colSpan={13} className="text-center py-10 text-gray-600 text-sm">
                                    {localRows.length === 0 ? 'Brak pozycji budżetowych' : 'Brak pozycji dla filtrów'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
