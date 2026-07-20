import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Plus, Package, Lock, RotateCcw, Trash2, Zap, GitBranch } from 'lucide-react';
import { API_URL } from '../../config';
import SupplierPicker from './SupplierPicker';
import ComparisonPanel from './ComparisonPanel';

// @anchor qq-status-styles
const STATUS_STYLES = {
    DRAFT:    { label: 'szkic',        cls: 'text-gray-300 bg-white/5 border-white/10' },
    VERIFIED: { label: 'zweryfikowana', cls: 'text-blue-300 bg-blue-500/10 border-blue-500/25' },
    LOCKED:   { label: 'zablokowana',  cls: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
    BASELINE: { label: 'BASELINE',     cls: 'text-teal-300 bg-teal-500/10 border-teal-500/25' },
    ARCHIVED: { label: 'archiwum',     cls: 'text-gray-500 bg-white/[0.02] border-white/5' },
    EXPIRED:  { label: 'wygasła',      cls: 'text-red-300 bg-red-500/10 border-red-500/25' },
};

// @anchor qq-source-styles
const SOURCE_STYLES = {
    API:    'text-purple-300 bg-purple-500/10 border-purple-500/25',
    STOCK:  'text-teal-300 bg-teal-500/10 border-teal-500/25',
    MANUAL: 'text-gray-300 bg-white/5 border-white/10',
};

const authHeaders = () => ({
    Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
});

// @anchor quick-quotes-section
// Sekcja „Szybkie wyceny" w OffersTab (Logistyka): tabela nagłówków QuickQuote
// + rozwijana edycja pozycji (MANUAL / magazyn / API), przejścia statusów,
// wersjonowanie. Zamrożona wycena (LOCKED) pcha ceny do budżetu wymagań.
export default function QuickQuotesSection({ nodeId, isGlobal = false, searchQuery = '' }) {
    const [quotes, setQuotes] = useState([]);
    const [loading, setLoading] = useState(true);
    // @anchor qq-expanded-id
    const [expandedId, setExpandedId] = useState(null);
    // @anchor qq-detail
    const [detail, setDetail] = useState(null); // pełna wycena z pozycjami (dla expandedId)
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [notice, setNotice] = useState(null); // komunikat operacji (np. wynik from-stock)
    // @anchor qq-requirements
    const [requirements, setRequirements] = useState([]); // żywe wymagania węzła wyceny (dropdown)
    // @anchor qq-new-item
    const emptyItem = { materialRequirementId: '', reqName: '', qtyAtCapture: '', unit: 'szt', priceOriginalNetto: '', currency: 'PLN', supplierId: null };
    const [newItem, setNewItem] = useState(emptyItem);

    const q = searchQuery.trim().toLowerCase();
    const visible = q ? quotes.filter(x => `${x.name} ${x.node?.name || ''}`.toLowerCase().includes(q)) : quotes;

    // @anchor qq-fetch-list
    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const url = isGlobal ? `${API_URL}/quick-quotes` : `${API_URL}/quick-quotes?nodeId=${nodeId}`;
            const res = await fetch(url, { headers: authHeaders() });
            setQuotes(res.ok ? await res.json() : []);
        } catch { setQuotes([]); }
        finally { setLoading(false); }
    }, [nodeId, isGlobal]);

    useEffect(() => { fetchList(); }, [fetchList]);

    // @anchor qq-fetch-detail
    const fetchDetail = useCallback(async (id) => {
        try {
            const res = await fetch(`${API_URL}/quick-quotes/${id}`, { headers: authHeaders() });
            if (!res.ok) return;
            const d = await res.json();
            setDetail(d);
            const reqRes = await fetch(`${API_URL}/material-requirements/node/${d.nodeId}`, { headers: authHeaders() });
            if (reqRes.ok) {
                const all = await reqRes.json();
                setRequirements((Array.isArray(all) ? all : []).filter(r => !r.versionId));
            }
        } catch { /* detail zostaje */ }
    }, []);

    const toggle = (id) => {
        if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
        setExpandedId(id); setDetail(null); setNewItem(emptyItem); setNotice(null);
        fetchDetail(id);
    };

    const refresh = async (id) => { await fetchList(); if (id) await fetchDetail(id); };

    // @anchor qq-create
    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            const res = await fetch(`${API_URL}/quick-quotes`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ nodeId, name: newName.trim() }),
            });
            if (res.ok) { setNewName(''); await fetchList(); }
        } finally { setCreating(false); }
    };

    // @anchor qq-change-status
    const changeStatus = async (id, status) => {
        if (status === 'LOCKED' && !confirm('Zablokować wycenę? Ceny pozycji trafią do budżetu wymagań (QQ), a magazyn zostanie ponownie zweryfikowany.')) return;
        setNotice(null);
        const res = await fetch(`${API_URL}/quick-quotes/${id}/status`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); setNotice({ type: 'error', text: e.message || 'Błąd zmiany statusu' }); }
        await refresh(expandedId === id ? id : null);
    };

    const handleDelete = async (id) => {
        if (!confirm('Usunąć szkic wyceny?')) return;
        await fetch(`${API_URL}/quick-quotes/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (expandedId === id) { setExpandedId(null); setDetail(null); }
        await fetchList();
    };

    // @anchor qq-new-version
    const handleNewVersion = async (id) => {
        const res = await fetch(`${API_URL}/quick-quotes/${id}/new-version`, { method: 'POST', headers: authHeaders() });
        if (res.ok) { const clone = await res.json(); await fetchList(); toggle(clone.id); }
    };

    // @anchor qq-from-stock
    const handleFromStock = async (id) => {
        setNotice(null);
        const res = await fetch(`${API_URL}/quick-quotes/${id}/items/from-stock`, { method: 'POST', headers: authHeaders() });
        if (res.ok) {
            const r = await res.json();
            setNotice({
                type: 'ok',
                text: `Z magazynu: dodano ${r.added}${r.skipped.length ? `, pominięto ${r.skipped.length} (${r.skipped.slice(0, 3).map(s => `${s.name}: ${s.reason}`).join('; ')}${r.skipped.length > 3 ? '…' : ''})` : ''}`,
            });
        } else {
            const e = await res.json().catch(() => ({}));
            setNotice({ type: 'error', text: e.message || 'Błąd pobierania z magazynu' });
        }
        await fetchDetail(id);
    };

    // @anchor qq-add-item
    const handleAddItem = async (id) => {
        const body = {
            materialRequirementId: newItem.materialRequirementId || null,
            reqName: newItem.reqName || null,
            qtyAtCapture: newItem.qtyAtCapture === '' ? null : Number(newItem.qtyAtCapture),
            unit: newItem.unit || null,
            priceOriginalNetto: newItem.priceOriginalNetto === '' ? null : Number(newItem.priceOriginalNetto),
            currency: newItem.currency,
            supplierId: newItem.supplierId,
        };
        const res = await fetch(`${API_URL}/quick-quotes/${id}/items`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
        });
        if (res.ok) { setNewItem(emptyItem); await fetchDetail(id); }
        else { const e = await res.json().catch(() => ({})); setNotice({ type: 'error', text: e.message || 'Błąd dodawania pozycji' }); }
    };

    // @anchor qq-update-item-price — korekta logistyka: edycja efektywnej ceny PLN
    const handlePriceEdit = async (qqId, itemId, value) => {
        const price = value === '' ? null : Number(value);
        await fetch(`${API_URL}/quick-quotes/${qqId}/items/${itemId}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ priceNettoPln: price }),
        });
        await fetchDetail(qqId);
    };

    const handleRemoveItem = async (qqId, itemId) => {
        await fetch(`${API_URL}/quick-quotes/${qqId}/items/${itemId}`, { method: 'DELETE', headers: authHeaders() });
        await fetchDetail(qqId);
    };

    const pickRequirement = (reqId) => {
        const r = requirements.find(x => x.id === reqId);
        setNewItem(n => ({
            ...n,
            materialRequirementId: reqId,
            reqName: r ? (r.name || '') : n.reqName,
            qtyAtCapture: r ? String(r.quantity ?? '') : n.qtyAtCapture,
            unit: r ? (r.unit || 'szt') : n.unit,
        }));
    };

    const sum = (items) => items.reduce((s, i) => s + (i.priceNettoPln != null && i.qtyAtCapture != null ? i.priceNettoPln * i.qtyAtCapture : 0), 0);

    if (loading) return <div className="flex items-center justify-center py-8 text-gray-500 text-sm">Ładowanie…</div>;

    return (
        <div className="p-3 flex flex-col gap-2">
            {/* Nowa wycena */}
            {!isGlobal || nodeId ? (
                <div className="flex gap-2">
                    <input value={newName} onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
                        placeholder="Nazwa nowej wyceny…"
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500" />
                    <button onClick={handleCreate} disabled={creating || !newName.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/15 hover:bg-amber-600/25 text-amber-300 text-[11px] font-semibold border border-amber-500/25 transition-all disabled:opacity-40">
                        <Plus size={12} />Nowa wycena
                    </button>
                </div>
            ) : null}

            {visible.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500 gap-2">
                    <Package size={22} className="opacity-30" />
                    <span className="text-sm">{q ? `Brak wyników dla „${q}"` : 'Brak szybkich wycen'}</span>
                </div>
            )}

            {visible.map(qq => {
                const st = STATUS_STYLES[qq.status] || STATUS_STYLES.DRAFT;
                const isOpen = expandedId === qq.id;
                const d = isOpen ? detail : null;
                const editable = qq.status === 'DRAFT';
                return (
                    <div key={qq.id} className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01]">
                        <div className="flex items-center gap-3 px-4 py-3 select-none">
                            <ChevronDown size={13} className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? '' : '-rotate-90'}`} />
                            <span className="text-sm font-semibold text-gray-200 flex-1 truncate cursor-pointer hover:text-white transition-colors" onClick={() => toggle(qq.id)}>
                                {qq.name}
                            </span>
                            {isGlobal && qq.node && <span className="text-[10px] text-gray-500 truncate max-w-[140px] shrink-0">{qq.node.name}</span>}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${st.cls}`}>{st.label}</span>
                            <span className="text-[10px] text-gray-500 shrink-0">{qq._count?.items ?? 0} poz.</span>
                            {qq.validUntil && <span className="text-[10px] text-gray-600 shrink-0">do {new Date(qq.validUntil).toLocaleDateString('pl-PL')}</span>}

                            {qq.status === 'DRAFT' && (
                                <>
                                    <button onClick={() => changeStatus(qq.id, 'VERIFIED')} title="Oznacz jako zweryfikowaną"
                                        className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/25 shrink-0">Zweryfikuj</button>
                                    <button onClick={() => handleDelete(qq.id)} title="Usuń szkic" className="p-1 text-gray-600 hover:text-red-400 shrink-0"><Trash2 size={12} /></button>
                                </>
                            )}
                            {qq.status === 'VERIFIED' && (
                                <>
                                    <button onClick={() => changeStatus(qq.id, 'LOCKED')} title="Zamroź wycenę i zapisz ceny do budżetu"
                                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 shrink-0"><Lock size={9} />Zablokuj</button>
                                    <button onClick={() => changeStatus(qq.id, 'DRAFT')} title="Wróć do szkicu"
                                        className="p-1 text-gray-500 hover:text-white shrink-0"><RotateCcw size={11} /></button>
                                </>
                            )}
                            {(qq.status === 'LOCKED' || qq.status === 'BASELINE') && (
                                <button onClick={() => handleNewVersion(qq.id)} title="Nowa wersja (szkic z kopią pozycji)"
                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 shrink-0"><GitBranch size={9} />Nowa wersja</button>
                            )}
                        </div>

                        {isOpen && (
                            <div className="border-t border-white/10">
                                {notice && (
                                    <div className={`px-4 py-2 text-[11px] ${notice.type === 'error' ? 'text-red-300 bg-red-500/5' : 'text-teal-300 bg-teal-500/5'}`}>{notice.text}</div>
                                )}
                                {!d && <div className="px-4 py-4 text-gray-500 text-xs">Ładowanie pozycji…</div>}
                                {d && (
                                    <>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="bg-white/[0.02] border-b border-white/5">
                                                        <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">Pozycja</th>
                                                        <th className="text-left px-2 py-2 text-gray-500 font-semibold uppercase tracking-wider w-16">Źródło</th>
                                                        <th className="text-left px-2 py-2 text-gray-500 font-semibold uppercase tracking-wider">Dostawca</th>
                                                        <th className="text-right px-2 py-2 text-gray-500 font-semibold uppercase tracking-wider w-14">Ilość</th>
                                                        <th className="text-left px-2 py-2 text-gray-500 font-semibold uppercase tracking-wider w-12">Jedn.</th>
                                                        <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider w-24">Cena netto PLN</th>
                                                        <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider w-24">Wartość</th>
                                                        <th className="w-8 px-2 py-2" />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {d.items.map(item => (
                                                        <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.02] group">
                                                            <td className="px-3 py-2 text-gray-200">
                                                                <span className="line-clamp-2">{item.reqName || '—'}</span>
                                                                {item.currency && item.currency !== 'PLN' && item.exchangeRate && (
                                                                    <span className="block text-[9px] text-amber-400/80 font-mono">
                                                                        {item.priceOriginalNetto} {item.currency} × {item.exchangeRate} (NBP {item.rateDate ? new Date(item.rateDate).toLocaleDateString('pl-PL') : ''})
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-2">
                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${SOURCE_STYLES[item.source] || SOURCE_STYLES.MANUAL}`}>{item.source}</span>
                                                            </td>
                                                            <td className="px-2 py-2 text-gray-400 truncate max-w-[140px]">{item.supplier?.name || '—'}</td>
                                                            <td className="px-2 py-2 text-right text-gray-300">{item.qtyAtCapture ?? '—'}</td>
                                                            <td className="px-2 py-2 text-gray-500">{item.unit || '—'}</td>
                                                            <td className="px-3 py-2 text-right">
                                                                {editable ? (
                                                                    <input defaultValue={item.priceNettoPln ?? ''} type="number" min="0" step="0.01"
                                                                        onBlur={e => Number(e.target.value) !== item.priceNettoPln && handlePriceEdit(d.id, item.id, e.target.value)}
                                                                        className="w-20 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-right text-teal-300 font-mono focus:outline-none focus:border-teal-500" />
                                                                ) : (
                                                                    <span className="text-gray-300 font-mono">{item.priceNettoPln != null ? item.priceNettoPln.toFixed(2) : '—'}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-right text-gray-300 font-mono whitespace-nowrap">
                                                                {item.priceNettoPln != null && item.qtyAtCapture != null ? (item.priceNettoPln * item.qtyAtCapture).toFixed(2) : '—'}
                                                            </td>
                                                            <td className="px-2 py-2 text-center">
                                                                {editable && (
                                                                    <button onClick={() => handleRemoveItem(d.id, item.id)} title="Usuń pozycję"
                                                                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"><Trash2 size={12} /></button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {d.items.length === 0 && (
                                                        <tr><td colSpan={8} className="px-3 py-4 text-center text-gray-600">Brak pozycji — dodaj ręcznie albo pobierz z magazynu</td></tr>
                                                    )}
                                                </tbody>
                                                {d.items.length > 0 && (
                                                    <tfoot>
                                                        <tr className="bg-white/[0.02]">
                                                            <td colSpan={6} className="px-3 py-2 text-right text-gray-500 font-semibold uppercase tracking-wider text-[10px]">Razem netto</td>
                                                            <td className="px-3 py-2 text-right text-teal-300 font-mono font-bold whitespace-nowrap">{sum(d.items).toFixed(2)} zł</td>
                                                            <td />
                                                        </tr>
                                                    </tfoot>
                                                )}
                                            </table>
                                        </div>

                                        {/* @anchor qq-comparison-embed — pełny panel porównawczy dla wyceny BASELINE (F5) */}
                                        {qq.status === 'BASELINE' && (
                                            <div className="border-t border-teal-500/20">
                                                <ComparisonPanel nodeId={d.nodeId} />
                                            </div>
                                        )}

                                        {editable && (
                                            <div className="px-3 py-2.5 border-t border-white/5 bg-black/20 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => handleFromStock(d.id)}
                                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-600/15 hover:bg-teal-600/25 text-teal-300 text-[10px] font-semibold border border-teal-500/25 transition-all shrink-0">
                                                        <Zap size={11} />Z magazynu
                                                    </button>
                                                    <span className="text-[9px] text-gray-600">kandydaci tylko przy pełnym pokryciu stanem; wycena wg ceny katalogowej</span>
                                                </div>
                                                <div className="grid grid-cols-12 gap-1.5 items-center">
                                                    <select value={newItem.materialRequirementId} onChange={e => pickRequirement(e.target.value)}
                                                        className="col-span-3 bg-black/40 border border-white/10 rounded px-1.5 py-1.5 text-[10px] text-gray-300 focus:outline-none focus:border-amber-500">
                                                        <option value="">— wymaganie (opcjonalnie) —</option>
                                                        {requirements.map(r => <option key={r.id} value={r.id}>{r.name || r.id}</option>)}
                                                    </select>
                                                    <input value={newItem.reqName} onChange={e => setNewItem(n => ({ ...n, reqName: e.target.value }))} placeholder="Nazwa pozycji"
                                                        className="col-span-3 bg-black/40 border border-white/10 rounded px-1.5 py-1.5 text-[10px] text-gray-300 focus:outline-none focus:border-amber-500" />
                                                    <input value={newItem.qtyAtCapture} onChange={e => setNewItem(n => ({ ...n, qtyAtCapture: e.target.value }))} placeholder="Ilość" type="number" min="0"
                                                        className="col-span-1 bg-black/40 border border-white/10 rounded px-1.5 py-1.5 text-[10px] text-gray-300 font-mono focus:outline-none focus:border-amber-500" />
                                                    <input value={newItem.unit} onChange={e => setNewItem(n => ({ ...n, unit: e.target.value }))} placeholder="Jedn."
                                                        className="col-span-1 bg-black/40 border border-white/10 rounded px-1.5 py-1.5 text-[10px] text-gray-300 focus:outline-none focus:border-amber-500" />
                                                    <input value={newItem.priceOriginalNetto} onChange={e => setNewItem(n => ({ ...n, priceOriginalNetto: e.target.value }))} placeholder="Cena netto" type="number" min="0" step="0.01"
                                                        className="col-span-2 bg-black/40 border border-white/10 rounded px-1.5 py-1.5 text-[10px] text-teal-300 font-mono focus:outline-none focus:border-amber-500" />
                                                    <select value={newItem.currency} onChange={e => setNewItem(n => ({ ...n, currency: e.target.value }))}
                                                        className="col-span-1 bg-black/40 border border-white/10 rounded px-1 py-1.5 text-[10px] text-gray-300 focus:outline-none focus:border-amber-500">
                                                        {['PLN', 'EUR', 'USD', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                    <button onClick={() => handleAddItem(d.id)} disabled={!newItem.reqName && !newItem.materialRequirementId}
                                                        className="col-span-1 flex items-center justify-center gap-1 py-1.5 rounded bg-amber-600/15 hover:bg-amber-600/25 text-amber-300 text-[10px] font-semibold border border-amber-500/25 disabled:opacity-40">
                                                        <Plus size={11} />
                                                    </button>
                                                </div>
                                                <div className="max-w-md">
                                                    <SupplierPicker dark value={newItem.supplierId} onChange={(s) => setNewItem(n => ({ ...n, supplierId: s?.id ?? null }))} />
                                                </div>
                                                {newItem.currency !== 'PLN' && (
                                                    <p className="text-[9px] text-amber-400/70">Kurs NBP zostanie zamrożony w momencie dodania pozycji.</p>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
