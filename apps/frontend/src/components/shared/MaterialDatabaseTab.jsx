import React, { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Package, ChevronDown, ChevronRight, Cpu, Trash2, Building2, Loader2 } from 'lucide-react';
import { API_URL } from '../../config';
import PropertyPreview from './PropertyPreview';

const TYPE_LABELS = {
    DEVICE: 'Urządzenie', MATERIAL: 'Materiał', CABLE: 'Kabel',
    SOFTWARE: 'Oprogramowanie', SERVICE: 'Usługa',
};

// ─── Sekcja zwijalna ──────────────────────────────────────────────────────────
function CollapsibleSection({ title, open, onToggle, children, accent = 'teal', headerRight, fullBleed = false, fill = false }) {
    const colors = {
        teal:  { text: 'text-teal-400',  border: 'border-teal-500/20',  bg: 'bg-teal-500/5'  },
        amber: { text: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5' },
    };
    const c = colors[accent] || colors.teal;
    const edge = open && fullBleed ? 'border-l-0 border-r-0' : 'border-l border-r rounded-xl';
    return (
        <div className={`border-t border-b ${c.border} ${edge} ${fill ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : 'overflow-hidden'}`}>
            <div
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/5 transition-colors select-none flex-shrink-0 ${c.bg}`}
                onClick={onToggle}
            >
                <ChevronDown size={14} className={`${c.text} transition-transform duration-200 flex-shrink-0 ${open ? '' : '-rotate-90'}`} />
                <span className={`text-sm font-bold ${c.text} flex-1`}>{title}</span>
                {headerRight && (
                    <div onClick={e => e.stopPropagation()} className="flex items-center gap-2">
                        {headerRight}
                    </div>
                )}
            </div>
            {open && (
                <div className={`border-t border-white/5 ${fill ? 'flex-1 min-h-0 overflow-y-auto' : ''}`}>
                    {children}
                </div>
            )}
        </div>
    );
}

const STATUS_COLORS = {
    PENDING:   'text-amber-400',
    CONFIRMED: 'text-green-400',
    REJECTED:  'text-red-400',
    PROPOSAL:  'text-blue-400',
    ORDERED:   'text-purple-400',
    IN_STOCK:  'text-cyan-400',
    ISSUED:    'text-emerald-400',
};
const STATUS_LABELS = {
    PENDING: 'Oczekuje', CONFIRMED: 'Potwierdzone', REJECTED: 'Odrzucone',
    PROPOSAL: 'Propozycja', ORDERED: 'Zamówione', IN_STOCK: 'Na magazynie', ISSUED: 'Wydane',
};

function MaterialUsagePanel({ manufacturer, model }) {
    const [rows, setRows] = useState(null);

    useEffect(() => {
        const token = sessionStorage.getItem('token');
        const params = new URLSearchParams({ manufacturer });
        if (model) params.set('model', model);
        fetch(`${API_URL}/material-requirements/usage?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : [])
            .then(setRows)
            .catch(() => setRows([]));
    }, [manufacturer, model]);

    if (rows === null) {
        return (
            <div className="flex items-center gap-2 px-6 py-3 text-gray-500 text-xs">
                <Loader2 size={12} className="animate-spin" /> Ładowanie użycia…
            </div>
        );
    }
    if (rows.length === 0) {
        return <p className="px-6 py-3 text-xs text-gray-600 italic">Brak wymagań z tym produktem.</p>;
    }

    const getProjectName = (node) => {
        if (!node) return '—';
        const segments = [];
        let n = node;
        while (n) { segments.unshift(n.name); n = n.parent; }
        return segments.join(' › ');
    };

    return (
        <div className="px-2 pb-2">
            <table className="w-full text-[11px]">
                <thead>
                    <tr className="text-gray-500 border-b border-white/5">
                        <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider">Projekt / WBS</th>
                        <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider">Wymaganie</th>
                        <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider">Ilość</th>
                        <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider">Cena netto</th>
                        <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider">Dostępność</th>
                        <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider">Status</th>
                        <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider">Data</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <td className="px-3 py-1.5 text-gray-300 max-w-[220px]">
                                <div className="flex items-center gap-1.5">
                                    <Building2 size={10} className="text-gray-600 flex-shrink-0" />
                                    <span className="truncate" title={getProjectName(r.node)}>{getProjectName(r.node)}</span>
                                </div>
                            </td>
                            <td className="px-3 py-1.5 text-gray-400 max-w-[180px]">
                                <span className="truncate block" title={r.name}>{r.name || '—'}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right text-gray-300 whitespace-nowrap">
                                {r.quantity ?? '—'} <span className="text-gray-600">{r.unit || 'szt'}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">
                                {r.priceNetto != null
                                    ? <span className="text-green-400">{Number(r.priceNetto).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
                                    : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-cyan-400">{r.availability || '—'}</td>
                            <td className="px-3 py-1.5">
                                <span className={STATUS_COLORS[r.status] || 'text-gray-500'}>
                                    {STATUS_LABELS[r.status] || r.status || '—'}
                                </span>
                            </td>
                            <td className="px-3 py-1.5 text-right text-gray-600 whitespace-nowrap">
                                {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pl-PL') : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function MaterialDatabaseTab({ nodeId, searchQuery = '', isGlobal = false }) {
    const [items, setItems] = useState([]);
    const [datasheetItems, setDatasheetItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const search = searchQuery;
    const [openSection, setOpenSection] = useState('database');
    const toggle = (section) => setOpenSection(s => s === section ? null : section);
    const [refreshKey, setRefreshKey] = useState(0);
    const [expandedKey, setExpandedKey] = useState(null);
    const [batchParsing, setBatchParsing] = useState(false);
    const [batchStatus, setBatchStatus] = useState(null);
    const [parsedIds, setParsedIds] = useState(() => new Set());

    const isDatasheetFile = (fileName) => {
        const n = (fileName || '').toLowerCase();
        return n.includes('karta materiałowa') || n.includes('karta techniczna') || n.includes('data sheet') || n.includes('datasheet');
    };

    const handleBatchParse = async () => {
        if (!nodeId) return;
        setBatchParsing(true);
        setBatchStatus(null);
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const filesRes = await fetch(`${API_URL}/documents/node/${nodeId}?category=standard`, { headers });
            const files = filesRes.ok ? await filesRes.json() : [];
            if (files.length === 0) { setBatchStatus('Brak plików'); setBatchParsing(false); return; }

            const newFiles = files.filter(f => !parsedIds.has(f.id));
            if (newFiles.length === 0) { setBatchStatus('Już sparsowano'); setBatchParsing(false); return; }
            const datasheetFiles = newFiles.filter(f => isDatasheetFile(f.fileName));
            const otherFiles = newFiles.filter(f => !isDatasheetFile(f.fileName));

            let saved = 0;
            for (const file of datasheetFiles) {
                try {
                    const abortController = new AbortController();
                    const timeoutId = setTimeout(() => abortController.abort(), 120000); // 2 min timeout per file
                    const parseRes = await fetch(`${API_URL}/material-requirements/parse-datasheet`, {
                        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ documentId: file.id }),
                        signal: abortController.signal
                    });
                    clearTimeout(timeoutId);
                    if (!parseRes.ok) { console.warn(`Parse failed for ${file.fileName}:`, parseRes.status); continue; }
                    const parsed = await parseRes.json();
                    if (!parsed.length) continue;
                    await fetch(`${API_URL}/material-requirements/save-datasheet-items`, {
                        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ documentId: file.id, nodeId, items: parsed }),
                    });
                    saved += parsed.length;
                } catch (err) { console.error(`Error parsing ${file.fileName}:`, err); }
            }
            for (const file of otherFiles) {
                try {
                    const abortController = new AbortController();
                    const timeoutId = setTimeout(() => abortController.abort(), 120000);
                    await fetch(`${API_URL}/material-requirements/parse-datasheet`, {
                        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ documentId: file.id }),
                        signal: abortController.signal
                    });
                    clearTimeout(timeoutId);
                } catch (err) { console.error(`Error parsing ${file.fileName}:`, err); }
            }

            setBatchStatus(datasheetFiles.length ? `+${saved} mat.` : 'OK');
            setParsedIds(prev => { const next = new Set(prev); newFiles.forEach(f => next.add(f.id)); return next; });
            setRefreshKey(k => k + 1);
        } catch {
            setBatchStatus('Błąd');
        }
        setBatchParsing(false);
    };

    const handleDatasheetApprove = async (items, documentId) => {
        if (!items?.length || !nodeId) return;
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/material-requirements/save-datasheet-items`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId, nodeId, items }),
        });
        setRefreshKey(k => k + 1);
    };

    useEffect(() => {
        setLoading(true);
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const dsUrl = isGlobal 
            ? `${API_URL}/material-requirements/datasheets` 
            : nodeId ? `${API_URL}/material-requirements/datasheets/${nodeId}` : null;

        Promise.all([
            fetch(`${API_URL}/material-requirements/database`, { headers }).then(r => r.ok ? r.json() : []),
            dsUrl ? fetch(dsUrl, { headers }).then(r => r.ok ? r.json() : []) : Promise.resolve([]),
        ])
            .then(([db, ds]) => { setItems(Array.isArray(db) ? db : []); setDatasheetItems(Array.isArray(ds) ? ds : []); })
            .catch(() => { setItems([]); setDatasheetItems([]); })
            .finally(() => setLoading(false));
    }, [refreshKey, nodeId, isGlobal]);

    const filterFn = (r) => {
        const q = search.toLowerCase();
        if (!q) return true;
        return (
            (r.productName || '').toLowerCase().includes(q) ||
            (r.manufacturer || '').toLowerCase().includes(q) ||
            (r.model || '').toLowerCase().includes(q) ||
            (r.node?.name || '').toLowerCase().includes(q) ||
            (r.node?.parent?.name || '').toLowerCase().includes(q) ||
            (r.dataSheetName || '').toLowerCase().includes(q)
        );
    };
    const filtered = useMemo(() => items.filter(filterFn), [items, search]);
    const filteredDatasheets = useMemo(() => datasheetItems.filter(filterFn), [datasheetItems, search]);

    const openDatasheet = (id) => {
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/material-requirements/${id}/datasheet`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.blob() : null)
            .then(blob => { if (blob) window.open(URL.createObjectURL(blob), '_blank'); })
            .catch(() => {});
    };

    const handleDelete = async (id) => {
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/material-requirements/${id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
        });
        setItems(prev => prev.filter(r => r.id !== id));
        setDatasheetItems(prev => prev.filter(r => r.id !== id));
    };

    // Dedup: wyklucz z globalnej bazy rekordy już widoczne w datasheetItems
    const dsIds = useMemo(() => new Set(datasheetItems.map(r => r.id)), [datasheetItems]);
    const filteredDeduped = useMemo(() => filtered.filter(r => !dsIds.has(r.id)), [filtered, dsIds]);

    const total = filteredDeduped.length + filteredDatasheets.length;
    const totalAll = items.filter(r => !dsIds.has(r.id)).length + datasheetItems.length;

    // ── Parse button — pojawia się w headerze sekcji importu ─────────────────
    const ParseBtn = (
        <button
            onClick={handleBatchParse}
            disabled={batchParsing || !nodeId || batchStatus === 'Już sparsowano'}
            title={batchStatus || 'Parsuj i zapisz wszystkie wgrane karty'}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-[11px] font-semibold border border-amber-500/30 transition-all disabled:opacity-50"
        >
            {batchParsing
                ? <><div className="w-3 h-3 border border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />AI…</>
                : <><Cpu size={11} />Parsuj{batchStatus ? ` · ${batchStatus}` : ''}</>}
        </button>
    );

    return (
        <div className={`flex flex-col ${openSection ? 'gap-0' : 'gap-3 pb-32'}`}>

                {/* ── Import kart — full-width gdy otwarta ─────────────────────── */}
                <section className={`flex flex-col overflow-hidden bg-[#0f1117]
                    ${openSection === 'import' ? 'h-[calc(100vh-160px)] -mx-3 -mt-3' : 'rounded-2xl border border-white/5 bg-white/[0.02]'}
                    ${openSection !== null && openSection !== 'import' ? 'hidden' : ''}`}>
                    <CollapsibleSection
                        title="Import kart"
                        accent="amber"
                        open={openSection === 'import'}
                        onToggle={() => toggle('import')}
                        headerRight={ParseBtn}
                        fullBleed
                        fill={openSection === 'import'}
                    >
                        <PropertyPreview
                            nodeId={nodeId}
                            isDatasheetTab={true}
                            searchQuery={search}
                            onDatasheetApprove={handleDatasheetApprove}
                        />
                    </CollapsibleSection>
                </section>

                {/* ── Baza materiałów — full-width gdy otwarta ─────────────────── */}
                <section className={`flex flex-col overflow-hidden bg-[#0f1117]
                    ${openSection === 'database' ? 'h-[calc(100vh-160px)] -mx-3 -mt-3' : 'rounded-2xl border border-white/5 bg-white/[0.02]'}
                    ${openSection !== null && openSection !== 'database' ? 'hidden' : ''}`}>
                    <CollapsibleSection
                        title={`Baza materiałów${total ? ` (${total}${total !== totalAll ? `/${totalAll}` : ''})` : ''}`}
                        accent="teal"
                        open={openSection === 'database'}
                        onToggle={() => toggle('database')}
                        fullBleed
                        fill={openSection === 'database'}
                    >
                        {loading ? (
                            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">Ładowanie…</div>
                        ) : total === 0 ? (
                            <div className="flex flex-col items-center justify-center h-32 text-gray-500 gap-2">
                                <Package size={32} className="opacity-30" />
                                <span className="text-sm">{search ? 'Brak wyników' : 'Brak materiałów w bazie'}</span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto flex-1 min-h-0">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-white/10 bg-[#0f1117]">
                                            <th className="w-8 px-2 py-2 bg-[#0f1117]" />
                                            <th className="text-left px-3 py-2 text-gray-400 font-semibold uppercase tracking-wider">Nazwa handlowa</th>
                                            <th className="text-left px-3 py-2 text-gray-400 font-semibold uppercase tracking-wider">Typ</th>
                                            <th className="text-left px-3 py-2 text-gray-400 font-semibold uppercase tracking-wider">Producent</th>
                                            <th className="text-left px-3 py-2 text-gray-400 font-semibold uppercase tracking-wider">Model</th>
                                            <th className="text-right px-3 py-2 text-gray-400 font-semibold uppercase tracking-wider">Cena netto</th>
                                            <th className="text-left px-3 py-2 text-gray-400 font-semibold uppercase tracking-wider">Dostępność</th>
                                            <th className="text-left px-3 py-2 text-gray-400 font-semibold uppercase tracking-wider">Adres www</th>
                                            <th className="text-right px-3 py-2 text-gray-400 font-semibold uppercase tracking-wider">Stan magazynowy</th>
                                            <th className="text-left px-3 py-2 text-gray-400 font-semibold uppercase tracking-wider">Źródło</th>
                                            <th className="text-center px-3 py-2 text-gray-400 font-semibold uppercase tracking-wider">Karta</th>
                                            <th className="px-2 py-2" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDatasheets.map(r => {
                                            const rowKey = `ds-${r.id}`;
                                            const isExpanded = expandedKey === rowKey;
                                            return (
                                            <React.Fragment key={rowKey}>
                                            <tr className={`border-b border-white/5 group transition-colors ${isExpanded ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'}`}>
                                                <td className="px-2 py-2 text-center">
                                                    <button onClick={() => setExpandedKey(isExpanded ? null : rowKey)} className="text-gray-600 hover:text-gray-300 transition-colors">
                                                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                                    </button>
                                                </td>
                                                <td className="px-3 py-2 text-gray-200 max-w-[200px]"><span className="line-clamp-2" title={r.productName || '—'}>{r.productName || <span className="text-gray-500">—</span>}</span></td>
                                                <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 text-[10px] font-semibold">{TYPE_LABELS[r.type] || r.type}</span></td>
                                                <td className="px-3 py-2 text-gray-300">{r.manufacturer ? r.manufacturer.toUpperCase() : '—'}</td>
                                                <td className="px-3 py-2 text-gray-400 font-mono">{r.model || '—'}</td>
                                                <td className="px-3 py-2 text-right text-green-400 font-mono whitespace-nowrap">{r.priceNetto != null ? `${Number(r.priceNetto).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł` : '—'}</td>
                                                <td className="px-3 py-2 text-cyan-400 text-[11px]">{r.availability || '—'}</td>
                                                <td className="px-3 py-2 text-[11px] max-w-[140px]">{r.productUrl ? <a href={r.productUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 truncate block" title={r.productUrl}>{(() => { try { return new URL(r.productUrl).hostname.replace(/^www\./, ''); } catch { return r.productUrl.slice(0, 20); } })()}</a> : <span className="text-gray-600">—</span>}</td>
                                                <td className="px-3 py-2 text-right text-gray-600">{r.stockStatus ? `${r.stockStatus} szt` : '—'}</td>
                                                <td className="px-3 py-2 text-gray-500 text-[10px] max-w-[180px]"><span className="truncate block" title={r.dataSheetName}>{r.dataSheetName || '—'}</span></td>
                                                <td className="px-3 py-2 text-center">
                                                    <button onClick={() => openDatasheet(r.id)} className="inline-flex items-center px-2 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 transition-colors">
                                                        <ExternalLink size={12} />
                                                    </button>
                                                </td>
                                                <td className="px-2 py-2 text-center">
                                                    <button onClick={() => handleDelete(r.id)} className="opacity-0 group-hover:opacity-100 text-red-800 hover:text-red-400 transition-all">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="border-b border-white/5 bg-black/20">
                                                    <td colSpan={12} className="p-0">
                                                        <MaterialUsagePanel manufacturer={r.manufacturer} model={r.model} />
                                                    </td>
                                                </tr>
                                            )}
                                            </React.Fragment>
                                            );
                                        })}
                                        {filteredDeduped.map(r => {
                                            const rowKey = `db-${r.id}`;
                                            const isExpanded = expandedKey === rowKey;
                                            return (
                                            <React.Fragment key={rowKey}>
                                            <tr className={`border-b border-white/5 group transition-colors ${isExpanded ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'}`}>
                                                <td className="px-2 py-2 text-center">
                                                    <button onClick={() => setExpandedKey(isExpanded ? null : rowKey)} className="text-gray-600 hover:text-gray-300 transition-colors">
                                                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                                    </button>
                                                </td>
                                                <td className="px-3 py-2 text-gray-200 max-w-[200px]"><span className="line-clamp-2" title={r.productName || '—'}>{r.productName || <span className="text-gray-500">—</span>}</span></td>
                                                <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 text-[10px] font-semibold">{TYPE_LABELS[r.type] || r.type}</span></td>
                                                <td className="px-3 py-2 text-gray-300">{r.manufacturer || '—'}</td>
                                                <td className="px-3 py-2 text-gray-400">{r.model || '—'}</td>
                                                <td className="px-3 py-2 text-right text-green-400 font-mono whitespace-nowrap">{r.priceNetto != null ? `${Number(r.priceNetto).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł` : '—'}</td>
                                                <td className="px-3 py-2 text-cyan-400 text-[11px]">{r.availability || '—'}</td>
                                                <td className="px-3 py-2 text-[11px] max-w-[140px]">{r.productUrl ? <a href={r.productUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 truncate block" title={r.productUrl}>{(() => { try { return new URL(r.productUrl).hostname.replace(/^www\./, ''); } catch { return r.productUrl.slice(0, 20); } })()}</a> : <span className="text-gray-600">—</span>}</td>
                                                <td className="px-3 py-2 text-right text-gray-300">{r.stockStatus ? `${r.stockStatus} szt` : '—'}</td>
                                                <td className="px-3 py-2">
                                                    <div className="text-gray-300">{r.node?.name || '—'}</div>
                                                    {r.node?.parent?.name && <div className="text-gray-500 text-[10px]">{r.node.parent.name}</div>}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                    {r.dataSheetUrl ? (
                                                        <button onClick={() => openDatasheet(r.id)} className="inline-flex items-center px-2 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 transition-colors">
                                                            <ExternalLink size={12} />
                                                        </button>
                                                    ) : '—'}
                                                </td>
                                                <td className="px-2 py-2 text-center">
                                                    <button onClick={() => handleDelete(r.id)} className="opacity-0 group-hover:opacity-100 text-red-800 hover:text-red-400 transition-all">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="border-b border-white/5 bg-black/20">
                                                    <td colSpan={12} className="p-0">
                                                        <MaterialUsagePanel manufacturer={r.manufacturer} model={r.model} />
                                                    </td>
                                                </tr>
                                            )}
                                            </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CollapsibleSection>
                </section>

        </div>
    );
}
