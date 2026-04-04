import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
    ClientSideRowModelModule,
    TextEditorModule,
    NumberEditorModule,
    SelectEditorModule,
    TextFilterModule,
    NumberFilterModule,
    ValidationModule,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { Layers, Package, DollarSign, ChevronRight, ChevronDown, Plus, Trash2, FolderPlus, RefreshCw, HelpCircle, Save, CheckCircle, FileDown, X, LayoutList, Zap, Sparkles, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { API_URL } from '../../../config';
import MaterialRequirementsPanel from './MaterialRequirementsPanel';

const MODULES = [
    ClientSideRowModelModule,
    TextEditorModule,
    NumberEditorModule,
    SelectEditorModule,
    TextFilterModule,
    NumberFilterModule,
    ValidationModule,
];

const VIEWS = {
    STRUCTURE: 'structure',
    MATERIALS: 'materials',
    BUDGET: 'budget',
};

const TYPE_LABELS = { work: 'Praca', material: 'Materiał', equipment: 'Sprzęt', service: 'Usługa' };
const TYPE_OPTIONS = ['', 'work', 'material', 'equipment', 'service'];
const BUDGET_TYPE_LABELS = { WORK: 'Praca', MATERIAL: 'Materiał', EXTERNAL_SERVICE: 'Usługa Obca' };
const UNIT_OPTIONS = ['kpl', 'szt', 'dzień', 'm', 'rbh', 'm-c'];
const MATERIAL_STATUS_LABELS = {
    PENDING: 'Oczekuje',
    PROPOSAL: 'Propozycja',
    CONFIRMED: 'Potwierdzone',
    REJECTED: 'Odrzucone',
    ORDERED: 'Zamówione',
    IN_STOCK: 'Na magazynie',
    ISSUED: 'Wydane',
};

const darkTheme = themeQuartz.withParams({
    backgroundColor: '#0a0a0f',
    foregroundColor: '#e5e7eb',
    headerBackgroundColor: '#111118',
    headerTextColor: '#9ca3af',
    rowHoverColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
    cellHorizontalPaddingScale: 0.6,
    fontSize: 12,
    headerFontSize: 10,
    rowHeight: 32,
    headerHeight: 34,
});

const fmtPLN = v => v != null && v !== 0 ? v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const fmtQty = v => v != null && v !== 0 ? v.toLocaleString('pl-PL', { maximumFractionDigits: 2 }) : '';
const fmtPct = v => v != null && v !== 0 ? v.toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + '%' : '';
const fmtPLNFull = v => (Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPctFull = v => (Number(v) || 0).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + '%';
const normKey = (value) => String(value || '').trim().toLowerCase();
const makeMaterialLookupKey = (subjectName, itemName) => `${normKey(subjectName)}::${normKey(itemName)}`;

// ─── Hierarchical name renderer ──────────────────────────────────────────────

function TreeNameRenderer({ data, context }) {
    const depth = data._depth || 0;
    const hasChildren = data._hasChildren;
    const expanded = context?.expandedIds?.has(data.id);
    const toggleExpand = context?.toggleExpand;
    const isSelected = context?.selectedId === data.id;

    return (
        <div
            className={`flex items-center gap-1 cursor-pointer ${isSelected ? 'ring-1 ring-cyan-500/40 rounded px-1 -mx-1' : ''}`}
            style={{ paddingLeft: depth * 20 }}
            onClick={() => context?.onSelectRow?.(data.id)}
        >
            {hasChildren ? (
                <button onClick={(e) => { e.stopPropagation(); toggleExpand?.(data.id); }} className="text-gray-500 hover:text-white w-4">
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
            ) : <span className="w-4" />}
            <span className={`truncate ${depth === 0 ? 'font-semibold text-white' : 'text-gray-300'}`}>
                {data.name}
            </span>
            {data.materialsCount > 0 && (
                <span className="text-[10px] text-blue-400/60 ml-1">({data.materialsCount})</span>
            )}
        </div>
    );
}

function BudgetHeaderRenderer(params) {
    const sort = params.column?.getSort?.() || null;
    const SortIcon = sort === 'asc' ? ArrowUp : sort === 'desc' ? ArrowDown : ArrowUpDown;

    const openFilterPopup = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (params.showColumnMenu) {
            params.showColumnMenu(e.currentTarget);
            return;
        }
        if (params.showColumnMenuAfterMouseClick) {
            params.showColumnMenuAfterMouseClick(e);
        }
    };

    const toggleSort = (e) => {
        e.preventDefault();
        e.stopPropagation();
        params.progressSort?.(e.shiftKey);
    };

    return (
        <div className="w-full h-full flex items-center justify-between gap-2 px-1">
            <button
                type="button"
                className="truncate text-left text-gray-300 hover:text-white transition-colors"
                onClick={openFilterPopup}
                title="Filtruj kolumnę"
            >
                {params.displayName}
            </button>
            <button
                type="button"
                className="text-gray-400 hover:text-white transition-colors"
                onClick={toggleSort}
                title="Sortuj kolumnę"
            >
                <SortIcon size={12} />
            </button>
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function UnifiedWbsPanel({ nodeId, versionId, onWbsUpdate, userRoles = [] }) {
    const [wbsData, setWbsData] = useState([]);
    const [expandedSection, setExpandedSection] = useState(null);
    const [fullscreenSection, setFullscreenSection] = useState(null);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [selectedId, setSelectedId] = useState(null);
    const [wbsDescription, setWbsDescription] = useState('');
    const [strategyPreviewOpen, setStrategyPreviewOpen] = useState(false);
    const [strategySaving, setStrategySaving] = useState(false);
    const [strategySaved, setStrategySaved] = useState(false);
    const [projectUsers, setProjectUsers] = useState([]);
    const [logistykUsers, setLogistykUsers] = useState([]);
    const [materialCostsByNode, setMaterialCostsByNode] = useState({});
    const [materialMetaByLookupKey, setMaterialMetaByLookupKey] = useState({});
    const [budgetDiscountAmount, setBudgetDiscountAmount] = useState('');
    const [budgetDiscountPercent, setBudgetDiscountPercent] = useState('');
    const [budgetSummary, setBudgetSummary] = useState({
        rows: 0,
        totalCost: 0,
        totalRevenue: 0,
        profit: 0,
        marginPct: 0,
    });

    const showGlobalPdfExport = userRoles.includes('MANAGER') && expandedSection === null && fullscreenSection === null;
    
    const gridRef = useRef();
    const budgetGridApiRef = useRef(null);
    const materialRef = useRef();
    const strategyRef = useRef();
    const strategySaveTimeout = useRef(null);

    const isLogistyk = userRoles.includes('LOGISTYK');
    const isManagerOrAdmin = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));

    const token = () => sessionStorage.getItem('token');
    const authHeaders = useCallback(() => ({
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
    }), []);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) {
                const data = await res.json();
                setWbsData(data.items || []);
                // Expand top-level nodes by default
                const topIds = (data.items || []).filter(n => n.depth === 0).map(n => n.id);
                setExpandedIds(prev => {
                    const next = new Set(prev);
                    topIds.forEach(id => next.add(id));
                    return next;
                });
            }

            const materialsRes = await fetch(`${API_URL}/material-requirements/node/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
            if (materialsRes.ok) {
                const requirements = await materialsRes.json();
                const nextCosts = {};
                const nextLookupMeta = {};
                let projectItemNamesById = {};

                try {
                    const reqRes = await fetch(`${API_URL}/order-requirements/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
                    if (reqRes.ok) {
                        const reqData = await reqRes.json();
                        const tree = JSON.parse(reqData.wbsTree || '{}');
                        projectItemNamesById = Object.fromEntries(
                            (tree.items || [])
                                .filter(item => !item.type || item.type === 'product')
                                .map(item => [item.id, item.name])
                        );
                    }
                } catch (e) {
                    console.error('Fetch project items mapping error:', e);
                }

                for (const req of Array.isArray(requirements) ? requirements : []) {
                    const statusLabel = MATERIAL_STATUS_LABELS[req.status] || req.status || '';
                    const selected = (req.proposals || []).find((p) => p.isSelected);
                    const unitNet = parseFloat(req.priceNetto ?? selected?.priceNetto) || 0;
                    const nameCandidates = Array.from(new Set([
                        req.productName,
                        req.name,
                    ].filter(Boolean).map(name => String(name).trim())));

                    const registerLookupMeta = (subjectName, quantity) => {
                        if (!subjectName || !nameCandidates.length) return;
                        for (const candidateName of nameCandidates) {
                            const key = makeMaterialLookupKey(subjectName, candidateName);
                            if (!nextLookupMeta[key]) {
                                nextLookupMeta[key] = { statuses: [], cost: 0 };
                            }
                            if (statusLabel && !nextLookupMeta[key].statuses.includes(statusLabel)) {
                                nextLookupMeta[key].statuses.push(statusLabel);
                            }
                            if (req.status === 'CONFIRMED' && unitNet > 0 && quantity > 0) {
                                nextLookupMeta[key].cost += unitNet * quantity;
                            }
                        }
                    };
                    let alloc = {};
                    try { alloc = req.wbsNodeAllocations ? JSON.parse(req.wbsNodeAllocations) : {}; } catch { alloc = {}; }
                    const allocEntries = Object.entries(alloc || {});

                    if (allocEntries.length > 0) {
                        for (const [wbsNodeId, qtyRaw] of allocEntries) {
                            const qty = parseFloat(qtyRaw) || 0;
                            if (!wbsNodeId || qty <= 0) continue;
                            registerLookupMeta(projectItemNamesById[wbsNodeId], qty);
                            if (req.status === 'CONFIRMED') {
                                nextCosts[wbsNodeId] = (nextCosts[wbsNodeId] || 0) + unitNet * qty;
                            }
                        }
                        continue;
                    }

                    if (req.wbsNodeId) {
                        const qty = parseFloat(req.quantity) || 0;
                        if (qty > 0) {
                            registerLookupMeta(projectItemNamesById[req.wbsNodeId], qty);
                            if (req.status === 'CONFIRMED') {
                                nextCosts[req.wbsNodeId] = (nextCosts[req.wbsNodeId] || 0) + unitNet * qty;
                            }
                        }
                    }
                }
                setMaterialCostsByNode(nextCosts);
                setMaterialMetaByLookupKey(nextLookupMeta);
            }
        } catch (e) { console.error('Fetch WBS error:', e); }
    }, [nodeId, versionId]);

    const fetchUsers = useCallback(async () => {
        const t = token();
        if (!t) return;
        fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${t}` } })
            .then(r => r.ok ? r.json() : [])
            .then(setProjectUsers);
        fetch(`${API_URL}/users/by-role/LOGISTYK`, { headers: { Authorization: `Bearer ${t}` } })
            .then(r => r.ok ? r.json() : [])
            .then(setLogistykUsers);
    }, []);

    const fetchStrategy = useCallback(async () => {
        try {
            const url = versionId ? `${API_URL}/order-requirements/${nodeId}?versionId=${versionId}` : `${API_URL}/order-requirements/${nodeId}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) {
                const text = await res.text();
                const data = text ? JSON.parse(text) : null;
                if (data) setWbsDescription(data.wbsDescription || '');
            }
        } catch (e) { console.error('Fetch strategy error:', e); }
    }, [nodeId, versionId]);

    useEffect(() => { 
        if (nodeId) {
            fetchData(); 
            fetchUsers();
            fetchStrategy();
        } 
    }, [nodeId, versionId, fetchData, fetchUsers, fetchStrategy]);

    const refreshUnified = useCallback(async () => {
        await fetchData();
        onWbsUpdate?.();
    }, [fetchData, onWbsUpdate]);

    const saveStrategy = useCallback(async (desc) => {
        setStrategySaving(true);
        try {
            await fetch(`${API_URL}/order-requirements`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ nodeId, versionId, wbsDescription: desc }),
            });
            setStrategySaved(true);
            setTimeout(() => setStrategySaved(false), 2000);
        } catch (e) { console.error('Save strategy error:', e); }
        finally { setStrategySaving(false); }
    }, [nodeId, versionId, authHeaders]);

    const handleStrategySave = useCallback((immediate = false) => {
        if (strategySaveTimeout.current) clearTimeout(strategySaveTimeout.current);
        if (immediate) { saveStrategy(wbsDescription); return; }
        strategySaveTimeout.current = setTimeout(() => saveStrategy(wbsDescription), 1000);
    }, [wbsDescription, saveStrategy]);

    const wrapSelection = useCallback((before, after = before, placeholder = 'tekst') => {
        const ta = strategyRef.current;
        if (!ta) return;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const selected = wbsDescription.slice(start, end);
        const insert = `${before}${selected || placeholder}${after}`;
        const next = `${wbsDescription.slice(0, start)}${insert}${wbsDescription.slice(end)}`;
        setWbsDescription(next);
        setTimeout(() => {
            ta.focus();
            const cursor = selected ? start + insert.length : start + before.length + placeholder.length;
            ta.setSelectionRange(cursor, cursor);
        }, 0);
        if (strategySaveTimeout.current) clearTimeout(strategySaveTimeout.current);
        strategySaveTimeout.current = setTimeout(() => saveStrategy(next), 1000);
    }, [wbsDescription, saveStrategy]);

    const prefixSelectionLines = useCallback((prefix, placeholder = 'punkt') => {
        const ta = strategyRef.current;
        if (!ta) return;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const selected = wbsDescription.slice(start, end);
        const base = selected || placeholder;
        const transformed = base.split('\n').map(line => `${prefix}${line}`).join('\n');
        const next = `${wbsDescription.slice(0, start)}${transformed}${wbsDescription.slice(end)}`;
        setWbsDescription(next);
        setTimeout(() => {
            ta.focus();
            const cursor = start + transformed.length;
            ta.setSelectionRange(cursor, cursor);
        }, 0);
        if (strategySaveTimeout.current) clearTimeout(strategySaveTimeout.current);
        strategySaveTimeout.current = setTimeout(() => saveStrategy(next), 1000);
    }, [wbsDescription, saveStrategy]);

    const renderStrategyHtml = useCallback((text) => {
        return (text || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/^### (.+)$/gm, '<h4>$1</h4>')
            .replace(/^## (.+)$/gm, '<h3>$1</h3>')
            .replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
    }, []);

    const handleExportPDF = async (sectionKey = 'all') => {
        const date = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });
        const show = (key) => sectionKey === key || sectionKey === 'all';
        const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let materialRowsHtml = '<tr><td colspan="6">Brak danych materiałowych</td></tr>';
        if (show('materials') && nodeId) {
            try {
                const url = `${API_URL}/material-requirements/node/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
                if (res.ok) {
                    const materials = await res.json();
                    if (Array.isArray(materials) && materials.length) {
                        const typeLabel = (t) => t === 'DEVICE' ? 'Urządzenie' : t === 'MATERIAL' ? 'Materiał' : t;
                        const statusLabel = (s) => ({
                            PENDING: 'Oczekuje',
                            PROPOSAL: 'Propozycja',
                            CONFIRMED: 'Potwierdzone',
                            REJECTED: 'Odrzucone',
                            ORDERED: 'Zamówione',
                            IN_STOCK: 'Na magazynie',
                            ISSUED: 'Wydane',
                        }[s] || s || '');
                        materialRowsHtml = materials.map((m) => {
                            const selected = (m.proposals || []).find((p) => p.isSelected);
                            const product = m.material?.productName || selected?.productName || m.productName || '';
                            const manufacturer = m.material?.manufacturer || m.manufacturer || '';
                            return `<tr>
                                <td>${esc(m.name)}</td>
                                <td>${esc(typeLabel(m.type))}</td>
                                <td class="num">${esc(m.quantity)} ${esc(m.unit)}</td>
                                <td>${esc(product)}</td>
                                <td>${esc(manufacturer)}</td>
                                <td>${esc(statusLabel(m.status))}</td>
                            </tr>`;
                        }).join('');
                    }
                }
            } catch (e) {
                console.error('Material export error:', e);
                materialRowsHtml = '<tr><td colspan="6">Błąd pobierania danych materiałowych</td></tr>';
            }
        }

        const buildTreeRows = (parentId, depth, includeBudget) => {
            const children = wbsData
                .filter(n => (n.parentId || null) === (parentId || null))
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            return children.map(n => {
                const indent = depth * 18;
                const nameStyle = depth === 0 ? 'font-weight:bold' : 'color:#374151';
                const budgetCols = includeBudget ? `
                    <td class="num">${fmtPLN(n.unitCost)}</td>
                    <td class="num">${fmtQty(n.quantity)}</td>
                    <td class="num">${fmtPct(n.margin)}</td>
                    <td class="num">${fmtPLN(n.totalCost)}</td>
                    <td class="num">${fmtPLN(n.totalPrice)}</td>` : `
                    <td>${TYPE_LABELS[n.type] || n.type || ''}</td>
                    <td>${n.status || ''}</td>
                    <td>${n.owner || ''}</td>`;
                return `<tr>
                    <td style="padding-left:${8 + indent}px;${nameStyle}">${depth > 0 ? '└ ' : ''}${(n.name || '').replace(/</g, '&lt;')}</td>
                    ${budgetCols}
                </tr>${buildTreeRows(n.id, depth + 1, includeBudget)}`;
            }).join('');
        };

        const strategyHtml = show('strategy') ? `
            <div class="section">
                <div class="section-header">Jak to chcemy zrobić</div>
                <div class="strategy-text"><p>${renderStrategyHtml(wbsDescription || 'Brak treści strategii')}</p></div>
            </div>` : '';

        const wbsHtml = show('wbs') ? `
            <div class="section">
                <div class="section-header">Struktura zadań projektu</div>
                <table>
                    <thead><tr><th>Nazwa</th><th>Typ</th><th>Status</th><th>Osoba</th></tr></thead>
                    <tbody>${wbsData.length ? buildTreeRows(null, 0, false) : '<tr><td colspan="4">Brak danych WBS</td></tr>'}</tbody>
                </table>
            </div>` : '';

        const budgetHtml = show('budget') && isManagerOrAdmin ? `
            <div class="section">
                <div class="section-header">Plan i harmonogram (Budżet)</div>
                <table>
                    <thead><tr><th>Nazwa</th><th>Koszt jedn.</th><th>Ilość</th><th>Marża%</th><th>Koszt sum.</th><th>Suma netto</th></tr></thead>
                    <tbody>${wbsData.length ? buildTreeRows(null, 0, true) : '<tr><td colspan="6">Brak danych budżetowych</td></tr>'}</tbody>
                </table>
            </div>` : '';

        const materialsHtml = show('materials') ? `
            <div class="section">
                <div class="section-header">Materiały</div>
                <table>
                    <thead><tr><th>Nazwa</th><th>Typ</th><th>Ilość</th><th>Produkt</th><th>Producent</th><th>Status</th></tr></thead>
                    <tbody>${materialRowsHtml}</tbody>
                </table>
            </div>` : '';

        const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>Unified WBS — ${date}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 28px 32px; }
  .doc-header { border-bottom: 3px solid #1a1a2e; padding-bottom: 10px; margin-bottom: 22px; }
  .doc-header h1 { font-size: 20px; margin: 0 0 2px 0; }
  .doc-header .sub { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #6b7280; }
  .doc-header .meta { font-size: 10px; color: #9ca3af; margin-top: 4px; }
  .section { margin-bottom: 26px; page-break-inside: avoid; }
  .section-header { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.12em; background: #1a1a2e; color: #fff; padding: 7px 12px; }
  .strategy-text { padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; line-height: 1.7; }
  .strategy-text p { margin: 0 0 10px 0; }
  .strategy-text h3 { font-size: 12px; margin: 14px 0 4px 0; }
  .strategy-text h4 { font-size: 11px; margin: 10px 0 3px 0; color: #374151; }
  .md-h2 { font-size: 13px; margin: 16px 0 5px 0; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #f3f4f6; color: #374151; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #d1d5db; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  td.num { text-align: right; font-family: monospace; font-size: 10px; }
  tr:nth-child(even) td { background: #f9fafb; }
  @media print { @page { margin: 15mm; } body { margin: 0; } }
</style>
</head>
<body>
<div class="doc-header">
  <h1>ERP | Unified WBS</h1>
  <div class="sub">Zarządzanie zasobami i planowaniem</div>
  <div class="meta">Wygenerowano: ${date}</div>
</div>
${strategyHtml}
${wbsHtml}
${budgetHtml}
${materialsHtml}
</body>
</html>`;

        const win = window.open('', '_blank');
        if (!win) { alert('Zezwól na otwieranie pop-upów aby eksportować PDF'); return; }
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 400);
    };

    const addNode = useCallback(async (parentId = null) => {
        try {
            const res = await fetch(`${API_URL}/wbs-nodes`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ nodeId, versionId: versionId || null, parentId, name: 'Nowy element' }),
            });
            if (res.ok) {
                const created = await res.json().catch(() => null);
                setExpandedIds(prev => {
                    const next = new Set(prev);
                    if (parentId) next.add(parentId);
                    if (created?.id) next.add(created.id);
                    return next;
                });
                await refreshUnified();
            }
        } catch (e) { console.error('Add node error:', e); }
    }, [nodeId, versionId, authHeaders, refreshUnified]);

    const deleteNode = useCallback(async () => {
        if (!selectedId || !window.confirm('Usunąć zaznaczony element?')) return;
        try {
            await fetch(`${API_URL}/wbs-nodes/${selectedId}`, { method: 'DELETE', headers: authHeaders() });
            setSelectedId(null);
            await refreshUnified();
        } catch (e) { console.error('Delete node error:', e); }
    }, [selectedId, authHeaders, refreshUnified]);

    const updateNodeField = useCallback(async (id, field, value) => {
        try {
            await fetch(`${API_URL}/wbs-nodes/${id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ [field]: value }),
            });
        } catch (e) { console.error('Update node error:', e); }
    }, [authHeaders]);

    const saveBudgetField = useCallback(async (wbsNodeId, data) => {
        try {
            await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}/budget`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify(data),
            });
        } catch (e) { console.error('Save budget field error:', e); }
    }, [authHeaders]);

    const updateLocalWbsBudgetRow = useCallback((wbsNodeId, patch) => {
        setWbsData(prev => prev.map(item => item.id === wbsNodeId ? { ...item, ...patch } : item));
    }, []);

    const onCellValueChanged = useCallback((params) => {
        const row = params.data;
        if (!row) return;
        const field = params.colDef.field;
        if (['name', 'type', 'status', 'owner'].includes(field)) {
            if (field === 'status') {
                const normalizedType = String(row.type || '').toLowerCase();
                if (normalizedType === 'work') {
                    updateNodeField(row.id, field, row[field]);
                }
            } else {
                updateNodeField(row.id, field, row[field]);
            }
            if (field === 'type') {
                const normalizedType = String(row.type || '').toLowerCase();
                const inheritedFromMaterials = normalizedType === 'material' || normalizedType === 'equipment';
                const quantity = parseFloat(row.quantity) || 1;
                const lookupKey = makeMaterialLookupKey(row.subjectName || row.name, row.name);
                const inheritedCost = parseFloat(materialMetaByLookupKey[lookupKey]?.cost)
                    || parseFloat(row.materialTabCost)
                    || parseFloat(row.materialsTotalCost)
                    || 0;
                const cost = inheritedFromMaterials
                    ? inheritedCost
                    : (Number.isFinite(parseFloat(row.totalCost)) ? parseFloat(row.totalCost) : (parseFloat(row.unitCost) || 0) * quantity);
                const margin = parseFloat(row.margin) || 0;
                row.inheritedFromMaterials = inheritedFromMaterials;
                row.cost = cost;
                row.totalCost = cost;
                row.offerPrice = margin !== 0 ? cost * (1 + margin / 100) : 0;
                row.totalPrice = row.offerPrice;
                updateLocalWbsBudgetRow(row.id, {
                    type: row.type,
                    totalCost: row.totalCost,
                    totalPrice: row.totalPrice,
                    margin: row.margin,
                });
                params.api.applyTransaction({ update: [row] });
            }
        } else {
            const q = parseFloat(row.quantity) || 1;
            const cost = parseFloat(row.cost) || 0;
            const uc = q > 0 ? cost / q : cost;
            const m = parseFloat(row.margin) || 0;
            const d = parseFloat(row.discount) || 0;
            let up = uc;
            if (uc > 0 && m !== 0) up = uc * (1 + m / 100);
            if (d > 0) up = up * (1 - d / 100);

            row.totalCost = cost;
            row.cost = cost;
            row.unitPrice = up;
            row.totalPrice = m !== 0 ? up * q : 0;
            row.offerPrice = row.totalPrice;
            updateLocalWbsBudgetRow(row.id, {
                totalCost: row.totalCost,
                totalPrice: row.totalPrice,
                unitPrice: row.unitPrice,
                unitCost: uc,
                quantity: q,
                margin: m,
                discount: d,
                comment: row.comment ?? '',
            });
            params.api.applyTransaction({ update: [row] });
            saveBudgetField(row.id, {
                unitCost: uc,
                quantity: q,
                margin: m,
                discount: d,
                unitPrice: up,
                comment: row.comment ?? '',
            });
        }
    }, [saveBudgetField, updateNodeField, materialMetaByLookupKey, updateLocalWbsBudgetRow]);

    const buildRows = (view) => {
        const byId = new Map(wbsData.map(item => [item.id, item]));
        const getSubjectName = (item) => {
            let current = item;
            while (current?.parentId) {
                const parent = byId.get(current.parentId);
                if (!parent) break;
                current = parent;
            }
            return current?.name || item.name || '';
        };

        const getInheritedMaterialStatus = (item) => {
            const normalizedType = String(item.type || '').toLowerCase();
            if (!['material', 'equipment'].includes(normalizedType)) return item.status;
            const lookupKey = makeMaterialLookupKey(getSubjectName(item), item.name);
            const lookupStatuses = materialMetaByLookupKey[lookupKey]?.statuses || [];
            if (lookupStatuses.length) return lookupStatuses.join(', ');
            const statuses = Array.from(new Set((item.materials || [])
                .map(m => m.status)
                .filter(Boolean)
                .map(s => MATERIAL_STATUS_LABELS[s] || s)));
            return statuses.length ? statuses.join(', ') : item.status;
        };

        if (view === VIEWS.BUDGET) {
            return [...wbsData]
                .sort((a, b) => (a.path || '').localeCompare(b.path || '', 'pl'))
                .map(item => {
                    const normalizedType = String(item.type || '').toLowerCase();
                    const inheritedFromMaterials = normalizedType === 'material' || normalizedType === 'equipment';
                    const quantity = parseFloat(item.quantity) || 1;
                    const subjectName = getSubjectName(item);
                    const lookupKey = makeMaterialLookupKey(subjectName, item.name);
                    const inheritedCost = parseFloat(materialMetaByLookupKey[lookupKey]?.cost)
                        || parseFloat(materialCostsByNode[item.id])
                        || parseFloat(item.materialsTotalCost)
                        || 0;
                    const cost = inheritedFromMaterials
                        ? inheritedCost
                        : (Number.isFinite(parseFloat(item.totalCost))
                            ? parseFloat(item.totalCost)
                            : (parseFloat(item.unitCost) || 0) * quantity);
                    const clearDerivedFields = inheritedFromMaterials && cost <= 0;
                    const margin = clearDerivedFields ? 0 : (parseFloat(item.margin) || 0);
                    const discount = clearDerivedFields ? 0 : (parseFloat(item.discount) || 0);
                    let offerPrice = margin !== 0 ? cost * (1 + margin / 100) : 0;
                    if (discount > 0) {
                        offerPrice = offerPrice * (1 - discount / 100);
                    }
                    return {
                        ...item,
                        subjectName,
                        status: getInheritedMaterialStatus(item),
                        materialTabCost: inheritedCost,
                        cost,
                        margin,
                        discount,
                        offerPrice,
                        quantity,
                        inheritedFromMaterials,
                    };
                });
        }

        const childrenMap = new Map();
        for (const item of wbsData) {
            const pid = item.parentId || '__root__';
            if (!childrenMap.has(pid)) childrenMap.set(pid, []);
            childrenMap.get(pid).push(item);
        }
        const rows = [];
        const addVisible = (pId, depth) => {
            const children = childrenMap.get(pId || '__root__') || [];
            // Sort by sortOrder if present
            children.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            for (const item of children) {
                rows.push({ ...item, status: getInheritedMaterialStatus(item), _depth: depth, _hasChildren: childrenMap.has(item.id) });
                if (expandedIds.has(item.id)) addVisible(item.id, depth + 1);
            }
        };
        addVisible(null, 0);
        return rows;
    };

    const summarizeBudgetRows = useCallback((rows) => {
        let totalCost = 0;
        let totalRevenue = 0;
        for (const row of rows) {
            const q = parseFloat(row.quantity) || 1;
            const cost = parseFloat(row.cost);
            const revenue = parseFloat(row.offerPrice);
            const fallbackCost = Number.isFinite(parseFloat(row.totalCost)) ? parseFloat(row.totalCost) : (parseFloat(row.unitCost) || 0) * q;
            const fallbackRevenue = Number.isFinite(parseFloat(row.totalPrice)) ? parseFloat(row.totalPrice) : (parseFloat(row.unitPrice) || 0) * q;
            totalCost += Number.isFinite(cost) ? cost : fallbackCost;
            totalRevenue += Number.isFinite(revenue) ? revenue : fallbackRevenue;
        }
        const profit = totalRevenue - totalCost;
        const marginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
        return {
            rows: rows.length,
            totalCost,
            totalRevenue,
            profit,
            marginPct,
        };
    }, []);

    const refreshBudgetSummaryFromApi = useCallback((api) => {
        if (!api) return;
        const rows = [];
        api.forEachNodeAfterFilterAndSort((node) => {
            if (node?.data) rows.push(node.data);
        });
        const next = summarizeBudgetRows(rows);
        setBudgetSummary((prev) => {
            if (
                prev.rows === next.rows
                && prev.totalCost === next.totalCost
                && prev.totalRevenue === next.totalRevenue
                && prev.profit === next.profit
                && prev.marginPct === next.marginPct
            ) return prev;
            return next;
        });
    }, [summarizeBudgetRows]);

    useEffect(() => {
        if (budgetGridApiRef.current) {
            refreshBudgetSummaryFromApi(budgetGridApiRef.current);
            return;
        }
        setBudgetSummary(summarizeBudgetRows(buildRows(VIEWS.BUDGET)));
    }, [wbsData, expandedIds, materialCostsByNode, materialMetaByLookupKey, summarizeBudgetRows, refreshBudgetSummaryFromApi]);

    const displayedBudgetSummary = useMemo(() => {
        const baseRevenue = budgetSummary.totalRevenue;
        const parsedDiscountPercent = Number(String(budgetDiscountPercent).replace(',', '.'));
        const parsedDiscountAmount = Number(String(budgetDiscountAmount).replace(',', '.'));
        const discountAmountFromAmountModule = Number.isFinite(parsedDiscountAmount) ? Math.max(0, parsedDiscountAmount) : 0;
        const discountAmountFromPercentModule = Number.isFinite(parsedDiscountPercent)
            ? Math.max(0, parsedDiscountPercent) / 100 * baseRevenue
            : 0;
        const totalDiscount = discountAmountFromAmountModule + discountAmountFromPercentModule;

        if (totalDiscount <= 0) {
            return budgetSummary;
        }

        const totalRevenue = Math.max(0, baseRevenue - totalDiscount);
        const profit = totalRevenue - budgetSummary.totalCost;
        const marginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
        return {
            ...budgetSummary,
            totalRevenue,
            profit,
            marginPct,
        };
    }, [budgetSummary, budgetDiscountAmount, budgetDiscountPercent]);

    const getColumnDefs = (view) => {
        const nameCol = {
            field: 'name', headerName: 'Nazwa', flex: 1, minWidth: 250,
            cellRenderer: TreeNameRenderer,
            cellRendererParams: { context: { expandedIds, toggleExpand: (id) => setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), selectedId, onSelectRow: setSelectedId } },
            editable: true
        };
        
        const ownerCol = {
            field: 'owner', headerName: 'Osoba', width: 140,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: {
                values: ['', ...projectUsers.map(u => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email)]
            },
            editable: true
        };

        if (view === VIEWS.STRUCTURE) return [
            nameCol, 
            { field: 'type', headerName: 'Typ', width: 100, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: TYPE_OPTIONS }, valueFormatter: p => TYPE_LABELS[p.value] || p.value, editable: true }, 
            {
                field: 'status',
                headerName: 'Status',
                width: 140,
                editable: (params) => String(params.data?.type || '').toLowerCase() === 'work',
                tooltipValueGetter: (params) => String(params.data?.type || '').toLowerCase() === 'work' ? '' : 'Status dziedziczony z zakładki Materiały'
            },
            ownerCol
        ];

        if (view === VIEWS.BUDGET) return [
            { field: 'subjectName', headerName: 'Przedmiot', minWidth: 220, flex: 1, sortable: true, editable: false, headerComponent: BudgetHeaderRenderer },
            { field: 'name', headerName: 'Nazwa', minWidth: 220, flex: 1, sortable: true, editable: true, headerComponent: BudgetHeaderRenderer },
            { field: 'type', headerName: 'Typ', width: 130, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: TYPE_OPTIONS }, valueFormatter: p => TYPE_LABELS[p.value] || p.value, editable: true, sortable: true, headerComponent: BudgetHeaderRenderer },
            {
                field: 'cost',
                headerName: 'Koszt',
                width: 130,
                editable: (params) => !params.data?.inheritedFromMaterials,
                sortable: true,
                valueFormatter: p => fmtPLN(p.value),
                cellClass: (params) => params.data?.inheritedFromMaterials ? 'text-red-300' : '',
                tooltipValueGetter: (params) => params.data?.inheritedFromMaterials ? 'Koszt dziedziczony z zakładki Materiały' : '',
                headerComponent: BudgetHeaderRenderer
            },
            { field: 'margin', headerName: 'Marża (%)', width: 110, editable: true, sortable: true, valueFormatter: p => fmtPct(p.value), cellClass: 'text-green-300', headerComponent: BudgetHeaderRenderer },
            { field: 'discount', headerName: 'Rabat (%)', width: 110, editable: true, sortable: true, valueFormatter: p => fmtPct(p.value), cellClass: 'text-orange-300', headerComponent: BudgetHeaderRenderer },
            { field: 'offerPrice', headerName: 'Cena ofertowa', width: 150, sortable: true, valueFormatter: p => fmtPLN(p.value), headerComponent: BudgetHeaderRenderer },
            { field: 'comment', headerName: 'Komentarz', minWidth: 220, flex: 1, editable: true, sortable: true, headerComponent: BudgetHeaderRenderer }
        ];

        return [nameCol, { field: 'status', width: 100 }];
    };

    const renderGrid = (v) => (
        <div className="flex-1 min-h-[400px]" onDoubleClick={(e) => e.stopPropagation()}>
            <AgGridReact
                ref={gridRef}
                theme={darkTheme}
                modules={MODULES}
                rowData={buildRows(v)}
                columnDefs={getColumnDefs(v)}
                getRowId={p => p.data.id}
                onCellValueChanged={onCellValueChanged}
                onGridReady={v === VIEWS.BUDGET ? (params) => {
                    budgetGridApiRef.current = params.api;
                    refreshBudgetSummaryFromApi(params.api);
                } : undefined}
                onFilterChanged={v === VIEWS.BUDGET ? (params) => refreshBudgetSummaryFromApi(params.api) : undefined}
                onModelUpdated={v === VIEWS.BUDGET ? (params) => refreshBudgetSummaryFromApi(params.api) : undefined}
                defaultColDef={v === VIEWS.BUDGET
                    ? { resizable: true, sortable: true, filter: true, floatingFilter: false }
                    : { resizable: true, sortable: false }}
                singleClickEdit={v === VIEWS.STRUCTURE || v === VIEWS.BUDGET}
                animateRows={true}
            />
        </div>
    );

    const budgetSummaryCards = (
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-2">
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-red-300/90 font-bold">Koszt</div>
                <div className="text-sm font-black text-red-200">{fmtPLNFull(displayedBudgetSummary.totalCost)} PLN</div>
            </div>
            <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-green-300/90 font-bold">Przychód</div>
                <div className="text-sm font-black text-green-200">{fmtPLNFull(displayedBudgetSummary.totalRevenue)} PLN</div>
            </div>
            <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-green-300/90 font-bold">Zysk</div>
                <div className="text-sm font-black text-green-200">{fmtPLNFull(displayedBudgetSummary.profit)} PLN</div>
            </div>
            <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-green-300/90 font-bold">Marża</div>
                <div className="text-sm font-black text-green-200">{fmtPctFull(displayedBudgetSummary.marginPct)}</div>
                <div className="text-[10px] text-green-200/70 mt-0.5">Po filtrze: {displayedBudgetSummary.rows} wierszy</div>
            </div>
            <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-orange-300/90 font-bold">Wartośc %</div>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={budgetDiscountAmount}
                    onChange={(e) => setBudgetDiscountAmount(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 w-full rounded-lg border border-orange-400/25 bg-black/30 px-2 py-1.5 text-sm font-black text-orange-100 focus:outline-none focus:border-orange-400"
                    placeholder="0,00"
                />
                {budgetDiscountAmount !== '' && (
                    <div className="text-[10px] text-orange-200/70 mt-0.5">
                        {(() => {
                            const amount = Number(String(budgetDiscountAmount).replace(',', '.'));
                            const pct = budgetSummary.totalRevenue > 0 && Number.isFinite(amount) ? (Math.max(0, amount) / budgetSummary.totalRevenue) * 100 : 0;
                            return `Przeliczenie tego pola: ${fmtPctFull(pct)}`;
                        })()}
                    </div>
                )}
            </div>
            <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-orange-300/90 font-bold">Wartośc kwotowa</div>
                <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={budgetDiscountPercent}
                    onChange={(e) => setBudgetDiscountPercent(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 w-full rounded-lg border border-orange-400/25 bg-black/30 px-2 py-1.5 text-sm font-black text-orange-100 focus:outline-none focus:border-orange-400"
                    placeholder="0,0"
                />
                {budgetDiscountPercent !== '' && (
                    <div className="text-[10px] text-orange-200/70 mt-0.5">
                        {(() => {
                            const pct = Number(String(budgetDiscountPercent).replace(',', '.'));
                            const amount = Number.isFinite(pct) ? budgetSummary.totalRevenue * Math.max(0, pct) / 100 : 0;
                            return `Przeliczenie tego pola: ${fmtPLNFull(amount)} PLN`;
                        })()}
                    </div>
                )}
            </div>
        </div>
    );

    const renderSection = (key, title, Icon, colorClass, content, onExport, extraButtons = null) => {
        const isActive = expandedSection === key;
        const isFullscreen = fullscreenSection === key;
        if (expandedSection !== null && !isActive && !isFullscreen) return null;

        return (
            <div 
                className={`flex flex-col glass-panel rounded-2xl border border-white/5 transition-all duration-300 overflow-hidden shadow-2xl ${isActive || isFullscreen ? 'bg-white/[0.04]' : 'bg-white/[0.02] hover:bg-white/[0.03] cursor-pointer'}`}
                onDoubleClick={() => setFullscreenSection(isFullscreen ? null : key)}
                style={isFullscreen
                    ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 100, padding: '20px', background: '#0a0c10' }
                    : (isActive ? { minHeight: 'calc(100vh - 200px)' } : {})}
            >
                <div 
                    className={`flex items-center gap-2 px-5 py-3 transition-colors text-left flex-shrink-0 border-b border-white/10 ${isActive ? 'bg-white/[0.07]' : 'bg-white/[0.04]'}`}
                    onClick={() => setExpandedSection(isActive ? null : key)}
                >
                    <Icon size={16} className={`text-${colorClass}-400 flex-shrink-0`} />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-300 font-inter">{title}</h3>
                    <div className="flex-1 px-4">{isActive && extraButtons}</div>
                    <div className="flex items-center gap-2">
                        {onExport && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onExport(); }} 
                                className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-gray-400 text-[10px] font-bold uppercase tracking-widest transition-all"
                            >
                                <FileDown size={11} /> PDF
                            </button>
                        )}
                        <ChevronRight size={14} className={`text-gray-500 transition-transform flex-shrink-0 ${isActive ? 'rotate-90' : ''}`} />
                    </div>
                </div>
                {(isActive || isFullscreen) && (
                    <div className="flex-1 overflow-auto p-4 animate-fade-in custom-scrollbar h-full">
                        {content}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`flex flex-col w-full h-full relative overflow-y-auto pr-2 custom-scrollbar bg-[#0a0c10]/50 rounded-[40px] border border-white/[0.03] ${showGlobalPdfExport ? 'gap-2 p-2 pt-1' : 'gap-1 p-2 pt-0'}`}>
            {/* Global Header */}
            {showGlobalPdfExport && (
                <div className="flex items-center justify-end mb-0">
                    <button 
                        onClick={() => handleExportPDF('all')}
                        className="group relative flex items-center gap-3 px-6 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/20 rounded-2xl text-blue-300 text-xs font-black uppercase tracking-[0.1em] transition-all overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-white/5 to-blue-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        <FileDown size={14} className="group-hover:translate-y-[-2px] transition-transform" /> PDF
                    </button>
                </div>
            )}

            {renderSection('strategy', 'Jak to chcemy zrobić', HelpCircle, 'blue', (
                <div className="flex flex-col gap-4 h-full min-h-[calc(100vh-320px)]">
                    <div className="flex justify-end p-1">
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${strategySaved ? 'text-emerald-400' : 'text-gray-500'}`}>
                            {strategySaving ? 'Oczekiwanie...' : strategySaved ? 'Zapisano pomyślnie' : 'Auto-zapis aktywny'}
                        </span>
                    </div>
                    <textarea 
                        ref={strategyRef}
                        value={wbsDescription}
                        onChange={(e) => { setWbsDescription(e.target.value); handleStrategySave(); }}
                        onBlur={() => handleStrategySave(true)}
                        className="flex-1 w-full bg-black/40 border border-white/10 rounded-xl p-6 text-gray-300 text-sm focus:outline-none focus:border-blue-500 transition-colors custom-scrollbar leading-relaxed"
                        placeholder="Zdefiniuj plan i strategię realizacji projektu..."
                    />
                </div>
            ), () => handleExportPDF('strategy'), (
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); wrapSelection('**', '**', 'pogrubienie'); }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                        title="Pogrubienie"
                    >
                        B
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); prefixSelectionLines('## ', 'Nagłówek sekcji'); }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                        title="Nagłówek H2"
                    >
                        H2
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); prefixSelectionLines('### ', 'Podnagłówek'); }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                        title="Nagłówek H3"
                    >
                        H3
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); prefixSelectionLines('- ', 'punkt listy'); }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                        title="Lista punktowana"
                    >
                        Lista
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); prefixSelectionLines('1. ', 'pierwszy krok'); }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                        title="Lista numerowana"
                    >
                        1.
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setStrategyPreviewOpen(true); }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                        <LayoutList size={11} /> Podgląd
                    </button>
                </div>
            ))}

            {renderSection('wbs', 'Struktura zadań projektu', Layers, 'blue', (
                <div className="flex flex-col gap-4 h-full">
                    <div className="flex items-center gap-2 pb-2">
                        <button onClick={() => addNode(null)} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all">+ Element Główny</button>
                        {selectedId && <button onClick={() => addNode(selectedId)} className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-blue-500/20 transition-all">+ Pod-Element</button>}
                        {selectedId && <button onClick={deleteNode} className="p-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all"><Trash2 size={14} /></button>}
                        <button onClick={refreshUnified} className="ml-auto p-1.5 text-gray-600 hover:text-white transition-all"><RefreshCw size={14} /></button>
                    </div>
                    {renderGrid(VIEWS.STRUCTURE)}
                </div>
            ), () => handleExportPDF('wbs'))}

            {isManagerOrAdmin && renderSection('budget', 'Plan i harmonogram (Budżet)', DollarSign, 'green', (
                <div className="flex flex-col gap-3 h-full">
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-2.5">
                        {budgetSummaryCards}
                    </div>
                    {renderGrid(VIEWS.BUDGET)}
                </div>
            ), () => handleExportPDF('budget'))}

            {renderSection('materials', 'Materiały', Zap, 'yellow', (
                <MaterialRequirementsPanel 
                    ref={materialRef}
                    nodeId={nodeId}
                    versionId={versionId}
                    isEmbedded={true}
                    onWbsUpdate={refreshUnified}
                    userRoles={userRoles}
                />
            ), () => handleExportPDF('materials'), (
                <div className="flex items-center gap-3">
                    <button 
                        onClick={(e) => { e.stopPropagation(); materialRef.current?.handleAddRequirement(); }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-gray-400 text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                        <Plus size={11} /> Dodaj wymaganie
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); materialRef.current?.handleExtract(); }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/10 rounded-lg text-blue-400 text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                        <Sparkles size={11} /> Wyciągnij z dokumentów
                    </button>
                </div>
            ))}

            {strategyPreviewOpen && (
                <div className="fixed inset-0 z-[120] bg-[#05070bcc] backdrop-blur-sm flex flex-col">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0b0f17]">
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Podgląd: Jak to chcemy zrobić</h3>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Pełny viewport</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleExportPDF('strategy')}
                                className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/20 rounded-lg text-blue-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                            >
                                <FileDown size={11} /> PDF
                            </button>
                            <button
                                onClick={() => setStrategyPreviewOpen(false)}
                                className="p-2 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"
                                aria-label="Zamknij podgląd"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto px-8 py-6 custom-scrollbar">
                        <div className="mx-auto max-w-5xl bg-black/40 border border-white/10 rounded-2xl p-8 min-h-full text-gray-200 leading-relaxed">
                            <div
                                className="prose prose-invert max-w-none"
                                dangerouslySetInnerHTML={{ __html: `<p>${renderStrategyHtml(wbsDescription || 'Brak treści strategii')}</p>` }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
