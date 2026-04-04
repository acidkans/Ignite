import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import ExcelJS from 'exceljs';
import { useReactTable, getCoreRowModel, getExpandedRowModel, getSortedRowModel, getFilteredRowModel, flexRender } from '@tanstack/react-table';
import {
    ChevronRight, ChevronDown, Plus, Sparkles, Package, Wrench,
    FileText, Upload, CheckCircle, Clock, XCircle,
    Search, Trash2, Link, AlertCircle, Star, X, PenLine, ShieldCheck,
    GripVertical, ArrowUpDown, ArrowUp, ArrowDown, Filter,
    Lock, FileDown, Copy, ChevronLeft, ExternalLink, ShoppingCart, Warehouse, LogOut,
} from 'lucide-react';
import { API_URL } from '../../../config';

// ─── Stałe ────────────────────────────────────────────────────────────────────

const TYPE_META = {
    DEVICE:   { label: 'Urządzenie', icon: Package,   color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    MATERIAL: { label: 'Materiał',   icon: Wrench,    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
};

const STATUS_META = {
    PENDING:   { label: 'Oczekuje',     icon: Clock,        color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
    PROPOSAL:  { label: 'Propozycja',   icon: Star,         color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
    CONFIRMED: { label: 'Potwierdzone', icon: CheckCircle,  color: 'text-green-400 bg-green-400/10 border-green-400/20' },
    REJECTED:  { label: 'Odrzucone',    icon: XCircle,      color: 'text-red-400 bg-red-400/10 border-red-400/20' },
    ORDERED:   { label: 'Zamówione',    icon: ShoppingCart,  color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
    IN_STOCK:  { label: 'Na magazynie', icon: Warehouse,     color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
    ISSUED:    { label: 'Wydane',       icon: LogOut,        color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
};

const UNITS = ['szt', 'm', 'mb', 'kg', 'kpl', 'par', 'l', 'op', 'kW', 'W', 'A'];

const DEFAULT_REQUIREMENT_FORM = { name: '', type: 'DEVICE', quantity: 1, unit: 'szt', technicalSpec: '' };

// ─── Hook do edycji inline ────────────────────────────────────────────────────

function useInlineEdit(initialValue, onSave) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(initialValue);
    const ref = useRef(null);

    useEffect(() => { setValue(initialValue); }, [initialValue]);
    useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

    const commit = () => {
        setEditing(false);
        if (value !== initialValue) onSave(value);
    };

    return {
        editing, value, ref, setValue,
        start: () => setEditing(true),
        cancel: () => { setEditing(false); setValue(initialValue); },
        commit,
        onKeyDown: e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setValue(initialValue); } },
    };
}

// ─── Komórki edytowalne ────────────────────────────────────────────────────────

function EditableText({ value, onSave, className = '', placeholder = '—', readOnly = false }) {
    const edit = useInlineEdit(value, onSave);
    if (readOnly) return (
        <span className={`px-1 py-1 block ${className}`}>{value || <span className="text-gray-600 italic text-xs">{placeholder}</span>}</span>
    );
    if (edit.editing) return (
        <input ref={edit.ref} value={edit.value}
            onChange={e => edit.setValue(e.target.value)}
            onBlur={edit.commit} onKeyDown={edit.onKeyDown}
            className="w-full bg-black/60 border border-blue-500/50 rounded px-2 py-1.5 text-white text-sm focus:outline-none min-w-[80px]" />
    );
    return (
        <span onClick={edit.start} title="Kliknij aby edytować"
            className={`cursor-text hover:bg-white/5 rounded px-1 py-1 block transition-colors group h-full flex items-center ${className}`}>
            {value || <span className="text-gray-600 italic text-xs">{placeholder}</span>}
            <PenLine size={9} className="inline ml-1 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </span>
    );
}

function EditableTextarea({ value, onSave, className = '', placeholder = 'Wpisz wymagania...', rows = 8, readOnly = false }) {
    const [localValue, setLocalValue] = useState(value || '');
    const timerRef = useRef(null);

    useEffect(() => { setLocalValue(value || ''); }, [value]);

    const handleChange = (e) => {
        const v = e.target.value;
        setLocalValue(v);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onSave(v), 800);
    };

    const handleBlur = () => {
        clearTimeout(timerRef.current);
        if (localValue !== (value || '')) onSave(localValue);
    };

    if (readOnly) return (
        <pre className={`w-full bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-gray-300 text-sm font-mono leading-relaxed whitespace-pre-wrap ${className}`}>{localValue || <span className="text-gray-600 italic">{placeholder}</span>}</pre>
    );

    return (
        <textarea value={localValue} rows={rows} placeholder={placeholder}
            onChange={handleChange} onBlur={handleBlur}
            className={`w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50 resize-y min-h-[10rem] font-mono leading-relaxed transition-colors ${className}`} />
    );
}

function EditableNumber({ value, onSave, readOnly = false }) {
    const edit = useInlineEdit(value, v => onSave(Number(v)));
    if (readOnly) return <span className="text-sm text-gray-300 font-mono px-1">{value}</span>;
    if (edit.editing) return (
        <input ref={edit.ref} type="number" value={edit.value} min={0}
            onChange={e => edit.setValue(e.target.value)}
            onBlur={edit.commit} onKeyDown={edit.onKeyDown}
            className="w-20 bg-black/60 border border-blue-500/50 rounded px-2 py-1.5 text-white text-sm focus:outline-none font-mono" />
    );
    return (
        <span onClick={edit.start} title="Kliknij aby edytować"
            className="cursor-text hover:bg-white/5 rounded px-1 py-0.5 text-sm text-gray-300 font-mono transition-colors group">
            {value}
            <PenLine size={9} className="inline ml-1 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
    );
}

function EditableSelect({ value, options, onSave, renderValue, readOnly = false }) {
    const [editing, setEditing] = useState(false);
    const ref = useRef(null);
    useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
    if (readOnly) return <span className="py-1 px-1 block">{renderValue ? renderValue(value) : value}</span>;
    if (editing) return (
        <select ref={ref} value={value} autoFocus
            onChange={e => { onSave(e.target.value); setEditing(false); }}
            onBlur={() => setEditing(false)}
            className="bg-black/80 border border-blue-500/50 rounded px-2 py-1.5 text-white text-sm focus:outline-none">
            {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
    );
    return (
        <span onClick={() => setEditing(true)} title="Kliknij aby zmienić"
            className="cursor-pointer hover:bg-white/5 rounded py-1 px-1 block transition-colors group">
            {renderValue ? renderValue(value) : value}
            <PenLine size={9} className="inline ml-1 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
    );
}

// ─── Badge'e ──────────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
    const meta = TYPE_META[type] || TYPE_META.DEVICE;
    const Icon = meta.icon;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${meta.color}`}><Icon size={9} />{meta.label}</span>;
}

function StatusBadge({ status }) {
    const meta = STATUS_META[status] || STATUS_META.PENDING;
    const Icon = meta.icon;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.color}`}><Icon size={9} />{meta.label}</span>;
}

function ConfidenceBar({ value }) {
    if (value == null) return null;
    const pct = Math.round(value * 100);
    const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-1.5">
            <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[9px] text-gray-500">{pct}%</span>
        </div>
    );
}

// ─── Sekcja propozycji (rozwinięty wiersz) ────────────────────────────────────

function ProposalsSection({ req, token, onUpdated, readOnly = false, readOnlyDelete = false }) {
    const [searching, setSearching] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newProposal, setNewProposal] = useState({ productName: '', manufacturer: '', model: '', sourceUrl: '' });
    const authHeaders = { Authorization: `Bearer ${token}` };

    const handleSearch = async () => {
        setSearching(true);
        const res = await fetch(`${API_URL}/material-requirements/${req.id}/search-products`, { method: 'POST', headers: authHeaders });
        if (res.ok) onUpdated(null);
        setSearching(false);
    };

    const handleAddProposal = async () => {
        if (!newProposal.productName || !newProposal.manufacturer) return;
        const res = await fetch(`${API_URL}/material-requirements/${req.id}/proposals`, {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify(newProposal),
        });
        if (res.ok) { onUpdated(null); setShowAddForm(false); setNewProposal({ productName: '', manufacturer: '', model: '', sourceUrl: '' }); }
    };

    const handleSelect = async (proposalId) => {
        if (readOnly) return;
        await fetch(`${API_URL}/material-requirements/proposals/${proposalId}/select`, { method: 'PATCH', headers: authHeaders });
        onUpdated(null);
    };

    const handleDelete = async (proposalId, e) => {
        e.stopPropagation();
        if (readOnly) return;
        await fetch(`${API_URL}/material-requirements/proposals/${proposalId}`, { method: 'DELETE', headers: authHeaders });
        onUpdated(null);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] uppercase tracking-widest text-gray-500">Propozycje produktów</p>
                {!readOnly && (
                    <button onClick={() => setShowAddForm(p => !p)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-[10px] font-semibold transition-all">
                        <Plus size={9} /> Dodaj ręcznie
                    </button>
                )}
            </div>

            {!readOnly && showAddForm && (
                <div className="mb-2 p-2 rounded-lg border border-blue-500/20 bg-blue-500/5 flex flex-col gap-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                        <input value={newProposal.productName} onChange={e => setNewProposal(p => ({ ...p, productName: e.target.value }))}
                            placeholder="Nazwa produktu *" autoFocus
                            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
                        <input value={newProposal.manufacturer} onChange={e => setNewProposal(p => ({ ...p, manufacturer: e.target.value }))}
                            placeholder="Producent *"
                            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
                        <input value={newProposal.model} onChange={e => setNewProposal(p => ({ ...p, model: e.target.value }))}
                            placeholder="Model / Symbol"
                            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
                        <input value={newProposal.sourceUrl} onChange={e => setNewProposal(p => ({ ...p, sourceUrl: e.target.value }))}
                            placeholder="URL (https://...)"
                            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
                    </div>
                    <div className="flex justify-end gap-1.5">
                        <button onClick={() => setShowAddForm(false)} className="px-2 py-1 text-[10px] text-gray-500 hover:text-white transition-colors">Anuluj</button>
                        <button onClick={handleAddProposal} disabled={!newProposal.productName || !newProposal.manufacturer}
                            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold disabled:opacity-40 transition-all">
                            Dodaj
                        </button>
                    </div>
                </div>
            )}

            {(req.proposals || []).length === 0
                ? <p className="text-xs text-gray-600 italic">Brak propozycji{!readOnly && ' — kliknij "Szukaj" lub "Dodaj ręcznie"'}</p>
                : <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-1">
                    {(req.proposals || []).map(p => (
                        <div key={p.id}
                            onClick={() => handleSelect(p.id)}
                            className={`flex items-start gap-2 p-2 rounded-lg border transition-all ${readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-white/5'} ${p.isSelected ? 'border-green-500/40 bg-green-500/10' : 'border-white/5 bg-white/[0.02]'}`}>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-white font-medium truncate">{p.productName}</p>
                                <p className="text-[10px] text-gray-400">{p.manufacturer}{p.model ? ` · ${p.model}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {p.matchScore != null && <span className="text-[9px] text-gray-500">{Math.round(p.matchScore * 100)}%</span>}
                                {p.sourceUrl && (
                                    <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-400 hover:text-blue-300"><Link size={9} /></a>
                                )}
                                {p.isSelected && <Star size={9} className="text-green-400 fill-green-400" />}
                                {!readOnly && !readOnlyDelete && <button onClick={e => handleDelete(p.id, e)} className="text-gray-600 hover:text-red-400 transition-colors ml-1"><X size={9} /></button>}
                            </div>
                        </div>
                    ))}
                </div>
            }
        </div>
    );
}

// ─── Tabela zgodności ─────────────────────────────────────────────────────────

const COMPLIANCE_COLORS = {
    'spełnia':    'bg-green-500/20 text-green-300 border-green-500/30',
    'nie spełnia':'bg-red-500/20 text-red-300 border-red-500/30',
    'częściowo':  'bg-amber-500/20 text-amber-300 border-amber-500/30',
};
const COMPLIANCE_CYCLE = ['spełnia', 'nie spełnia', 'częściowo', null];

function ComplianceTable({ req, token, onUpdated, onPatchSpec, onSearchDone, readOnly = false, readOnlyDelete = false }) {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const [evaluating, setEvaluating] = useState(false);
    const [searching, setSearching] = useState(false);
    const [showSpec, setShowSpec] = useState(true);

    const compliance = (() => {
        try { return req.complianceData ? JSON.parse(req.complianceData) : null; } catch { return null; }
    })();

    const requirements = compliance?.requirements?.length
        ? compliance.requirements
        : (req.technicalSpec || '').split(/\n/).map(s => s.trim()).filter(s => s.length > 2);

    const products = (req.proposals || []).length > 0
        ? (req.proposals || []).map(p => ({ id: p.id, name: `${p.manufacturer} ${p.model || p.productName}`.trim() }))
        : (compliance?.products || []);

    const matrix = compliance?.matrix || {};

    // Kolumna użytkownika — przechowywana osobno, AI jej nie nadpisuje
    const userCol = compliance?.userProduct || { name: '', matrix: {} };
    const [userColName, setUserColName] = useState(userCol.name);
    const userMatrix = userCol.matrix || {};

    const handleSearch = async () => {
        setSearching(true);
        const res = await fetch(`${API_URL}/material-requirements/${req.id}/search-products`, {
            method: 'POST', headers: authHeaders,
        });
        if (res.ok) { onUpdated(null); onSearchDone?.(); }
        setSearching(false);
    };

    const handleSelectProduct = async (proposalId) => {
        if (readOnly) return;
        await fetch(`${API_URL}/material-requirements/proposals/${proposalId}/select`, { method: 'PATCH', headers: authHeaders });
        onUpdated(null);
    };

    const handleEvaluate = async () => {
        setEvaluating(true);
        // Zachowaj kolumnę użytkownika przed oceną AI
        const savedUserProduct = { name: userColName, matrix: { ...userMatrix } };
        const res = await fetch(`${API_URL}/material-requirements/${req.id}/evaluate-compliance`, {
            method: 'POST', headers: authHeaders,
        });
        if (res.ok) {
            const updated = await res.json();
            // Scal z powrotem kolumnę użytkownika
            const newCompliance = (() => { try { return updated.complianceData ? JSON.parse(updated.complianceData) : {}; } catch { return {}; } })();
            const merged = JSON.stringify({ ...newCompliance, userProduct: savedUserProduct });
            await fetch(`${API_URL}/material-requirements/${req.id}`, {
                method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ complianceData: merged }),
            });
            onUpdated(null);
        }
        setEvaluating(false);
    };

    const saveCompliance = async (newReqs, newMatrix) => {
        const newData = JSON.stringify({ requirements: newReqs, products, matrix: newMatrix, userProduct: { name: userColName, matrix: userMatrix } });
        const res = await fetch(`${API_URL}/material-requirements/${req.id}`, {
            method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ complianceData: newData }),
        });
        if (res.ok) onUpdated(await res.json());
    };

    const saveUserCol = async (name, newUserMatrix) => {
        const newData = JSON.stringify({ requirements, products, matrix, userProduct: { name, matrix: newUserMatrix } });
        const res = await fetch(`${API_URL}/material-requirements/${req.id}`, {
            method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ complianceData: newData }),
        });
        if (res.ok) onUpdated(await res.json());
    };

    const toggleCell = async (reqIdx, productId) => {
        if (readOnly) return;
        const key = `${reqIdx}_${productId}`;
        const current = matrix[key] || null;
        const nextIdx = (COMPLIANCE_CYCLE.indexOf(current) + 1) % COMPLIANCE_CYCLE.length;
        const next = COMPLIANCE_CYCLE[nextIdx];
        const newMatrix = { ...matrix };
        if (next === null) delete newMatrix[key]; else newMatrix[key] = next;
        await saveCompliance(requirements, newMatrix);
    };

    const toggleUserCell = async (ri) => {
        if (readOnly) return;
        const key = `${ri}`;
        const current = userMatrix[key] || null;
        const nextIdx = (COMPLIANCE_CYCLE.indexOf(current) + 1) % COMPLIANCE_CYCLE.length;
        const next = COMPLIANCE_CYCLE[nextIdx];
        const newUM = { ...userMatrix };
        if (next === null) delete newUM[key]; else newUM[key] = next;
        await saveUserCol(userColName, newUM);
    };

    const editRequirement = async (ri, newText) => {
        if (readOnly) return;
        const newReqs = [...requirements];
        newReqs[ri] = newText;
        await saveCompliance(newReqs, matrix);
    };

    const deleteRequirement = async (ri) => {
        if (readOnly) return;
        const newReqs = requirements.filter((_, i) => i !== ri);
        const newMatrix = {};
        for (const [key, val] of Object.entries(matrix)) {
            const [oldIdx, prodId] = key.split('_');
            const idx = Number(oldIdx);
            if (idx === ri) continue;
            const newIdx = idx > ri ? idx - 1 : idx;
            newMatrix[`${newIdx}_${prodId}`] = val;
        }
        await saveCompliance(newReqs, newMatrix);
    };

    return (
        <div>
            {/* Wymagania techniczne — ukryte dla logistyka */}
            {!readOnlyDelete && (
                <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] uppercase tracking-widest text-gray-500">Wymagania techniczne — każde w osobnym wierszu</p>
                        {!readOnly && (
                            <button onClick={() => setShowSpec(s => !s)} title={showSpec ? 'Zwiń' : 'Rozwiń'}
                                className="p-0.5 text-gray-600 hover:text-gray-300 transition-colors">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    {showSpec && (
                        <EditableTextarea value={req.technicalSpec} onSave={v => onPatchSpec({ technicalSpec: v })} rows={6} readOnly={readOnly} />
                    )}
                </div>
            )}

            {requirements.length === 0 ? (
                <p className="text-xs text-gray-600 italic">Wpisz wymagania powyżej — każde w osobnym wierszu.</p>
            ) : (<>

            <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-widest text-gray-500">Tabela zgodności</p>
                {!readOnly && (
                    <div className="flex items-center gap-1.5">
                        <button onClick={handleSearch} disabled={searching}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-[10px] font-semibold transition-all disabled:opacity-40">
                            {searching ? <div className="w-3 h-3 border border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> : <Search size={9} />}
                            Szukaj produktów
                        </button>
                        <button onClick={handleEvaluate} disabled={evaluating || products.length === 0}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-[10px] font-semibold transition-all disabled:opacity-40">
                            {evaluating ? <div className="w-3 h-3 border border-purple-400/30 border-t-purple-400 rounded-full animate-spin" /> : <ShieldCheck size={9} />}
                            Oceń AI
                        </button>
                    </div>
                )}
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/5">
                <table className="w-full text-[11px]">
                    <thead>
                        <tr className="border-b border-white/5 bg-black/30">
                            <th className="px-2 py-1.5 text-left text-[9px] uppercase tracking-widest text-gray-500 font-semibold w-[200px] max-w-[200px]">Wymaganie</th>
                            {/* Kolumna użytkownika — zawsze widoczna, AI jej nie nadpisuje */}
                            <th className="px-1.5 py-1.5 text-center w-[130px] border-r border-white/5">
                                {readOnly
                                    ? <span className="text-[10px] text-gray-400 font-semibold">{userColName || 'Mój produkt'}</span>
                                    : <input
                                        value={userColName}
                                        onChange={e => setUserColName(e.target.value)}
                                        onBlur={() => saveUserCol(userColName, userMatrix)}
                                        onKeyDown={e => e.key === 'Enter' && saveUserCol(userColName, userMatrix)}
                                        placeholder="Mój produkt"
                                        className="w-full bg-transparent border border-dashed border-amber-500/30 rounded px-1.5 py-0.5 text-[10px] text-amber-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/60 text-center" />
                                }
                            </th>
                            {products.map(p => {
                                const proposal = (req.proposals || []).find(pr => pr.id === p.id);
                                return (
                                    <th key={p.id} className="px-1.5 py-1.5 text-center w-[120px]">
                                        <button onClick={() => handleSelectProduct(p.id)} title={readOnly ? undefined : 'Kliknij aby wybrać ten produkt'}
                                            disabled={readOnly}
                                            className={`block w-full text-xs font-semibold truncate rounded px-1 py-0.5 transition-all ${proposal?.isSelected ? 'text-green-300 bg-green-500/10' : 'text-blue-300 hover:text-white hover:bg-white/5'} disabled:cursor-default`}>
                                            {p.name}
                                        </button>
                                    </th>
                                );
                            })}
                            <th className="w-6" />
                        </tr>
                    </thead>
                    <tbody>
                        {requirements.map((req_text, ri) => (
                            <tr key={ri} className="border-b border-white/[0.03] hover:bg-white/[0.02] group/row">
                                <td className="px-2 py-1 text-gray-300 leading-snug w-[200px] max-w-[200px]">
                                    <EditableText value={req_text} onSave={v => editRequirement(ri, v)} className="text-gray-300 text-[11px]" readOnly={readOnly} />
                                </td>
                                {/* Kolumna użytkownika */}
                                <td className="px-1 py-1 text-center border-r border-white/5">
                                    <button onClick={() => toggleUserCell(ri)} disabled={readOnly}
                                        title={readOnly ? undefined : 'Kliknij aby zmienić'}
                                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border transition-all hover:opacity-80 ${userMatrix[`${ri}`] ? COMPLIANCE_COLORS[userMatrix[`${ri}`]] : 'border-amber-500/20 text-amber-700 bg-transparent'} disabled:cursor-default`}>
                                        {userMatrix[`${ri}`] || '—'}
                                    </button>
                                </td>
                                {products.map(p => {
                                    const key = `${ri}_${p.id}`;
                                    const val = matrix[key] || null;
                                    return (
                                        <td key={p.id} className="px-1 py-1 text-center">
                                            <button onClick={() => toggleCell(ri, p.id)} title={readOnly ? undefined : 'Kliknij aby zmienić'}
                                                disabled={readOnly}
                                                className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border transition-all hover:opacity-80 ${val ? COMPLIANCE_COLORS[val] : 'border-white/10 text-gray-600 bg-transparent'} disabled:cursor-default disabled:hover:opacity-100`}>
                                                {val || '—'}
                                            </button>
                                        </td>
                                    );
                                })}
                                <td className="px-0.5 py-1 text-center">
                                    {!readOnly && !readOnlyDelete && (
                                        <button onClick={() => deleteRequirement(ri)} title="Usuń wymaganie"
                                            className="text-red-800 hover:text-red-400 transition-colors opacity-0 group-hover/row:opacity-100">
                                            <X size={9} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {products.length === 0 && !readOnly && (
                <p className="text-xs text-gray-600 italic mt-2">Kliknij „Szukaj produktów" lub wpisz własny produkt w kolumnie po lewej.</p>
            )}
            </>
            )}
        </div>
    );
}

// ─── Rozwinięty widok wiersza ──────────────────────────────────────────────────

// ─── Modal pozycji oferty ─────────────────────────────────────────────────────

function OfferPositionsModal({ positions, onSelect, onClose }) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="w-[760px] max-h-[80vh] bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl flex flex-col"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
                    <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                        <FileText size={14} className="text-teal-400" />
                        Pozycje z oferty — wybierz wiersz
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X size={16} /></button>
                </div>
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#0f1117] border-b border-white/5">
                            <tr>
                                {['Lp', 'Opis / nazwa', 'Producent', 'Model', 'Jedn', 'Ilość', 'Cena netto'].map(h => (
                                    <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map((pos, i) => (
                                <tr key={i} onClick={() => onSelect(pos)}
                                    className="border-b border-white/[0.03] hover:bg-teal-500/10 cursor-pointer transition-colors group">
                                    <td className="px-3 py-2 text-gray-500 font-mono">{pos.lp ?? i + 1}</td>
                                    <td className="px-3 py-2 text-white font-medium max-w-[220px]">
                                        <span className="block truncate">{pos.description || '—'}</span>
                                    </td>
                                    <td className="px-3 py-2 text-gray-300">{pos.manufacturer || '—'}</td>
                                    <td className="px-3 py-2 text-gray-300 font-mono">{pos.model || '—'}</td>
                                    <td className="px-3 py-2 text-gray-400">{pos.unit || 'szt'}</td>
                                    <td className="px-3 py-2 text-gray-300 font-mono">{pos.quantity ?? '—'}</td>
                                    <td className="px-3 py-2 text-teal-300 font-mono font-semibold">
                                        {pos.priceNetto != null ? pos.priceNetto.toLocaleString('pl-PL', { minimumFractionDigits: 2 }) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-5 py-3 border-t border-white/5 text-[10px] text-gray-600">
                    Kliknij wiersz aby uzupełnić puste pola · pola już wypełnione nie zostaną nadpisane
                </div>
            </div>
        </div>
    );
}

// ─── Rozwinięty widok wiersza ─────────────────────────────────────────────────

function ExpandedRow({ req, token, onUpdated, onDeleted, readOnly = false, readOnlyDelete = false, offerFiles: offerFilesProp = [], nodeId = null, showCompliance = false, onToggleCompliance }) {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const [offerFiles, setOfferFiles] = useState(offerFilesProp);
    const [offerModal, setOfferModal] = useState(null);

    useEffect(() => {
        setOfferFiles(offerFilesProp);
    }, [offerFilesProp]);

    const manualProposals = (req.proposals || []).filter(p => p.isManual);

    return (
        <div className="px-4 pb-4 pt-3 bg-black/20 border-t border-white/5">
            {offerModal && (
                <OfferPositionsModal
                    positions={offerModal.positions}
                    onSelect={pos => offerModal.onSelect(pos)}
                    onClose={() => setOfferModal(null)}
                />
            )}
            {/* Tabela zgodności */}
            <div className="mb-4">
                <button onClick={onToggleCompliance}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${showCompliance ? 'bg-green-600/20 border-green-500/30 text-green-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}`}>
                    <ShieldCheck size={11} />
                    Tabela zgodności
                    {showCompliance ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </button>
                {showCompliance && (
                    <div className="mt-2 p-3 rounded-lg border border-white/5 bg-black/20">
                        <ComplianceTable req={req} token={token} onUpdated={onUpdated}
                            onPatchSpec={async (data) => {
                                await fetch(`${API_URL}/material-requirements/${req.id}`, {
                                    method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
                                });
                                onUpdated(null);
                            }}
                            onSearchDone={() => !showCompliance && onToggleCompliance()} readOnly={readOnly} readOnlyDelete={readOnlyDelete} />
                    </div>
                )}
            </div>

            {/* Karty produktów */}
            <div className="flex flex-col gap-3">
                {/* Produkt główny */}
                <ProductCard
                    cardId={req.id}
                    isMain={true}
                    initialData={{
                        manufacturer: req.manufacturer, model: req.model, productName: req.productName,
                        priceNetto: req.priceNetto, seller: req.seller, offerNumber: req.offerNumber,
                        availability: req.availability,
                        imageUrl: req.imageUrl, productUrl: req.productUrl,
                    }}
                    materialId={req.materialId}
                    patchUrl={`${API_URL}/material-requirements/${req.id}`}
                    imageUploadUrl={`${API_URL}/material-requirements/${req.id}/upload-image`}
                    imageServeUrl={`${API_URL}/material-requirements/${req.id}/image`}
                    datasheetUploadUrl={`${API_URL}/material-requirements/${req.id}/upload-datasheet`}
                    complianceUploadUrl={`${API_URL}/material-requirements/${req.id}/upload-compliance`}
                    datasheetName={req.dataSheetName || req.material?.dataSheetName}
                    complianceName={req.complianceName}
                    isAccepted={req.status === 'CONFIRMED'}
                    isRejected={req.status === 'REJECTED'}
                    onToggleAccept={async () => {
                        const newStatus = req.status === 'CONFIRMED' ? 'PENDING' : 'CONFIRMED';
                        const patch = { status: newStatus };
                        // Cofnięcie akceptacji → czyść pola produktu w headerze
                        if (newStatus === 'PENDING') {
                            Object.assign(patch, { manufacturer: null, model: null, priceNetto: null, seller: null, offerNumber: null, availability: null });
                        }
                        await fetch(`${API_URL}/material-requirements/${req.id}`, {
                            method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                            body: JSON.stringify(patch),
                        });
                        onUpdated(null);
                    }}
                    onReject={async () => {
                        // Odrzucenie → czyść pola produktu w headerze
                        await fetch(`${API_URL}/material-requirements/${req.id}`, {
                            method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'REJECTED', manufacturer: null, model: null, priceNetto: null, seller: null, offerNumber: null, availability: null }),
                        });
                        onUpdated(null);
                    }}
                    onUnreject={async () => {
                        await fetch(`${API_URL}/material-requirements/${req.id}`, {
                            method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'PENDING' }),
                        });
                        onUpdated(null);
                    }}
                    offerFiles={offerFiles}
                    token={token}
                    readOnly={readOnly}
                    isMandatory={true}
                    onUpdated={onUpdated}
                    onSetOfferModal={setOfferModal}
                    linkField="productUrl"
                    nodeId={nodeId}
                />

                {/* Produkty alternatywne */}
                {manualProposals.map(p => (
                    <ProductCard
                        key={p.id}
                        cardId={p.id}
                        isMain={false}
                        initialData={{
                            manufacturer: p.manufacturer, model: p.model, productName: p.productName,
                            priceNetto: p.priceNetto, seller: p.seller, offerNumber: p.offerNumber,
                            availability: p.availability,
                            imageUrl: p.imageUrl, sourceUrl: p.sourceUrl,
                        }}
                        patchUrl={`${API_URL}/material-requirements/proposals/${p.id}`}
                        imageUploadUrl={`${API_URL}/material-requirements/proposals/${p.id}/upload-image`}
                        imageServeUrl={`${API_URL}/material-requirements/proposals/${p.id}/image`}
                        datasheetUploadUrl={`${API_URL}/material-requirements/proposals/${p.id}/upload-datasheet`}
                        complianceUploadUrl={`${API_URL}/material-requirements/proposals/${p.id}/upload-compliance`}
                        datasheetName={p.dataSheetName}
                        complianceName={p.complianceName}
                        isAccepted={p.isSelected}
                        isRejected={p.isRejected}
                        onToggleAccept={async () => {
                            await fetch(`${API_URL}/material-requirements/proposals/${p.id}/select`, { method: 'PATCH', headers: authHeaders });
                            // Kopiuj dane propozycji do headera wymagania
                            const willSelect = !p.isSelected;
                            const headerPatch = willSelect
                                ? { manufacturer: p.manufacturer || null, model: p.model || null, priceNetto: p.priceNetto ?? null, seller: p.seller || null, offerNumber: p.offerNumber || null, availability: p.availability || null, status: 'CONFIRMED' }
                                : { manufacturer: null, model: null, priceNetto: null, seller: null, offerNumber: null, availability: null, status: 'PENDING' };
                            await fetch(`${API_URL}/material-requirements/${req.id}`, {
                                method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                                body: JSON.stringify(headerPatch),
                            });
                            onUpdated(null);
                        }}
                        onReject={async () => {
                            await fetch(`${API_URL}/material-requirements/proposals/${p.id}`, {
                                method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ isRejected: true }),
                            });
                            // Jeśli ta propozycja była wybrana → czyść header
                            if (p.isSelected) {
                                await fetch(`${API_URL}/material-requirements/${req.id}`, {
                                    method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ manufacturer: null, model: null, priceNetto: null, seller: null, offerNumber: null, availability: null, status: 'PENDING' }),
                                });
                            }
                            onUpdated(null);
                        }}
                        onUnreject={async () => {
                            await fetch(`${API_URL}/material-requirements/proposals/${p.id}`, {
                                method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ isRejected: false }),
                            });
                            onUpdated(null);
                        }}
                        offerFiles={offerFiles}
                        token={token}
                        readOnly={readOnly}
                        isMandatory={true}
                        onUpdated={() => onUpdated(null)}
                        onSetOfferModal={setOfferModal}
                        onDelete={async () => {
                            await fetch(`${API_URL}/material-requirements/proposals/${p.id}`, { method: 'DELETE', headers: authHeaders });
                            onUpdated(null);
                        }}
                        linkField="sourceUrl"
                        nodeId={nodeId}
                    />
                ))}
            </div>

            {/* Dodaj kolejny produkt */}
            {!readOnly && (
                <button
                    onClick={async () => {
                        const res = await fetch(`${API_URL}/material-requirements/${req.id}/proposals`, {
                            method: 'POST',
                            headers: { ...authHeaders, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ productName: '', manufacturer: '', model: '' }),
                        });
                        if (res.ok) onUpdated(null);
                    }}
                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 text-xs border border-blue-500/20 transition-all">
                    <Plus size={11} /> Dodaj kolejny produkt
                </button>
            )}
        </div>
    );
}

// ─── Moduł uploadu obrazu z miniaturką i drag & drop ─────────────────────────

function ImageUploadModule({ imageUrl, uploadUrl, token, readOnly, onUploaded, cacheBust }) {
    const [uploading, setUploading] = useState(false);
    const [localUrl, setLocalUrl] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [hovered, setHovered] = useState(false);

    useEffect(() => {
        if (!hovered || readOnly) return;
        const handler = (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    handleUpload(item.getAsFile());
                    break;
                }
            }
        };
        document.addEventListener('paste', handler);
        return () => document.removeEventListener('paste', handler);
    }, [hovered, readOnly]);
    const serveUrl = uploadUrl.replace('/upload-image', '/image');

    // Pobierz obraz jako blob (img src nie wysyła auth headera)
    useEffect(() => {
        if (!imageUrl) { setLocalUrl(null); return; }
        let objectUrl = null;
        fetch(serveUrl, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.blob() : null)
            .then(blob => { if (blob) { objectUrl = URL.createObjectURL(blob); setLocalUrl(objectUrl); } })
            .catch(() => {});
        return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [imageUrl, cacheBust, token]);

    const handleUpload = async (file) => {
        if (!file || readOnly) return;
        if (!file.type.startsWith('image/')) return;
        setUploading(true);
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        if (res.ok) {
            const data = await res.json();
            // Odśwież blob URL po uploadzie
            const imgRes = await fetch(serveUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (imgRes.ok) { const blob = await imgRes.blob(); setLocalUrl(URL.createObjectURL(blob)); }
            onUploaded(data);
        }
        setUploading(false);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleUpload(file);
    };

    if (readOnly && !localUrl) return null;

    return (
        <div className="flex flex-col gap-1.5">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Zdjęcie / print screen</p>
            {localUrl ? (
                <div className="relative group"
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    onDragOver={readOnly ? undefined : e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={readOnly ? undefined : () => setDragging(false)}
                    onDrop={readOnly ? undefined : onDrop}>
                    <img src={localUrl} alt="Podgląd urządzenia"
                        style={{ maxWidth: '320px', maxHeight: '220px', width: 'auto', height: 'auto' }}
                        className={`rounded-lg border object-contain bg-black/20 transition-all ${dragging ? 'border-teal-400 opacity-60' : 'border-white/10'}`} />
                    {!readOnly && (
                        <label className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                            <div className="flex flex-col items-center gap-1 text-white">
                                <Upload size={16} />
                                <span className="text-xs">Zmień / upuść</span>
                            </div>
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e.target.files?.[0])} />
                        </label>
                    )}
                    {dragging && (
                        <div className="absolute inset-0 rounded-lg border-2 border-teal-400 border-dashed flex items-center justify-center bg-teal-500/10 pointer-events-none">
                            <span className="text-teal-300 text-xs font-semibold">Upuść zdjęcie</span>
                        </div>
                    )}
                </div>
            ) : (
                <div
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    className={`rounded-lg border-2 border-dashed transition-all ${hovered && !readOnly ? 'border-teal-500/40 bg-teal-500/5' : dragging ? 'border-teal-400 bg-teal-500/10' : 'border-white/10 hover:border-white/25'}`}>
                    <label className={`flex flex-col items-center gap-2 px-6 py-4 cursor-pointer text-center ${uploading ? 'opacity-50' : ''}`}>
                        {uploading
                            ? <div className="w-5 h-5 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
                            : <Upload size={18} className={dragging ? 'text-teal-400' : 'text-gray-500'} />}
                        <span className={`text-xs ${dragging ? 'text-teal-300' : 'text-gray-500'}`}>
                            {dragging ? 'Upuść zdjęcie' : 'Wgraj print screen'}
                        </span>
                        <span className="text-[10px] text-gray-600">przeciągnij, upuść lub <kbd className="px-1 py-0.5 rounded bg-white/5 text-gray-500 font-mono">Ctrl+V</kbd></span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e.target.files?.[0])} disabled={uploading} />
                    </label>
                </div>
            )}
        </div>
    );
}

// ─── Karta produktu (główny i alternatywne) ───────────────────────────────────

function ProductCard({
    cardId, isMain = false, initialData, patchUrl,
    imageUploadUrl, imageServeUrl,
    datasheetUploadUrl, complianceUploadUrl,
    datasheetName, complianceName,
    isAccepted, isRejected = false, onToggleAccept, onReject, onUnreject,
    offerFiles = [], token, readOnly, isMandatory,
    onUpdated, onDelete, onSetOfferModal,
    linkField = 'productUrl', nodeId = null,
    materialId = null,
}) {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const [materialDb, setMaterialDb] = useState([]);
    useEffect(() => {
        if (!nodeId || !token) return;
        fetch(`${API_URL}/material-requirements/database`, { headers: authHeaders })
            .then(r => r.ok ? r.json() : [])
            .then(setMaterialDb)
            .catch(() => {});
    }, [nodeId]);
    const [fields, setFields] = useState({
        manufacturer: initialData.manufacturer ?? '',
        model: initialData.model ?? '',
        productName: initialData.productName ?? '',
        priceNetto: initialData.priceNetto != null ? String(initialData.priceNetto) : '',
        seller: initialData.seller ?? '',
        offerNumber: initialData.offerNumber ?? '',
        availability: initialData.availability ?? '',
        link: initialData[linkField] ?? '',
    });
    const [uploading, setUploading] = useState({ datasheet: false, compliance: false });
    const [parsingOffer, setParsingOffer] = useState(false);
    const [offerPositions, setOfferPositions] = useState([]);
    const [offerPositionIdx, setOfferPositionIdx] = useState('');
    const [comboOpen, setComboOpen] = useState(null); // 'manufacturer' | 'model' | 'productName' | null
    const dedupeOffers = arr => {
        const seenName = new Set();
        const seenId = new Set();
        return arr.filter(o => {
            const key = o.fileName || o.id;
            if (seenName.has(key) || seenId.has(o.id)) return false;
            seenName.add(key); seenId.add(o.id);
            return true;
        });
    };
    const [localOfferFiles, setLocalOfferFiles] = useState(() => dedupeOffers(offerFiles));
    useEffect(() => { setLocalOfferFiles(dedupeOffers(offerFiles)); }, [offerFiles]);
    useEffect(() => {
        if (!token) return;
        const mapOffers = offers => dedupeOffers(offers.map(o => ({ ...o, parsedPositions: o.positions })));
        const url = nodeId ? `${API_URL}/offers/node/${nodeId}` : `${API_URL}/offers`;
        fetch(url, { headers: authHeaders })
            .then(r => r.ok ? r.json() : [])
            .then(offers => {
                if (offers.length > 0) { setLocalOfferFiles(mapOffers(offers)); return; }
                // Fallback: pobierz wszystkie oferty z systemu
                if (nodeId) fetch(`${API_URL}/offers`, { headers: authHeaders })
                    .then(r => r.ok ? r.json() : [])
                    .then(all => { if (all.length > 0) setLocalOfferFiles(mapOffers(all)); })
                    .catch(() => {});
            })
            .catch(() => {});
    }, [nodeId]);

    useEffect(() => {
        setFields({
            manufacturer: initialData.manufacturer ?? '',
            model: initialData.model ?? '',
            productName: initialData.productName ?? '',
            priceNetto: initialData.priceNetto != null ? String(initialData.priceNetto) : '',
            seller: initialData.seller ?? '',
            offerNumber: initialData.offerNumber ?? '',
            availability: initialData.availability ?? '',
            link: initialData[linkField] ?? '',
        });
        setOfferPositionIdx('');
    }, [cardId]);

    // Inicjalizuj pozycje gdy oferta już jest wybrana
    useEffect(() => {
        if (!initialData.offerNumber || !localOfferFiles.length) return;
        const matched = localOfferFiles.find(f => f.fileName.replace(/\.[^.]+$/, '') === initialData.offerNumber);
        if (!matched) return;
        // Najpierw ustaw pozycje z cache (bez czekania)
        if (matched.parsedPositions?.length) setOfferPositions(matched.parsedPositions);
        // Pobierz świeże pozycje z parsed-positions (zawierają dataSheetUrl z mapowania)
        if (matched.documentId && token) {
            fetch(`${API_URL}/documents/${matched.documentId}/parsed-positions`, { headers: authHeaders })
                .then(r => r.ok ? r.json() : null)
                .then(fresh => { if (Array.isArray(fresh) && fresh.length > 0) setOfferPositions(fresh); })
                .catch(() => {});
        }
    }, [initialData.offerNumber, localOfferFiles]);

    // Auto-przywróć wybraną pozycję po załadowaniu listy pozycji
    useEffect(() => {
        if (!offerPositions.length || offerPositionIdx) return;
        const match = offerPositions.find(p => {
            const normModel = s => (s || '').toLowerCase().replace(/[\s\-_.]/g, '');
            if (p.model && fields.model && normModel(p.model) === normModel(fields.model)) return true;
            if (p.priceNetto != null && fields.priceNetto &&
                Math.abs(parseFloat(p.priceNetto) - parseFloat(fields.priceNetto)) < 0.01) return true;
            return false;
        });
        if (match) setOfferPositionIdx(String(match.lp));
    }, [offerPositions]);

    const setF = (k, v) => setFields(p => ({ ...p, [k]: v }));

    const patchFields = useCallback(async (data) => {
        if (readOnly) return;
        const res = await fetch(patchUrl, {
            method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
        if (res.ok) onUpdated(await res.json());
    }, [patchUrl, token, readOnly]);

    const saveF = (k) => {
        const orig = k === 'priceNetto'
            ? (initialData.priceNetto != null ? String(initialData.priceNetto) : '')
            : k === 'link' ? (initialData[linkField] ?? '') : (initialData[k] ?? '');
        if (fields[k] === orig) return;
        if (k === 'priceNetto') patchFields({ priceNetto: fields[k] ? parseFloat(fields[k]) : null });
        else if (k === 'link') patchFields({ [linkField]: fields[k] || null });
        else patchFields({ [k]: fields[k] || null });
    };

    const FIELD_LABELS = {
        manufacturer: 'Producent', model: 'Model', productName: 'Nazwa handlowa',
        priceNetto: 'Cena netto / szt', seller: 'Sprzedawca', offerNumber: 'Nr oferty',
    };
    const miss = isMandatory ? {
        manufacturer: !fields.manufacturer, model: !fields.model, productName: !fields.productName,
        priceNetto: !fields.priceNetto, seller: !fields.seller, offerNumber: !fields.offerNumber,
    } : {};
    const missingFields = Object.entries(miss).filter(([, v]) => v).map(([k]) => FIELD_LABELS[k]);
    const fc = (k) => `w-full bg-black/30 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none transition-colors border disabled:opacity-40 ${miss[k] ? 'border-red-500/50 focus:border-red-400' : 'border-white/10 focus:border-teal-500'}`;
    const lc = (k) => `text-[9px] uppercase tracking-widest font-semibold mb-1 block ${miss[k] ? 'text-red-400' : 'text-gray-500'}`;

    const handleFileUpload = async (e, type) => {
        const file = e.target.files?.[0];
        if (!file || readOnly) return;
        setUploading(p => ({ ...p, [type]: true }));
        const form = new FormData();
        form.append('file', file);
        const url = type === 'datasheet' ? datasheetUploadUrl : complianceUploadUrl;
        const res = await fetch(url, { method: 'POST', headers: authHeaders, body: form });
        if (res.ok) onUpdated(await res.json());
        setUploading(p => ({ ...p, [type]: false }));
    };

    const getOfferLabel = (f) => f.fileName.replace(/\.[^.]+$/, '');
    const getOfferSeller = (f) => {
        const parts = f.fileName.replace(/\.[^.]+$/, '').split('_');
        return parts.length >= 2 ? parts[1] : parts[0];
    };

    const [parseError, setParseError] = useState(null);

    const triggerOfferParse = async (documentId) => {
        setParsingOffer(true);
        setParseError(null);
        try {
            console.log('[parse-offer] documentId:', documentId);
            const res = await fetch(`${API_URL}/material-requirements/parse-offer`, {
                method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId }),
            });
            console.log('[parse-offer] status:', res.status);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error('[parse-offer] error:', err);
                setParseError(err.message || `Błąd ${res.status}`);
                return;
            }
            const positions = await res.json();
            console.log('[parse-offer] positions:', positions.length, positions);
            if (positions.length > 0) {
                // Zapisz do bazy — kolejne wywołania będą czytać z parsedPositions, bez ponownego parsowania
                fetch(`${API_URL}/documents/${documentId}/parsed-positions`, {
                    method: 'PATCH',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ positions }),
                }).catch(() => {});
                setOfferPositions(positions);
                const applyPos = async (pos) => {
                    const updates = {};
                    const newF = { ...fields };
                    if (pos.manufacturer) { updates.manufacturer = pos.manufacturer; newF.manufacturer = pos.manufacturer; }
                    if (pos.model) { updates.model = pos.model; newF.model = pos.model; }
                    if (pos.description) { updates.productName = pos.description; newF.productName = pos.description; }
                    if (pos.priceNetto != null) { updates.priceNetto = parseFloat(String(pos.priceNetto)); newF.priceNetto = String(pos.priceNetto); }
                    setFields(newF);
                    if (Object.keys(updates).length > 0) await patchFields(updates);
                };
                onSetOfferModal?.({ positions, onSelect: applyPos });
            } else {
                setParseError('Nie znaleziono pozycji w ofercie');
            }
        } catch (e) {
            console.error('[parse-offer] exception:', e);
            setParseError('Błąd połączenia');
        } finally { setParsingOffer(false); }
    };

    return (
        <div className={`rounded-xl border p-3 ${isRejected ? 'border-red-500/20 bg-red-500/5 opacity-60' : isMain ? 'border-white/10 bg-black/30' : 'border-blue-500/15 bg-blue-500/5'}`}>
            {/* Nagłówek */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className={`text-[9px] uppercase tracking-widest font-bold ${isMain ? 'text-gray-500' : 'text-blue-400/70'}`}>
                        {isMain ? 'Produkt główny' : 'Produkt alternatywny'}
                    </span>
                    {missingFields.length > 0 && (
                        <div className="relative group/warn">
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-semibold cursor-default select-none">
                                <AlertCircle size={9} />
                                {missingFields.length} {missingFields.length === 1 ? 'brakujące pole' : missingFields.length < 5 ? 'brakujące pola' : 'brakujących pól'}
                            </div>
                            <div className="absolute top-full left-0 mt-1.5 z-50 hidden group-hover/warn:block pointer-events-none">
                                <div className="bg-[#0c0e14] border border-red-500/30 rounded-xl shadow-2xl shadow-black/60 p-3 min-w-[200px]">
                                    <p className="text-[9px] uppercase tracking-widest text-red-400 mb-2 font-bold">Wymagane pola</p>
                                    <div className="flex flex-col gap-1">
                                        {missingFields.map(f => (
                                            <p key={f} className="text-xs text-red-300 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                                {f}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {isRejected && (
                        <button onClick={onUnreject} disabled={!onUnreject || readOnly}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 disabled:cursor-default transition-all"
                            title="Kliknij, aby cofnąć odrzucenie">
                            <X size={11} /> Odrzucono
                        </button>
                    )}
                    {!readOnly && onToggleAccept && !isRejected && (
                        <button onClick={onToggleAccept}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${isAccepted ? 'bg-green-500/20 border-green-500/30 text-green-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}`}>
                            {isAccepted ? <CheckCircle size={11} /> : <Clock size={11} />}
                            {isAccepted ? 'Zaakceptowano' : 'Akceptuj'}
                        </button>
                    )}
                    {!readOnly && onReject && !isRejected && !isAccepted && (
                        <button onClick={onReject}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-red-500/20 bg-red-500/5 text-red-400/70 hover:bg-red-500/15 hover:text-red-300 transition-all">
                            <X size={11} /> Odrzuć
                        </button>
                    )}
                    {isAccepted && readOnly && (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-500/20 border border-green-500/30 text-green-300">
                            <CheckCircle size={11} /> Zaakceptowano
                        </span>
                    )}
                    {onDelete && !readOnly && (
                        <button onClick={onDelete} className="text-red-800 hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Ciało: obraz + pola */}
            <div className="flex gap-3 items-start">
                <div className="shrink-0">
                    <ImageUploadModule
                        imageUrl={initialData.imageUrl ? imageServeUrl : null}
                        uploadUrl={imageUploadUrl}
                        token={token}
                        readOnly={readOnly}
                        onUploaded={onUpdated}
                        cacheBust={initialData.imageUrl}
                    />
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                    {/* Wiersz 1 — combobox z wyszukiwaniem z bazy */}
                    <div className="grid grid-cols-7 gap-2">
                        {[['manufacturer','Producent'],['model','Model'],['productName','Nazwa handlowa']].map(([k, lbl]) => {
                            // Cross-filtering hierarchiczne: manufacturer → model → productName
                            // Każde pole filtruje tylko po polach "wyżej" w hierarchii
                            let baseDb = materialDb;
                            const ciEq = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();
                            if (k === 'model' && fields.manufacturer) baseDb = baseDb.filter(m => ciEq(m.manufacturer, fields.manufacturer));
                            if (k === 'productName') {
                                if (fields.manufacturer) baseDb = baseDb.filter(m => ciEq(m.manufacturer, fields.manufacturer));
                                if (fields.model) baseDb = baseDb.filter(m => ciEq(m.model, fields.model));
                            }

                            // Filtruj po wpisanym tekście (productName: tylko wpisy z ustawionym productName)
                            const typed = (fields[k] || '').toLowerCase();
                            const getVal = (m) => (m[k] || '');
                            const filtered = baseDb.filter(m => {
                                const v = getVal(m);
                                if (!v) return false;
                                return typed ? v.toLowerCase().includes(typed) : true;
                            });

                            // Unikalne sugestie
                            const seen = new Set();
                            const suggestions = filtered
                                .filter(m => { const v = getVal(m).toLowerCase(); return !seen.has(v) && seen.add(v); })
                                .sort((a, b) => getVal(a).localeCompare(getVal(b)));

                            const selectSuggestion = async (mat) => {
                                // Tylko powiązanie przez materialId — nie kopiujemy danych produktu na wymaganie
                                const updates = { materialId: mat.id };

                                // UI: pokaż dane materiału w polach (tylko lokalnie, bez zapisu)
                                const uiFields = {};
                                if (mat.manufacturer) uiFields.manufacturer = mat.manufacturer;
                                if (mat.model) uiFields.model = mat.model;
                                if (mat.productName) uiFields.productName = mat.productName;

                                setFields(prev => ({ ...prev, ...uiFields }));
                                setComboOpen(null);
                                await patchFields(updates);
                            };

                            return (
                                <div key={k} className="relative">
                                    <label className={lc(k)}>{lbl}{isMandatory ? ' *' : ''}</label>
                                    <input
                                        type="text"
                                        value={fields[k]}
                                        onChange={e => { setF(k, e.target.value); setComboOpen(k); }}
                                        onFocus={() => setComboOpen(k)}
                                        onBlur={e => {
                                            setTimeout(() => setComboOpen(prev => prev === k ? null : prev), 150);
                                            const val = e.target.value;
                                            // Gdy materialId ustawiony i użytkownik wyczyścił pole — odłącz materiał i wyczyść kartę katalogową
                                            if (materialId && ['manufacturer', 'model', 'productName'].includes(k)) {
                                                if (!val.trim()) {
                                                    setFields(prev => ({ ...prev, manufacturer: '', model: '', productName: '' }));
                                                    patchFields({ materialId: null, manufacturer: null, model: null, productName: null, dataSheetUrl: null, dataSheetName: null, complianceUrl: null, complianceName: null, productUrl: null });
                                                }
                                                return;
                                            }
                                            if (val !== (initialData[k] ?? '')) patchFields({ [k]: val || null });
                                        }}
                                        onKeyDown={e => { if (e.key === 'Escape') setComboOpen(null); }}
                                        disabled={readOnly}
                                        placeholder="— wpisz lub wybierz —"
                                        className={fc(k)}
                                        autoComplete="off"
                                    />
                                    {comboOpen === k && suggestions.length > 0 && !readOnly && (
                                        <div className="absolute z-[300] top-full left-0 w-full min-w-[180px] bg-gray-900 border border-white/15 rounded-lg mt-0.5 max-h-52 overflow-y-auto shadow-2xl">
                                            {suggestions.map(mat => (
                                                <button key={mat.id} onMouseDown={e => { e.preventDefault(); selectSuggestion(mat); }}
                                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 text-white truncate border-b border-white/5 last:border-0">
                                                    {getVal(mat)}
                                                    {k === 'model' && mat.manufacturer && <span className="text-gray-500 ml-1">· {mat.manufacturer}</span>}
                                                    {k === 'productName' && mat.model && <span className="text-gray-500 ml-1">· {mat.model}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <div>
                            <label className={lc('priceNetto')}>Cena netto / szt{isMandatory ? ' *' : ''}</label>
                            <input type="number" step="0.01" min="0"
                                value={fields.priceNetto} onChange={e => setF('priceNetto', e.target.value)} onBlur={() => saveF('priceNetto')}
                                disabled={readOnly} placeholder="0.00" className={fc('priceNetto') + ' font-mono'} />
                        </div>
                        <div>
                            <label className={lc('seller')}>Sprzedawca{isMandatory ? ' *' : ''}</label>
                            <input value={fields.seller} onChange={e => setF('seller', e.target.value)} onBlur={() => saveF('seller')}
                                disabled={readOnly} placeholder="Dostawca" className={fc('seller')} />
                        </div>
                        <div>
                            <label className={lc('offerNumber')}>Nr oferty{isMandatory ? ' *' : ''}</label>
                            {localOfferFiles.length > 0 ? (
                                <div className="relative">
                                    <select value={fields.offerNumber}
                                        onChange={async e => {
                                            const offerLabel = e.target.value;
                                            setF('offerNumber', offerLabel);
                                            setOfferPositionIdx('');
                                            const matched = localOfferFiles.find(f => getOfferLabel(f) === offerLabel);
                                            // Pobierz świeże pozycje z parsed-positions
                                            let positions = matched?.parsedPositions || [];
                                            if (matched?.documentId) {
                                                const res = await fetch(`${API_URL}/documents/${matched.documentId}/parsed-positions`, { headers: authHeaders }).catch(() => null);
                                                if (res?.ok) {
                                                    const fresh = await res.json().catch(() => null);
                                                    if (Array.isArray(fresh) && fresh.length > 0) positions = fresh;
                                                }
                                            }
                                            setOfferPositions(positions);
                                            // Przypisz tylko numer oferty
                                            patchFields({ offerNumber: offerLabel || null });
                                        }}
                                        disabled={readOnly || parsingOffer} className={fc('offerNumber') + ' cursor-pointer'}>
                                        <option value="" className="bg-gray-900">— wybierz —</option>
                                        {localOfferFiles.map(f => {
                                            const lbl = getOfferLabel(f);
                                            return <option key={f.id} value={lbl} className="bg-gray-900">{lbl}</option>;
                                        })}
                                    </select>
                                    {parsingOffer && <div className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 border border-teal-400/40 border-t-teal-400 rounded-full animate-spin" />}
                                    {parseError && !parsingOffer && <p className="mt-1 text-[10px] text-red-400">{parseError}</p>}
                                </div>
                            ) : (
                                <input value={fields.offerNumber} onChange={e => setF('offerNumber', e.target.value)} onBlur={() => saveF('offerNumber')}
                                    disabled={readOnly} placeholder="OF/2026/001" className={fc('offerNumber')} />
                            )}
                        </div>
                        <div>
                            <label className={lc('availability')}>Dostępność</label>
                            <input value={fields.availability} onChange={e => setF('availability', e.target.value)} onBlur={() => saveF('availability')}
                                disabled={readOnly} placeholder="np. 2 szt / 14 dni"
                                className={fc('availability')} />
                        </div>
                    </div>
                    {/* Pozycja na ofercie — przycisk parsowania gdy brak parsedPositions */}
                    {fields.offerNumber && localOfferFiles.length > 0 && offerPositions.length === 0 && (() => {
                        const matched = localOfferFiles.find(f => getOfferLabel(f) === fields.offerNumber);
                        if (!matched) return null;
                        return (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => triggerOfferParse(matched.id)}
                                    disabled={readOnly || parsingOffer}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 disabled:opacity-40 transition-all"
                                >
                                    {parsingOffer
                                        ? <><div className="w-3 h-3 border border-teal-400/40 border-t-teal-400 rounded-full animate-spin" />Parsowanie…</>
                                        : <><FileText size={11} />Pobierz pozycje z oferty</>}
                                </button>
                                {parseError && <p className="text-[10px] text-red-400">{parseError}</p>}
                            </div>
                        );
                    })()}
                    {offerPositions.length > 0 && (
                        <div>
                            <label className="text-[9px] uppercase tracking-widest text-teal-500/80 font-semibold mb-1 block">
                                Pozycja na ofercie
                            </label>
                            <select
                                value={offerPositionIdx}
                                onChange={async e => {
                                    const lpStr = e.target.value;
                                    setOfferPositionIdx(lpStr);
                                    if (!lpStr) return;
                                    // Pobierz świeże pozycje jeśli oferta ma documentId (mogą mieć dataSheetUrl z mapowania)
                                    let currentPositions = offerPositions;
                                    const matchedOffer = localOfferFiles.find(f => getOfferLabel(f) === fields.offerNumber);
                                    if (matchedOffer?.documentId) {
                                        const r = await fetch(`${API_URL}/documents/${matchedOffer.documentId}/parsed-positions`, { headers: authHeaders }).catch(() => null);
                                        if (r?.ok) {
                                            const fresh = await r.json().catch(() => null);
                                            if (Array.isArray(fresh) && fresh.length > 0) { currentPositions = fresh; setOfferPositions(fresh); }
                                        }
                                    }
                                    const pos = currentPositions.find(p => String(p.lp) === lpStr);
                                    if (!pos) return;
                                    const updates = {};
                                    const newF = { ...fields };
                                    if (pos.manufacturer) { updates.manufacturer = pos.manufacturer; newF.manufacturer = pos.manufacturer; }
                                    if (pos.model) { updates.model = pos.model; newF.model = pos.model; }
                                    if (pos.description) { updates.productName = pos.description; newF.productName = pos.description; }
                                    if (pos.priceNetto != null) { updates.priceNetto = parseFloat(pos.priceNetto); newF.priceNetto = String(pos.priceNetto); }
                                    setFields(newF);
                                    // 1. Karta katalogowa zapisana bezpośrednio w pozycji oferty (z modalu przypisania)
                                    if (pos.dataSheetUrl) {
                                        updates.dataSheetUrl = pos.dataSheetUrl;
                                        updates.dataSheetName = pos.dataSheetName || 'karta_katalogowa.pdf';
                                    } else {
                                        // 2. Fallback: fuzzy match z bazy materiałów
                                        const freshDbRes = await fetch(`${API_URL}/material-requirements/database`, { headers: authHeaders }).catch(() => null);
                                        const freshDb = freshDbRes?.ok ? await freshDbRes.json() : materialDb;
                                        setMaterialDb(freshDb);
                                        const norm = s => (s || '').toLowerCase().replace(/[\s\-_.]/g, '');
                                        const posModel = norm(pos.model);
                                        const posMfr = norm(pos.manufacturer);
                                        let bestMatch = null, bestScore = 0;
                                        for (const mat of freshDb) {
                                            if (!mat.dataSheetUrl) continue;
                                            const matModel = norm(mat.model);
                                            const matMfr = norm(mat.manufacturer);
                                            let score = 0;
                                            if (posModel && matModel) {
                                                if (matModel === posModel) score = 3;
                                                else if (matModel.includes(posModel) || posModel.includes(matModel)) score = 2;
                                            }
                                            if (score === 0 && posMfr && matMfr && matMfr === posMfr && posModel.length >= 4 && matModel.length >= 4) {
                                                if (matModel.includes(posModel.substring(0, 5)) || posModel.includes(matModel.substring(0, 5))) score = 1;
                                            }
                                            if (score > bestScore) { bestScore = score; bestMatch = mat; }
                                        }
                                        if (bestMatch && bestScore > 0) {
                                            updates.dataSheetUrl = bestMatch.dataSheetUrl;
                                            updates.dataSheetName = bestMatch.dataSheetName || bestMatch.productName;
                                        }
                                    }
                                    if (Object.keys(updates).length) await patchFields(updates);
                                }}
                                disabled={readOnly}
                                className="w-full bg-black/30 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none transition-colors border border-teal-500/30 focus:border-teal-400 cursor-pointer"
                            >
                                <option value="" className="bg-gray-900">— wybierz pozycję z oferty —</option>
                                {offerPositions.map(pos => (
                                    <option key={pos.lp} value={String(pos.lp)} className="bg-gray-900">
                                        {pos.lp}. {pos.description}{pos.manufacturer ? ` · ${pos.manufacturer}` : ''}{pos.model ? ` ${pos.model}` : ''}{pos.priceNetto != null ? ` · ${parseFloat(pos.priceNetto).toFixed(2)} zł` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {/* Karty PDF + Link www */}
                    <div className="flex gap-2 flex-wrap items-start">
                        {[
                            { type: 'datasheet', label: 'Karta katalogowa', name: datasheetName, serveUrl: `${API_URL}/material-requirements/${cardId}/datasheet` },
                            { type: 'compliance', label: 'Karta zgodności', name: complianceName, serveUrl: `${API_URL}/material-requirements/${cardId}/compliance` },
                        ].map(({ type, label, name, serveUrl }) => (
                            <div key={type} className="p-2 rounded-lg border border-white/5 bg-black/20 min-w-[150px]">
                                <p className="text-[9px] uppercase tracking-widest mb-1.5 font-semibold text-gray-500">{label}</p>
                                {name
                                    ? <div className="flex items-center gap-1.5">
                                        <FileText size={10} className="text-teal-400 shrink-0" />
                                        {serveUrl
                                            ? <button
                                                onClick={() => {
                                                    const w = window.open('', '_blank');
                                                    fetch(serveUrl, { headers: authHeaders })
                                                        .then(r => r.ok ? r.blob() : null)
                                                        .then(b => { if (b && w) w.location.href = URL.createObjectURL(b); else w?.close(); })
                                                        .catch(() => w?.close());
                                                }}
                                                className="text-xs text-gray-300 truncate flex-1 max-w-[130px] text-left hover:text-teal-300 transition-colors cursor-pointer"
                                                title="Otwórz podgląd karty katalogowej">
                                                {name}
                                            </button>
                                            : <span className="text-xs text-gray-300 truncate flex-1 max-w-[130px]">{name}</span>
                                        }
                                        {serveUrl && (
                                            <button
                                                onClick={() => {
                                                    const w = window.open('', '_blank');
                                                    fetch(serveUrl, { headers: authHeaders })
                                                        .then(r => r.ok ? r.blob() : null)
                                                        .then(b => { if (b && w) w.location.href = URL.createObjectURL(b); else w?.close(); })
                                                        .catch(() => w?.close());
                                                }}
                                                className="text-gray-500 hover:text-teal-400 transition-colors shrink-0"
                                                title="Otwórz w nowej karcie">
                                                <ExternalLink size={10} />
                                            </button>
                                        )}
                                    </div>
                                    : <span className="text-xs text-gray-600 italic">Brak</span>
                                }
                            </div>
                        ))}
                        {/* Link do strony www */}
                        <div className="p-2 rounded-lg border border-white/5 bg-black/20 min-w-[150px] flex-1">
                            <p className="text-[9px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5">Link do strony</p>
                            <div className="flex gap-1.5 items-center">
                                <input value={fields.link} onChange={e => setF('link', e.target.value)} onBlur={() => saveF('link')}
                                    disabled={readOnly} placeholder="https://..."
                                    className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-teal-300 focus:outline-none focus:border-teal-500 disabled:opacity-40" />
                                {fields.link && (
                                    <a href={fields.link} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 text-xs border border-teal-500/30 transition-all whitespace-nowrap shrink-0">
                                        <Link size={10} /> Otwórz
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Modal dodawania wymagania ─────────────────────────────────────────────────

function AddRequirementModal({ nodeId, versionId, listId, token, onSaved, onClose }) {
    const [form, setForm] = useState(DEFAULT_REQUIREMENT_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setForm(DEFAULT_REQUIREMENT_FORM);
        setError('');
        setSaving(false);
    }, [nodeId, versionId, listId]);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        if (!form.name.trim()) {
            setError('Nazwa wymagania jest wymagana.');
            return;
        }
        if (Number(form.quantity) <= 0) {
            setError('Ilość musi być większa od zera.');
            return;
        }
        setError('');
        setSaving(true);
        const res = await fetch(`${API_URL}/material-requirements`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId, versionId: versionId || null, listId: listId || null, ...form, quantity: Number(form.quantity) }),
        });
        if (res.ok) {
            onSaved(await res.json());
            onClose();
            setForm(DEFAULT_REQUIREMENT_FORM);
        } else {
            setError('Nie udało się zapisać wymagania. Spróbuj ponownie.');
        }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-[520px] max-h-[90vh] overflow-y-auto bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl p-6">
                <h3 className="text-white font-bold mb-5 flex items-center gap-2"><Plus size={16} className="text-blue-400" /> Dodaj wymaganie</h3>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Nazwa wymagania *</label>
                        <input autoFocus value={form.name} onChange={e => set('name', e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                            placeholder="np. Kamera główna, Zasilacz awaryjny"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Typ</label>
                            <select value={form.type} onChange={e => set('type', e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">
                                {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Ilość</label>
                            <input type="number" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Jednostka</label>
                            <select value={form.unit} onChange={e => set('unit', e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">
                                {UNITS.map(u => <option key={u}>{u}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Wymagania techniczne</label>
                        <textarea rows={3} value={form.technicalSpec} onChange={e => set('technicalSpec', e.target.value)}
                            placeholder="Parametry techniczne, normy, certyfikaty..."
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none" />
                    </div>
                </div>
                {error && <p className="text-[11px] text-red-400 px-1 pb-1">{error}</p>}
                <div className="flex justify-end gap-3 mt-5">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-gray-400 hover:text-white text-sm transition-colors">Anuluj</button>
                    <button onClick={handleSave} disabled={!form.name.trim() || saving}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all disabled:opacity-50">
                        {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={14} />}
                        Dodaj
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Modal nowej listy ─────────────────────────────────────────────────────────

function NewListModal({ nodeId, parentListId, token, onCreated, onClose }) {
    const parentVersion = parentListId ? null : null; // only used for name suggestion
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true);
        let res;
        if (parentListId) {
            res = await fetch(`${API_URL}/material-requirements/lists/${parentListId}/new-version`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            });
        } else {
            res = await fetch(`${API_URL}/material-requirements/lists`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodeId, name: name.trim() }),
            });
        }
        if (res.ok) { onCreated(await res.json()); onClose(); }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-[420px] bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl p-6">
                <h3 className="text-white font-bold mb-5 flex items-center gap-2">
                    <Copy size={16} className="text-blue-400" />
                    {parentListId ? 'Nowa wersja listy' : 'Nowa lista'}
                </h3>
                {parentListId && (
                    <p className="text-xs text-gray-400 mb-4">Nowa lista odziedziczy wszystkie pozycje z bieżącej listy (ze statusem „Oczekuje").</p>
                )}
                <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Nazwa listy *</label>
                    <input autoFocus value={name} onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                        placeholder="np. Lista wymagań v2"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="flex justify-end gap-3 mt-5">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-gray-400 hover:text-white text-sm transition-colors">Anuluj</button>
                    <button onClick={handleSave} disabled={!name.trim() || saving}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all disabled:opacity-50">
                        {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={14} />}
                        Utwórz
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Excel export ──────────────────────────────────────────────────────────────

async function exportToExcel(listName, listVersion, requirements) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Wymagania');

    // Szerokości kolumn
    ws.columns = [
        { width: 5 }, { width: 40 }, { width: 12 }, { width: 8 },
        { width: 6 }, { width: 14 }, { width: 30 }, { width: 20 }, { width: 18 },
    ];

    // Nagłówek
    ws.addRow([`Lista Wymagań Materiałowych — ${listName}  (v${listVersion})`]);
    ws.addRow([`Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}`, '', '', '', '', `Pozycji: ${requirements.length}`]);
    ws.addRow([]);

    // Nagłówki kolumn
    ws.addRow(['Lp.', 'Nazwa', 'Typ', 'Ilość', 'Jedn.', 'Status', 'Produkt', 'Producent', 'Model']);

    requirements.forEach((r, i) => {
        const selected = (r.proposals || []).find(p => p.isSelected);
        const mat = r.material;
        ws.addRow([
            i + 1,
            r.name || '',
            TYPE_META[r.type]?.label || r.type,
            r.quantity,
            r.unit,
            STATUS_META[r.status]?.label || r.status,
            mat?.productName || selected?.productName || r.productName || '—',
            mat?.manufacturer || r.manufacturer || '—',
            mat?.model || r.model || '—',
        ]);

        if (r.technicalSpec) {
            r.technicalSpec.split('\n').map(s => s.trim()).filter(Boolean).forEach(spec => {
                ws.addRow(['', `  ↳ ${spec}`]);
            });
        }
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${listName}_v${listVersion}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── PDF export ────────────────────────────────────────────────────────────────

function exportToPdf(listName, listVersion, requirements) {
    const rows = requirements.map(r => {
        const selected = (r.proposals || []).find(p => p.isSelected);
        const mat = r.material;
        const product = mat?.productName || selected?.productName || r.productName || '—';
        const manufacturer = mat?.manufacturer || r.manufacturer || '—';
        const model = mat?.model || r.model || '—';
        const statusLabel = STATUS_META[r.status]?.label || r.status;
        return `
            <tr>
                <td>${r.name || ''}</td>
                <td>${TYPE_META[r.type]?.label || r.type}</td>
                <td style="text-align:center">${r.quantity} ${r.unit}</td>
                <td>${product}</td>
                <td>${manufacturer}</td>
                <td>${model}</td>
                <td style="text-align:center">${statusLabel}</td>
            </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>${listName} — Lista Wymagań Materiałowych</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 20px; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  .meta { font-size: 10px; color: #666; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #1a1a2e; color: white; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  @media print { body { margin: 10px; } }
</style>
</head>
<body>
<h1>${listName}</h1>
<p class="meta">Wersja ${listVersion} &nbsp;|&nbsp; Wygenerowano: ${new Date().toLocaleDateString('pl-PL')} &nbsp;|&nbsp; Pozycji: ${requirements.length}</p>
<table>
  <thead>
    <tr>
      <th>Nazwa</th><th>Typ</th><th>Ilość</th><th>Produkt</th><th>Producent</th><th>Model</th><th>Status</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
}

// ─── WBS multi-select ──────────────────────────────────────────────────────────

function WbsMultiSelect({ r, wbsProjectItems, subtasks, patchItem, addToWbsTree, removeFromWbsTree, readOnly, open = false, setOpen = () => {} }) {
    const ref = React.useRef(null);
    const items = wbsProjectItems;
    const validIds = React.useMemo(() => new Set(items.map(n => n.id)), [items]);

    const [allocations, setAllocations] = React.useState(() => {
        try {
            const raw = r.wbsNodeAllocations ? JSON.parse(r.wbsNodeAllocations) : {};
            // Odfiltruj alokacje do usuniętych przedmiotów
            const clean = {};
            for (const [k, v] of Object.entries(raw)) { if (validIds.has(k)) clean[k] = v; }
            return clean;
        } catch { return {}; }
    });

    const [selectedIds, setSelectedIds] = React.useState(() => {
        let ids = [];
        if (r.wbsNodeIds) { try { ids = JSON.parse(r.wbsNodeIds); } catch { ids = []; } }
        else if (r.wbsNodeId) { ids = [r.wbsNodeId]; }
        return ids.filter(id => validIds.has(id));
    });

    // Sync z danymi z serwera + czyść stale references do usuniętych przedmiotów
    React.useEffect(() => {
        let ids = [];
        if (r.wbsNodeIds) { try { ids = JSON.parse(r.wbsNodeIds); } catch { ids = []; } }
        else if (r.wbsNodeId) { ids = [r.wbsNodeId]; }
        const cleanIds = ids.filter(id => validIds.has(id));
        setSelectedIds(cleanIds);

        let rawAlloc = {};
        try { rawAlloc = r.wbsNodeAllocations ? JSON.parse(r.wbsNodeAllocations) : {}; } catch {}
        const cleanAlloc = {};
        let stale = false;
        for (const [k, v] of Object.entries(rawAlloc)) {
            if (validIds.has(k)) { cleanAlloc[k] = v; } else { stale = true; }
        }
        if (ids.length !== cleanIds.length) stale = true;
        setAllocations(cleanAlloc);

        // Jeśli wykryto stale references — wyczyść je w bazie
        if (stale) {
            patchItem(r.id, {
                wbsNodeIds: JSON.stringify(cleanIds),
                wbsNodeId: cleanIds[0] || null,
                wbsNodeAllocations: Object.keys(cleanAlloc).length > 0 ? JSON.stringify(cleanAlloc) : null,
            });
        }
    }, [r.wbsNodeIds, r.wbsNodeId, r.wbsNodeAllocations, validIds]);

    const selectedItems = items.filter(n => selectedIds.includes(n.id));

    const updateAllocation = (nodeId, qty) => {
        const numQty = parseFloat(qty) || 0;
        const maxQty = r.quantity || 0;

        // Walidacja: nie więcej niż całkowita ilość materiału
        if (numQty > maxQty) {
            alert(`Nie możesz przypisać więcej niż ${maxQty} ${r.unit || 'szt'} (dostępne: ${maxQty})`);
            return;
        }

        const newAlloc = { ...allocations, [nodeId]: numQty };
        if (newAlloc[nodeId] === 0) delete newAlloc[nodeId];
        setAllocations(newAlloc);
        patchItem(r.id, {
            wbsNodeAllocations: Object.keys(newAlloc).length > 0 ? JSON.stringify(newAlloc) : null,
            isAiAssigned: false
        });
    };

    const toggle = (nodeId) => {
        const isCurrentlySelected = selectedIds.includes(nodeId);
        const next = isCurrentlySelected
            ? selectedIds.filter(id => id !== nodeId)
            : [...selectedIds, nodeId];

        const newAlloc = { ...allocations };
        const maxQty = Number(r.quantity) || 0;
        if (isCurrentlySelected) {
            delete newAlloc[nodeId];
            // Jeśli zostaje jedno przypisanie — przypisz całą ilość automatycznie
            if (next.length === 1) {
                newAlloc[next[0]] = maxQty;
            }
        } else {
            const usedQty = Object.values(newAlloc).reduce((s, v) => s + (Number(v) || 0), 0);
            const remaining = maxQty - usedQty;
            if (remaining <= 0) {
                alert(`Cała ilość (${maxQty} ${r.unit || 'szt'}) jest już przypisana. Zmniejsz alokację w innym przedmiocie.`);
                return;
            }
            // Jedno przypisanie — pełna ilość; nowe dodane — reszta
            newAlloc[nodeId] = next.length === 1 ? maxQty : remaining;
        }

        // Natychmiastowa aktualizacja lokalnego stanu
        setSelectedIds(next);
        setAllocations(newAlloc);

        patchItem(r.id, {
            wbsNodeIds: JSON.stringify(next),
            wbsNodeId: next[0] || null,
            wbsNodeAllocations: Object.keys(newAlloc).length > 0 ? JSON.stringify(newAlloc) : null,
            isAiAssigned: false
        });

        if (!isCurrentlySelected) {
            addToWbsTree(nodeId, r.productName || r.name, r.type);
        } else {
            removeFromWbsTree?.(nodeId, r.id, r.productName || r.name);
        }
    };

    React.useEffect(() => {
        if (!open) return;
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [open, setOpen]);

    if (readOnly) {
        return <span className="text-sm text-blue-300 px-2">
            {selectedItems.length === 0 ? '—' : selectedItems.map(n => `${n.name}: ${allocations[n.id] || r.quantity || '?'}`).join(', ')}
        </span>;
    }

    return (
        <div ref={ref} className="relative w-full">
            <div
                onClick={() => setOpen(v => !v)}
                className="min-h-[34px] w-full border border-white/5 hover:border-white/20 rounded px-2 py-1 cursor-pointer flex flex-wrap gap-1 items-center transition-colors"
            >
                {selectedItems.length === 0
                    ? <span className="text-gray-500 text-xs">— Nieprzypisane —</span>
                    : selectedItems.map(n => {
                        const alloc = allocations[n.id];
                        return (
                            <span key={n.id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs leading-none ${
                                alloc ? 'bg-blue-500/20 text-blue-300' : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                            }`}>
                                {n.name} ({alloc || '⚠'})
                                <button
                                    onClick={e => { e.stopPropagation(); toggle(n.id); }}
                                    className="hover:text-white ml-0.5"
                                >×</button>
                            </span>
                        );
                    })
                }
            </div>
            {open && (
                <div onClick={e => e.stopPropagation()} className="absolute z-[200] top-full left-0 mt-1 w-80 bg-gray-900 border border-white/10 rounded-lg shadow-xl p-1 max-h-[calc(100vh-200px)] overflow-y-auto">
                    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer border-b border-white/5 mb-1">
                        <input type="checkbox" checked={selectedIds.length === 0} onChange={() => { setSelectedIds([]); setAllocations({}); patchItem(r.id, { wbsNodeIds: '[]', wbsNodeId: null, wbsNodeAllocations: null, isAiAssigned: false }); }} className="accent-blue-500" />
                        <span className="text-xs text-gray-400">— Nieprzypisane —</span>
                    </label>
                    {items.map(n => (
                        <div key={n.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded border-b border-white/5 last:border-b-0">
                            <input type="checkbox" checked={selectedIds.includes(n.id)} onChange={(e) => { e.stopPropagation(); toggle(n.id); }} className="accent-blue-500" />
                            <span className="text-sm text-gray-200 flex-1">{n.name}</span>
                            {selectedIds.includes(n.id) && (
                                <input
                                    type="number"
                                    min="0"
                                    max={r.quantity || undefined}
                                    step="0.5"
                                    value={allocations[n.id] || ''}
                                    onChange={(e) => { e.stopPropagation(); updateAllocation(n.id, e.target.value); }}
                                    onClick={e => e.stopPropagation()}
                                    onBlur={e => e.stopPropagation()}
                                    placeholder={`maks: ${r.quantity || '?'}`}
                                    title={`Maksymalnie ${r.quantity} ${r.unit || 'szt'}`}
                                    className="w-20 px-2 py-0.5 bg-gray-800 border border-gray-600 rounded text-xs text-white text-right focus:outline-none focus:border-blue-500"
                                />
                            )}
                        </div>
                    ))}
                    {items.length === 0 && <p className="text-xs text-gray-500 px-2 py-1">Brak przedmiotów WBS</p>}
                </div>
            )}
        </div>
    );
}

// ─── Główny panel ──────────────────────────────────────────────────────────────

const MaterialRequirementsPanel = forwardRef(function MaterialRequirementsPanel({ nodeId, versionId, readOnly = false, readOnlyWbs = false, externalFilters = null, initialExpandedId = null, onWbsUpdate = null, searchQuery = '', refreshKey = 0, isEmbedded = false }, ref) {
    const [lists, setLists] = useState([]);
    const [activeListId, setActiveListId] = useState(null);
    const [requirements, setRequirements] = useState([]);
    const [subtasks, setSubtasks] = useState([]);
    const [wbsProjectItems, setWbsProjectItems] = useState([]); // [{id, name, materiałyId}]
    const [loading, setLoading] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addModalKey, setAddModalKey] = useState(0);
    const [showNewListModal, setShowNewListModal] = useState(false);
    const [newListIsVersion, setNewListIsVersion] = useState(false);
    const [expandedId, setExpandedId] = useState(initialExpandedId);
    const [complianceOpen, setComplianceOpen] = useState(() => new Map());
    const toggleCompliance = (reqId) => setComplianceOpen(prev => {
        const m = new Map(prev); m.set(reqId, !m.get(reqId)); return m;
    });
    const [wbsSelectOpen, setWbsSelectOpen] = useState(() => new Map());
    const toggleWbsSelectOpen = (reqId) => setWbsSelectOpen(prev => {
        const m = new Map(prev); m.set(reqId, !m.get(reqId)); return m;
    });
    const [editingListName, setEditingListName] = useState(false);
    const [listNameValue, setListNameValue] = useState('');
    const [offerFiles, setOfferFiles] = useState([]);
    const token = sessionStorage.getItem('token');
    const authHeaders = { Authorization: `Bearer ${token}` };

    const activeList = lists.find(l => l.id === activeListId) || null;
    const isLocked = (activeList?.isLocked ?? false) || readOnly;
    const isWbsLocked = isLocked || readOnlyWbs;

    // ─── Pliki ofert (z zakładki Oferty) ─────────────────────────────────────
    useEffect(() => {
        if (!nodeId) return;
        fetch(`${API_URL}/offers/node/${nodeId}`, { headers: authHeaders })
            .then(r => r.ok ? r.json() : [])
            .then(offers => setOfferFiles(offers.map(o => ({ ...o, parsedPositions: o.positions }))))
            .catch(() => {});
    }, [nodeId]);

    // ─── Ładowanie list ────────────────────────────────────────────────────────
    const fetchLists = useCallback(async () => {
        const res = await fetch(`${API_URL}/material-requirements/lists/node/${nodeId}`, { headers: authHeaders });
        if (res.ok) {
            const data = await res.json();
            setLists(data);
            return data;
        }
        return [];
    }, [nodeId]);

    const fetchRequirements = useCallback(async (listId) => {
        setLoading(true);
        const [r, s, reqRes] = await Promise.all([
            fetch(`${API_URL}/material-requirements/node/${nodeId}${listId ? `?listId=${listId}` : ''}${versionId ? `&versionId=${versionId}` : ''}`, { headers: authHeaders }),
            fetch(`${API_URL}/subtasks/node/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: authHeaders }),
            fetch(`${API_URL}/order-requirements/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: authHeaders }),
        ]);
        if (r.ok) setRequirements(await r.json());
        if (s.ok) setSubtasks(await s.json());
        if (reqRes.ok) {
            try {
                const reqData = await reqRes.json();
                const tree = JSON.parse(reqData.wbsTree || '{}');
                // Filtruj tylko przedmioty projektu: węzły bez typu lub type='product' na root poziomie
                const items = (tree.items || [])
                    .filter(node => !node.type || node.type === 'product')
                    .map(node => {
                        const materiałyChild = (node.children || []).find(c => c.name === 'Materiały');
                        return { id: node.id, name: node.name, materiałyId: materiałyChild?.id };
                    });
                setWbsProjectItems(items);
            } catch { setWbsProjectItems([]); }
        }
        setLoading(false);
    }, [nodeId, versionId]);

    // Na starcie: załaduj listy, jeśli brak — utwórz domyślną
    useEffect(() => {
        if (!nodeId) return;
        (async () => {
            let data = await fetchLists();
            if (data.length === 0) {
                const res = await fetch(`${API_URL}/material-requirements/lists/node/${nodeId}/default`, {
                    method: 'POST', headers: authHeaders,
                });
                if (res.ok) {
                    const created = await res.json();
                    setLists([created]);
                    setActiveListId(created.id);
                    setListNameValue(created.name);
                    fetchRequirements(created.id);
                }
            } else {
                const last = data[data.length - 1];
                setActiveListId(last.id);
                setListNameValue(last.name);
                fetchRequirements(last.id);
            }
        })();
    }, [nodeId, versionId]);

    // Refresh when parent signals a WBS change
    useEffect(() => {
        if (refreshKey > 0 && activeListId) {
            fetchRequirements(activeListId);
        }
    }, [refreshKey]);

    const switchList = (listId) => {
        const list = lists.find(l => l.id === listId);
        setActiveListId(listId);
        setListNameValue(list?.name || '');
        setExpandedId(null);
        fetchRequirements(listId);
    };

    const addToWbsTree = useCallback(async (parentNodeId, requirementName, requirementType) => {
        if (!parentNodeId || !requirementName) return;
        try {
            const res = await fetch(`${API_URL}/order-requirements/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: authHeaders });
            if (!res.ok) return;
            const reqData = await res.json();
            const tree = JSON.parse(reqData.wbsTree || '{}');

            const addChild = (nodes, targetId, child) => {
                return nodes.map(n => {
                    if (n.id === targetId) {
                        return { ...n, children: [...(n.children || []), child] };
                    }
                    return { ...n, children: addChild(n.children || [], targetId, child) };
                });
            };

            // Blokada duplikatów — nie dodawaj jeśli element o tej nazwie już istnieje pod docelowym węzłem
            const childAlreadyExists = (nodes, tId, name) => {
                for (const n of nodes) {
                    if (n.id === tId) return (n.children || []).some(c => c.name === name);
                    if (childAlreadyExists(n.children || [], tId, name)) return true;
                }
                return false;
            };
            if (childAlreadyExists(tree.items || [], parentNodeId, requirementName)) {
                return;
            }

            // Map requirement type to WBS node type
            const typeMap = { DEVICE: 'equipment', MATERIAL: 'material' };
            const nodeType = typeMap[requirementType] || '';

            const newChild = { id: crypto.randomUUID(), name: requirementName, type: nodeType, status: '', owner: '', resources: '', cost: '', tags: [], children: [] };
            const newTree = { ...tree, items: addChild(tree.items || [], parentNodeId, newChild) };
            await fetch(`${API_URL}/order-requirements`, {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodeId, versionId, wbsTree: JSON.stringify(newTree) }),
            });
            onWbsUpdate?.();
        } catch (e) {
            // Silently handle errors
        }
    }, [nodeId, versionId, token, onWbsUpdate]);

    const removeFromWbsTree = useCallback(async (parentNodeId, requirementId, requirementName) => {
        try {
            const res = await fetch(`${API_URL}/order-requirements/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: authHeaders });
            if (!res.ok) return;
            const reqData = await res.json();
            const tree = JSON.parse(reqData.wbsTree || '{}');

            const deleteNodeFromParent = (nodes, parentId, nodeName) => {
                return nodes.map(n => {
                    if (n.id === parentId) {
                        return { ...n, children: (n.children || []).filter(c => c.name !== nodeName) };
                    }
                    return { ...n, children: deleteNodeFromParent(n.children || [], parentId, nodeName) };
                });
            };

            const newTree = { ...tree, items: deleteNodeFromParent(tree.items || [], parentNodeId, requirementName) };
            await fetch(`${API_URL}/order-requirements`, {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodeId, versionId, wbsTree: JSON.stringify(newTree) }),
            });
            onWbsUpdate?.();
        } catch (e) {
            // Silently handle errors
        }
    }, [nodeId, versionId, token, onWbsUpdate]);

    const syncUnifiedRefresh = useCallback(() => {
        onWbsUpdate?.();
    }, [onWbsUpdate]);

    const patchItem = useCallback(async (id, data) => {
        const res = await fetch(`${API_URL}/material-requirements/${id}`, {
            method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
        if (res.ok) {
            const updated = await res.json();
            setRequirements(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
            // Odśwież Unified gdy zmienią się alokacje lub ilość/cena materiałów
            if (data.wbsNodeAllocations !== undefined || data.quantity !== undefined || data.priceNetto !== undefined) {
                setTimeout(() => syncUnifiedRefresh(), 100);
            }
        }
    }, [token, syncUnifiedRefresh]);

    const handleExtract = async () => {
        setExtracting(true);
        const params = new URLSearchParams();
        if (versionId) params.append('versionId', versionId);
        if (activeListId) params.append('listId', activeListId);
        const res = await fetch(`${API_URL}/material-requirements/extract/${nodeId}?${params}`, { method: 'POST', headers: authHeaders });
        if (res.ok) {
            const data = await res.json();
            if (data.extracted === 0 && (!data.items || data.items.length === 0)) {
                alert('Zaimportuj najpierw pliki wsadowe');
            } else {
                await fetchRequirements(activeListId);
            }
        }
        setExtracting(false);
    };

    useImperativeHandle(ref, () => ({
        handleAddRequirement: () => {
            setAddModalKey(k => k + 1);
            setShowAddModal(true);
        },
        handleExtract,
    }), [handleExtract]);

    const syncUnifiedDebounceRef = useRef(null);
    const debouncedUnifiedSync = useCallback(() => {
        if (syncUnifiedDebounceRef.current) clearTimeout(syncUnifiedDebounceRef.current);
        syncUnifiedDebounceRef.current = setTimeout(() => syncUnifiedRefresh(), 300);
    }, [syncUnifiedRefresh]);

    const handleUpdated = useCallback((updated) => {
        if (!updated) {
            fetchRequirements(activeListId);
            // Po przeładowaniu (np. wybór propozycji) odśwież Unified.
            debouncedUnifiedSync();
            return;
        }
        setRequirements(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
        // Odśwież Unified gdy zmieni się cena lub ilość materiału.
        if (updated.priceNetto !== undefined || updated.quantity !== undefined) {
            debouncedUnifiedSync();
        }
    }, [fetchRequirements, activeListId, debouncedUnifiedSync]);

    const handleDeleted = useCallback(async (id) => {
        // Find requirement to clean up WBS and budget before deleting
        const req = requirements.find(r => r.id === id);
        const wbsIds = req?.wbsNodeIds ? (typeof req.wbsNodeIds === 'string' ? JSON.parse(req.wbsNodeIds) : req.wbsNodeIds) : [];

        await fetch(`${API_URL}/material-requirements/${id}`, { method: 'DELETE', headers: authHeaders });
        setRequirements(prev => prev.filter(r => r.id !== id));
        setExpandedId(p => p === id ? null : p);

        // Remove from WBS tree for each assigned node
        if (wbsIds.length > 0 && req?.name) {
            for (const wbsNodeId of wbsIds) {
                await removeFromWbsTree(wbsNodeId, id, req.name).catch(() => {});
            }
        }
        // Odśwież Unified po usunięciu.
        syncUnifiedRefresh();
        onWbsUpdate?.();
    }, [requirements, removeFromWbsTree, syncUnifiedRefresh, onWbsUpdate]);

    const handleDeleteAll = useCallback(async () => {
        if (!window.confirm(`Usunąć wszystkie ${requirements.length} wymagań?`)) return;
        await fetch(`${API_URL}/material-requirements/node/${nodeId}/all`, { method: 'DELETE', headers: authHeaders });
        setRequirements([]);
        setExpandedId(null);
        // Odśwież Unified po usunięciu wszystkich.
        syncUnifiedRefresh();
        onWbsUpdate?.();
    }, [nodeId, requirements.length, syncUnifiedRefresh, onWbsUpdate]);

    // ─── Zatwierdzenie listy ───────────────────────────────────────────────────
    const handleLockList = async () => {
        if (!activeListId) return;
        if (!window.confirm('Zatwierdzić listę? Po zatwierdzeniu edycja nie będzie możliwa.')) return;
        const res = await fetch(`${API_URL}/material-requirements/lists/${activeListId}/lock`, {
            method: 'POST', headers: authHeaders,
        });
        if (res.ok) {
            setLists(prev => prev.map(l => l.id === activeListId ? { ...l, isLocked: true } : l));
        }
    };

    const handleDeleteList = async (listId) => {
        if (!listId) return;
        const list = lists.find(l => l.id === listId);
        if (!window.confirm(`Usunąć listę "${list?.name}"? Operacja usunie wszystkie wymagania z tej listy.`)) return;
        const res = await fetch(`${API_URL}/material-requirements/lists/${listId}`, {
            method: 'DELETE', headers: authHeaders,
        });
        if (res.ok) {
            const remaining = lists.filter(l => l.id !== listId);
            setLists(remaining);
            if (activeListId === listId) {
                const next = remaining[remaining.length - 1];
                setActiveListId(next?.id || null);
            }
        } else {
            const err = await res.json().catch(() => ({}));
            alert(err.message || 'Błąd usuwania listy');
        }
    };

    // ─── Zmiana nazwy listy ────────────────────────────────────────────────────
    const handleRenameList = async () => {
        if (!activeListId || !listNameValue.trim()) { setEditingListName(false); return; }
        await fetch(`${API_URL}/material-requirements/lists/${activeListId}`, {
            method: 'PATCH',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: listNameValue.trim() }),
        });
        setLists(prev => prev.map(l => l.id === activeListId ? { ...l, name: listNameValue.trim() } : l));
        setEditingListName(false);
    };

    // ─── Nowa lista po zatwierdzeniu ───────────────────────────────────────────
    const handleNewListCreated = async (newList) => {
        const updatedLists = await fetchLists();
        setLists(updatedLists);
        setActiveListId(newList.id);
        setListNameValue(newList.name);
        setExpandedId(null);
        fetchRequirements(newList.id);
    };

    // ─── Czy można zatwierdzić ─────────────────────────────────────────────────
    const allConfirmed = requirements.length > 0 && requirements.every(r => r.status === 'CONFIRMED');

    // ─── Drag & drop kolumn ─────────────────────────────────────────────────
    const STORAGE_KEY = 'matreq-col-order';
    const DRAGGABLE_IDS = ['type', 'name', 'quantity', 'netPrice', 'product', 'wbs', 'status'];

    const [columnOrder, setColumnOrder] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length === DRAGGABLE_IDS.length && DRAGGABLE_IDS.every(id => parsed.includes(id)))
                    return parsed;
            }
        } catch {}
        return DRAGGABLE_IDS;
    });
    const dragCol = useRef(null);
    const dragOverCol = useRef(null);
    const expandedRowRef = useRef(null);

    // Scroll to initially expanded requirement
    useEffect(() => {
        if (!initialExpandedId) return;
        const timer = setTimeout(() => {
            if (expandedRowRef.current) {
                expandedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [initialExpandedId]);

    const handleDragStart = (colId) => { dragCol.current = colId; };
    const handleDragOver = (e, colId) => { e.preventDefault(); dragOverCol.current = colId; };
    const handleDrop = () => {
        if (!dragCol.current || !dragOverCol.current || dragCol.current === dragOverCol.current) return;
        setColumnOrder(prev => {
            const next = [...prev];
            const from = next.indexOf(dragCol.current);
            const to = next.indexOf(dragOverCol.current);
            next.splice(from, 1);
            next.splice(to, 0, dragCol.current);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
        dragCol.current = null;
        dragOverCol.current = null;
    };

    const allColumnDefs = {
        type: {
            id: 'type', accessorKey: 'type', size: 130, enableSorting: true,
            header: () => <span>Typ</span>,
            cell: ({ row }) => (
                <EditableSelect
                    value={row.original.type}
                    options={Object.entries(TYPE_META).map(([k, v]) => [k, v.label])}
                    onSave={v => patchItem(row.original.id, { type: v })}
                    renderValue={v => <TypeBadge type={v} />}
                    readOnly={isLocked}
                />
            ),
        },
        name: {
            id: 'name', accessorKey: 'name', enableSorting: true,
            header: () => <span>Nazwa Wymagania</span>,
            cell: ({ row }) => {
                const r = row.original;
                const displayName = r.name || '';
                return (
                    <div className="flex flex-col min-w-0">
                        <EditableText value={displayName} onSave={v => patchItem(r.id, { name: v })}
                            className="text-white text-sm font-medium" readOnly={isLocked} />
                        {r.sourceDocument && (
                            <span className="text-xs text-gray-600 truncate max-w-[300px] pl-1">📄 {r.sourceDocument}</span>
                        )}
                    </div>
                );
            },
        },
        quantity: {
            id: 'quantity', accessorKey: 'quantity', size: 110, enableSorting: true,
            header: () => <span>Ilość</span>,
            cell: ({ row }) => (
                <div className="flex items-center gap-1.5">
                    <EditableNumber value={row.original.quantity} onSave={v => patchItem(row.original.id, { quantity: v })} readOnly={isLocked} />
                    <EditableSelect
                        value={row.original.unit}
                        options={UNITS.map(u => [u, u])}
                        onSave={v => patchItem(row.original.id, { unit: v })}
                        renderValue={v => <span className="text-gray-400 text-sm">{v}</span>}
                        readOnly={isLocked}
                    />
                </div>
            ),
        },
        netPrice: {
            id: 'netPrice',
            size: 150,
            enableSorting: true,
            accessorFn: r => (r.status === 'CONFIRMED' ? (r.priceNetto ?? null) : null),
            header: () => <span>Cena netto / szt.</span>,
            cell: ({ row }) => {
                const r = row.original;
                if (r.status !== 'CONFIRMED' || r.priceNetto == null) {
                    return <span className="text-xs text-gray-600">—</span>;
                }
                return (
                    <span className="text-sm text-emerald-300 font-mono">
                        {Number(r.priceNetto).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                );
            },
        },
        product: {
            id: 'product', size: 200, enableSorting: true,
            accessorFn: r => r.material?.productName || r.productName || r.manufacturer || '',
            header: () => <span>Produkt</span>,
            cell: ({ row }) => {
                const r = row.original;
                const mat = r.material; // powiązany materiał z bazy
                const selected = (r.proposals || []).find(p => p.isSelected);
                // Dane produktu: priorytet material (z bazy) > selected proposal > requirement's own fields
                const prodName = mat?.productName || selected?.productName || r.productName || '';
                const mfr = mat?.manufacturer || selected?.manufacturer || r.manufacturer || '';
                const mdl = mat?.model || selected?.model || r.model || '';
                const isLinked = !!r.materialId;
                return (
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1">
                            {isLinked
                                ? <span className="text-white text-sm">{prodName || '—'}</span>
                                : <EditableText value={prodName} onSave={v => patchItem(r.id, { productName: v })}
                                    className="text-white text-sm" placeholder="—" readOnly={isLocked} />
                            }
                            {isLinked && <span className="text-[10px] text-cyan-400 px-1.5 py-0.5 bg-cyan-500/10 rounded border border-cyan-500/20 whitespace-nowrap">Z bazy</span>}
                        </div>
                        <div className="flex items-center gap-1.5 pl-1">
                            {isLinked
                                ? <span className="text-gray-400 text-xs">{mfr || 'Producent'}</span>
                                : <EditableText value={mfr} onSave={v => patchItem(r.id, { manufacturer: v })}
                                    className="text-gray-400 text-xs" placeholder="Producent" readOnly={isLocked} />
                            }
                            {mdl && <span className="text-gray-600 text-xs">·</span>}
                            {isLinked
                                ? <span className="text-gray-400 text-xs">{mdl}</span>
                                : <EditableText value={mdl} onSave={v => patchItem(r.id, { model: v })}
                                    className="text-gray-400 text-xs" placeholder="Model" readOnly={isLocked} />
                            }
                        </div>
                    </div>
                );
            },
        },
        wbs: {
            id: 'wbs', size: 220,
            header: () => <span>Przedmiot Projektu</span>,
            cell: ({ row }) => (
                <WbsMultiSelect
                    r={row.original}
                    wbsProjectItems={wbsProjectItems}
                    subtasks={subtasks}
                    patchItem={patchItem}
                    addToWbsTree={addToWbsTree}
                    removeFromWbsTree={removeFromWbsTree}
                    readOnly={isWbsLocked}
                    open={wbsSelectOpen.get(row.original.id) || false}
                    setOpen={(value) => setWbsSelectOpen(prev => {
                        const m = new Map(prev);
                        m.set(row.original.id, typeof value === 'function' ? value(m.get(row.original.id) || false) : value);
                        return m;
                    })}
                />
            ),
        },
        status: {
            id: 'status', accessorKey: 'status', size: 140, enableSorting: true,
            header: () => <span>Status</span>,
            cell: ({ row }) => {
                const r = row.original;
                if (isLocked) return <StatusBadge status={r.status} />;
                return (
                    <select value={r.status} onChange={e => patchItem(r.id, { status: e.target.value })}
                        className={`w-full border rounded px-2 py-2 text-sm font-semibold focus:outline-none cursor-pointer transition-colors ${STATUS_META[r.status]?.color || ''} bg-transparent border-current/20`}>
                        {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k} className="bg-gray-900 text-white">{v.label}</option>)}
                    </select>
                );
            },
        },
    };

    const columns = [
        {
            id: 'expander', size: 36, header: '',
            cell: ({ row }) => (
                <button onClick={() => setExpandedId(p => p === row.original.id ? null : row.original.id)}
                    className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white transition-colors">
                    {expandedId === row.original.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            ),
        },
        ...columnOrder.map(id => allColumnDefs[id]),
        {
            id: 'delete', size: 40, header: '',
            cell: ({ row }) => !(isLocked || readOnlyWbs) && (
                <button onClick={() => handleDeleted(row.original.id)} title="Usuń wymaganie"
                    className="w-6 h-6 flex items-center justify-center text-red-800 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                </button>
            ),
        },
    ];

    const [sorting, setSorting] = useState([]);
    const [internalGlobalFilter, setInternalGlobalFilter] = useState('');
    const [internalTypeFilter, setInternalTypeFilter] = useState('');
    const [internalStatusFilter, setInternalStatusFilter] = useState('');

    // Sync searchQuery prop to internal filter state
    useEffect(() => {
        if (searchQuery) {
            setInternalGlobalFilter(searchQuery);
        }
    }, [searchQuery]);

    const globalFilter   = searchQuery || (externalFilters ? externalFilters.global   : internalGlobalFilter);
    const typeFilter     = externalFilters ? externalFilters.type     : internalTypeFilter;
    const statusFilter   = externalFilters ? externalFilters.status   : internalStatusFilter;
    const setGlobalFilter  = externalFilters ? externalFilters.setGlobal  : setInternalGlobalFilter;
    const setTypeFilter    = externalFilters ? externalFilters.setType    : setInternalTypeFilter;
    const setStatusFilter  = externalFilters ? externalFilters.setStatus  : setInternalStatusFilter;

    const filteredData = React.useMemo(() => {
        let data = requirements;
        if (typeFilter) data = data.filter(r => r.type === typeFilter);
        if (statusFilter) data = data.filter(r => r.status === statusFilter);
        // Apply global search filter
        if (globalFilter) {
            const q = globalFilter.toLowerCase();
            data = data.filter(r => {
                const mat = r.material;
                const selected = (r.proposals || []).find(p => p.isSelected);
                const fields = [
                    r.name, r.productName, r.manufacturer, r.model,
                    r.technicalSpec, r.sourceDocument, r.seller, r.offerNumber, r.availability,
                    mat?.productName, mat?.manufacturer, mat?.model,
                    selected?.productName, selected?.manufacturer, selected?.model,
                    TYPE_META[r.type]?.label, STATUS_META[r.status]?.label,
                    r.unit, r.quantity != null ? String(r.quantity) : '',
                    r.priceNetto != null ? String(r.priceNetto) : '',
                ];
                return fields.some(f => f && f.toLowerCase().includes(q));
            });
        }
        return data;
    }, [requirements, typeFilter, statusFilter, globalFilter]);

    // Filtrowanie globalne po wszystkich polach tekstowych
    const globalFilterFn = React.useCallback((row, _columnId, filterValue) => {
        if (!filterValue) return true;
        const q = filterValue.toLowerCase();
        const r = row.original;
        const mat = r.material;
        const selected = (r.proposals || []).find(p => p.isSelected);
        const fields = [
            r.name, r.productName, r.manufacturer, r.model,
            r.technicalSpec, r.sourceDocument, r.seller, r.offerNumber, r.availability,
            mat?.productName, mat?.manufacturer, mat?.model,
            selected?.productName, selected?.manufacturer, selected?.model,
            TYPE_META[r.type]?.label, STATUS_META[r.status]?.label,
            r.unit, r.quantity != null ? String(r.quantity) : '',
            r.priceNetto != null ? String(r.priceNetto) : '',
        ];
        return fields.some(f => f && f.toLowerCase().includes(q));
    }, []);

    const table = useReactTable({
        data: filteredData, columns,
        state: { sorting, globalFilter },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        globalFilterFn,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
    });

    const pending = requirements.filter(r => r.status === 'PENDING').length;
    const confirmed = requirements.filter(r => r.status === 'CONFIRMED').length;

    const content = (
        <>
            {/* Hint o nazewnictwie plików ofert */}
            {readOnlyWbs && (
                <div className="flex items-center gap-2 px-6 py-2 bg-teal-500/5 border-b border-teal-500/10">
                    <FileText size={11} className="text-teal-400 shrink-0" />
                    <span className="text-[10px] text-teal-300/70">Pliki ofert uploaduj w zakładce <strong className="text-teal-300">Pliki finansowe</strong> — nazwa pliku: <code className="bg-black/30 px-1 rounded text-teal-200">Oferta_NazwaSprzedawcy_NumerOferty.pdf</code></span>
                </div>
            )}
            {/* Wiersz: taby list + przyciski akcji aktywnej listy */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-white/5 overflow-x-auto flex-shrink-0">
                {/* Taby list */}
                {lists.map(l => {
                    const fmtDate = d => d ? new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
                    const info = l.isLocked
                        ? `Zatwierdzona${l.lockedBy ? ' przez ' + l.lockedBy : ''}${l.lockedAt ? ' · ' + fmtDate(l.lockedAt) : ''}`
                        : `Otwarta${l.createdBy ? ' przez ' + l.createdBy : ''}${l.createdAt ? ' · ' + fmtDate(l.createdAt) : ''}`;
                    return (
                        <div key={l.id} className={`flex items-center rounded-lg flex-shrink-0 ${l.id === activeListId ? 'bg-white/10 border border-white/15' : 'hover:bg-white/5'}`}>
                            <button onClick={() => switchList(l.id)} title={info}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${l.id === activeListId ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                                {l.isLocked && <Lock size={9} className="text-amber-400 shrink-0" />}
                                v{l.version} · {l.name}
                            </button>
                            {!l.isLocked && !readOnly && (
                                <button onClick={() => handleDeleteList(l.id)} title="Usuń listę"
                                    className="pr-2 pl-0.5 py-1.5 text-gray-600 hover:text-red-400 transition-colors">
                                    <X size={10} />
                                </button>
                            )}
                        </div>
                    );
                })}

                <div className="flex-1 min-w-2" />

                {/* Akcje kontekstowe aktywnej listy */}
                {requirements.length > 0 && (<>
                    <button onClick={() => exportToExcel(activeList?.name || 'Lista', activeList?.version || 1, requirements)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-600/10 hover:bg-green-600/20 text-green-300 text-xs font-semibold transition-all flex-shrink-0">
                        <FileDown size={11} /> Excel
                    </button>
                </>)}
                {allConfirmed && !isLocked && (
                    <button onClick={handleLockList}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/30 text-green-300 text-xs font-semibold transition-all border border-green-500/30 flex-shrink-0">
                        <Lock size={11} /> Zatwierdź listę
                    </button>
                )}
                {isLocked && !readOnly && (
                    <button onClick={() => { setNewListIsVersion(true); setShowNewListModal(true); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold transition-all flex-shrink-0">
                        <Copy size={11} /> Dodaj nową listę
                    </button>
                )}
                {!isLocked && (<>
                    {requirements.length > 0 && (
                        <button onClick={handleDeleteAll}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 text-xs font-semibold transition-all flex-shrink-0">
                            <Trash2 size={11} /> Usuń wszystkie
                        </button>
                    )}
                    <button onClick={() => { setAddModalKey(k => k + 1); setShowAddModal(true); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold transition-all flex-shrink-0">
                        <Plus size={11} /> Dodaj wymaganie
                    </button>
                    <button onClick={handleExtract} disabled={extracting}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold transition-all disabled:opacity-50 flex-shrink-0">
                        {extracting ? <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> : <Sparkles size={11} />}
                        Wyciągnij z dokumentów
                    </button>
                </>)}
            </div>

            {/* Tabela */}
            {loading ? (
                <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" /></div>
            ) : requirements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                    <AlertCircle size={28} className="text-gray-600" />
                    <p className="text-sm">Brak wymagań materiałowych</p>
                    {!isLocked && <p className="text-xs text-gray-600">Kliknij „Wyciągnij z dokumentów" lub „Dodaj wymaganie"</p>}
                </div>
            ) : (<>
                {/* Pasek filtrów — ukryty gdy filtry w nagłówku sekcji */}
                {!externalFilters && <div className="flex items-center gap-3 px-6 py-2 border-b border-white/5">
                    <div className="flex items-center gap-1.5">
                        <Filter size={11} className="text-gray-600" />
                        <input value={globalFilter} onChange={e => setGlobalFilter(e.target.value)}
                            placeholder="Szukaj..."
                            className="bg-black/30 border border-white/5 rounded px-2 py-1 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 w-40" />
                    </div>
                </div>}
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full">
                        <thead className="sticky top-0 z-10 bg-gray-950">
                            {table.getHeaderGroups().map(hg => (
                                <tr key={hg.id} className="border-b border-white/10 bg-black/40">
                                    {hg.headers.map(h => {
                                        const isDraggable = DRAGGABLE_IDS.includes(h.column.id) && !isLocked;
                                        const canSort = h.column.getCanSort();
                                        const sorted = h.column.getIsSorted();
                                        return (
                                            <th key={h.id} style={{ width: h.column.columnDef.size }}
                                                draggable={isDraggable}
                                                onDragStart={isDraggable ? () => handleDragStart(h.column.id) : undefined}
                                                onDragOver={isDraggable ? (e) => handleDragOver(e, h.column.id) : undefined}
                                                onDrop={isDraggable ? handleDrop : undefined}
                                                onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                                                className={`px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold select-none bg-black/40 ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''} ${canSort ? 'cursor-pointer hover:text-gray-300' : ''}`}>
                                                <span className="flex items-center gap-1">
                                                    {isDraggable && <GripVertical size={9} className="text-gray-700 shrink-0" />}
                                                    {flexRender(h.column.columnDef.header, h.getContext())}
                                                    {canSort && (sorted === 'asc' ? <ArrowUp size={9} className="text-blue-400" /> : sorted === 'desc' ? <ArrowDown size={9} className="text-blue-400" /> : <ArrowUpDown size={9} className="text-gray-700" />)}
                                                </span>
                                            </th>
                                        );
                                    })}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows
                                .filter(row => !expandedId || expandedId === row.original.id)
                                .map(row => (
                                <React.Fragment key={row.original.id}>
                                    <tr ref={expandedId === row.original.id ? expandedRowRef : null} className={`border-b border-white/[0.03] transition-colors ${expandedId === row.original.id ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}>
                                        {row.getVisibleCells().map(cell => (
                                            <td key={cell.id} style={{ width: cell.column.columnDef.size }} className="px-2 py-1 align-middle">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                    {expandedId === row.original.id && (
                                        <tr className="bg-white/[0.02]">
                                            <td colSpan={columns.length}>
                                                <ExpandedRow req={row.original} token={token} onUpdated={handleUpdated} onDeleted={handleDeleted} readOnly={isLocked} readOnlyDelete={isLocked || readOnlyWbs} offerFiles={offerFiles} nodeId={nodeId} showCompliance={complianceOpen.get(row.original.id) ?? false} onToggleCompliance={() => toggleCompliance(row.original.id)} />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </>)}

            {showAddModal && (
                <AddRequirementModal key={addModalKey} nodeId={nodeId} versionId={versionId} listId={activeListId} token={token}
                    onSaved={item => setRequirements(prev => [...prev, item])}
                    onClose={() => setShowAddModal(false)} />
            )}

            {showNewListModal && (
                <NewListModal
                    nodeId={nodeId}
                    parentListId={newListIsVersion ? activeListId : null}
                    token={token}
                    onCreated={handleNewListCreated}
                    onClose={() => setShowNewListModal(false)}
                />
            )}
        </>
    );

    if (isEmbedded) {
        return <div className="flex flex-col h-full bg-transparent overflow-hidden">{content}</div>;
    }

    return (
        <section className="glass-panel rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col h-full overflow-hidden">
            {content}
        </section>
    );
});

export default MaterialRequirementsPanel;
