import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ExcelJS from 'exceljs';
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
import { fmtPLN, fmtPLNFull, fmtQty, fmtPct, fmtPctFull, STRUCTURE_STATUS_META, STRUCTURE_COMMON_CELL_CLASS, normKey, makeMaterialLookupKey, parseLocaleNumber, normalizeStatusCode } from './wbsConstants';

const darkTheme = themeQuartz.withParams({
    backgroundColor: '#0a0a0f',
    foregroundColor: '#e5e7eb',
    headerBackgroundColor: '#111118',
    headerTextColor: '#9ca3af',
    rowHoverColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
    cellHorizontalPaddingScale: 0.6,
    fontSize: 13,
    headerFontSize: 12,
    rowHeight: 32,
    headerHeight: 34,
});

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

const TYPE_LABELS = { work: 'Praca', material: 'Materiał', equipment: 'Sprzęt', service: 'Usługa', lodging: 'Nocleg', fuel: 'Paliwo' };
const TYPE_OPTIONS = ['', 'work', 'material', 'equipment', 'service', 'lodging', 'fuel'];
const BUDGET_TYPE_LABELS = { WORK: 'Praca', MATERIAL: 'Materiał', EXTERNAL_SERVICE: 'Usługa Obca' };
const UNIT_OPTIONS = [
    'sztuki',
    'kilometry',
    'metry',
    'dni',
    'godziny',
    'tygodnie',
    'miesiące',
    'l',
    'kg',
    't',
    'm2',
    'm3',
    'kpl',
    'rbh',
    'kurs',
    'usługa',
    'pakiet',
];
const MATERIAL_STATUS_LABELS = {
    PENDING: 'Oczekuje',
    PROPOSAL: 'Propozycja',
    CONFIRMED: 'Potwierdzone',
    REJECTED: 'Odrzucone',
    ORDERED: 'Zamówione',
};

const getStatusLabel = (code, fallback = '') => {
    const normalized = normalizeStatusCode(code);
    return STRUCTURE_STATUS_META[normalized]?.label || fallback || String(code || '').trim() || 'Brak';
};

const excelColumnLetter = (num) => {
    let n = Number(num) || 0;
    let out = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        out = String.fromCharCode(65 + rem) + out;
        n = Math.floor((n - 1) / 26);
    }
    return out || 'A';
};

const excelCellToText = (cellValue) => {
    if (cellValue == null) return '';
    if (typeof cellValue === 'object') {
        if (Array.isArray(cellValue.richText)) {
            return cellValue.richText.map((t) => t.text || '').join('');
        }
        if (cellValue.text != null) return String(cellValue.text);
        if (cellValue.result != null) return String(cellValue.result);
    }
    return String(cellValue);
};

function TreeNameRenderer({ data, context, api, rowIndex, column }) {
    const depth = data._depth || 0;
    const hasChildren = data._hasChildren;
    const expanded = context?.expandedIds?.has(data.id);
    const toggleExpand = context?.toggleExpand;
    const isSelected = context?.selectedId === data.id;
    const onAddChild = context?.onAddChild;
    const onSelectRow = context?.onSelectRow;
    const isRequirementLeaf = data?._isRequirementLeaf;

    return (
        <div
            className={`flex items-center gap-1 cursor-pointer ${isSelected ? 'ring-1 ring-cyan-500/40 rounded px-1 -mx-1' : ''}`}
            style={{ paddingLeft: depth * 20 }}
            onClick={() => onSelectRow?.(data.id)}
        >
            {hasChildren ? (
                <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand?.(data.id); }}
                    className="text-gray-500 hover:text-white"
                >
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
            ) : <span className="w-4" />}
            {isRequirementLeaf && <Package size={12} className="text-blue-400/70 flex-shrink-0" />}
            <span
                className={`truncate ${depth === 0 ? 'font-semibold text-white' : isRequirementLeaf ? 'text-blue-200' : 'text-gray-300'}`}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!isRequirementLeaf && api) {
                        api.startEditingCell({ rowIndex, colKey: column.getColId() });
                    }
                }}
            >
                {data.name}
            </span>
            {!isRequirementLeaf && (
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onAddChild?.(data.id);
                    }}
                    className="ml-1 text-gray-500 hover:text-emerald-400"
                    title="Dodaj podgałąź"
                >
                    <Plus size={12} />
                </button>
            )}
            {!isRequirementLeaf && data.materialsCount > 0 && (
                <span className="text-[10px] text-blue-400/60 ml-1">({data.materialsCount})</span>
            )}
        </div>
    );
}

function StructureStatusRenderer({ value, data }) {
    const code = normalizeStatusCode(value);
    const meta = STRUCTURE_STATUS_META[code] || { label: data?.statusLabel || getStatusLabel(code), color: 'text-gray-300' };
    const label = data?.statusLabel || meta.label;
    return (
        <span className={`inline-flex items-center text-xs font-semibold ${meta.color}`}>
            {label}
        </span>
    );
}

function BudgetHeaderRenderer(params) {
    const sort = params.column?.getSort?.() || null;
    const SortIcon = sort === 'asc' ? ArrowUp : sort === 'desc' ? ArrowDown : ArrowUpDown;
    return (
        <div
            className="flex items-center gap-1 w-full cursor-pointer select-none"
            onClick={() => params.progressSort?.()}
        >
            <span className="truncate text-gray-400 text-[11px] uppercase tracking-wider font-bold">
                {params.displayName}
            </span>
            <SortIcon size={11} className={sort ? 'text-cyan-400' : 'text-gray-600'} />
        </div>
    );
}

function RowActionsRenderer({ data, context }) {
    if (data?._isRequirementLeaf) return null;

    return (
        <div className="h-full flex items-center justify-end pr-1">
            <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    context?.onDeleteRow?.(data?.id);
                }}
                className="text-gray-500 hover:text-red-400"
                title="Usuń węzeł"
            >
                <Trash2 size={13} />
            </button>
        </div>
    );
}

function MarkerIconsRenderer({ data, context }) {
    if (!data) return null;

    const links = context?.markerLinksCache?.[data.id] || [];
    const allAtts = links.flatMap((l) => (l.marker?.attachments || []));
    if (allAtts.length === 0) return <span className="text-[10px] text-gray-600">-</span>;

    const openAttachment = context?.onOpenAttachment;

    const iconFor = (fileType) => {
        if (fileType === 'IMAGE') return '🖼';
        if (fileType === 'AUDIO') return '🎵';
        return '📎';
    };

    return (
        <div className="flex items-center gap-1" title={allAtts.map((a) => a.fileName).join('\n')}>
            {allAtts.slice(0, 4).map((att) => (
                <span key={att.id}>{iconFor(att.fileType)}</span>
            ))}
        </div>
    );
}


// ─── Main Component ─────────────────────────────────────────────────────────

export default function UnifiedWbsPanel({ nodeId, versionId, onWbsUpdate, userRoles = [], projectName = '', searchQuery = '', setLeftVisible, setAiVisible }) {
    const [wbsData, setWbsData] = useState([]);
    const [expandedSection, setExpandedSection] = useState(() => {
        // Jeśli nie ma żadnego węzła głównego, domyślnie rozwijaj sekcję WBS
        if (wbsData && wbsData.filter(n => n.parentId == null).length === 0) return 'wbs';
        return null;
    });
    const [fullscreenSection, setFullscreenSection] = useState(null);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [selectedId, setSelectedId] = useState(null);
    const [wbsDescription, setWbsDescription] = useState('');
    const [strategyPreviewOpen, setStrategyPreviewOpen] = useState(false);
    const [strategySaving, setStrategySaving] = useState(false);
    const [strategySaved, setStrategySaved] = useState(false);
    const [projectUsers, setProjectUsers] = useState([]);
    const [nodeTeamIds, setNodeTeamIds] = useState([]);
    const [logistykUsers, setLogistykUsers] = useState([]);
    const [materialCostsByNode, setMaterialCostsByNode] = useState({});
    const [materialMetaByLookupKey, setMaterialMetaByLookupKey] = useState({});
    const [requirementsQtyByNode, setRequirementsQtyByNode] = useState({});
    const [requirementByNodeId, setRequirementByNodeId] = useState({});
    const [budgetDiscountAmount, setBudgetDiscountAmount] = useState('');
    const [budgetDiscountPercent, setBudgetDiscountPercent] = useState('');
    const [budgetSummary, setBudgetSummary] = useState({
        rows: 0,
        totalCost: 0,
        totalRevenue: 0,
        profit: 0,
        marginPct: 0,
    });
    const [markerLinksCache, setMarkerLinksCache] = useState({});
    const [previewAttachment, setPreviewAttachment] = useState(null);
    const [budgetImportOpen, setBudgetImportOpen] = useState(false);
    const [budgetImportLoading, setBudgetImportLoading] = useState(false);
    const [budgetImportSheets, setBudgetImportSheets] = useState([]);
    const [budgetImportSheetName, setBudgetImportSheetName] = useState('');
    const [budgetImportRows, setBudgetImportRows] = useState([]);
    const [budgetImportFileName, setBudgetImportFileName] = useState('');
    const [budgetImportHeaderRow, setBudgetImportHeaderRow] = useState(1);
    const [budgetImportLastRow, setBudgetImportLastRow] = useState(1);
    const [budgetImportMapping, setBudgetImportMapping] = useState({});

    const gridRef = useRef();
    const budgetGridApiRef = useRef(null);
    const materialRef = useRef();
    const strategyRef = useRef();
    const strategySaveTimeout = useRef(null);
    const budgetImportFileInputRef = useRef(null);
    const reqDropTargetRef = useRef(null);

    const isLogistyk = userRoles.includes('LOGISTYK');
    const isManagerOrAdmin = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
    const normalizedSearchQuery = String(searchQuery || '').trim().toLowerCase();

    const [extractingForWbs, setExtractingForWbs] = useState(false);
    const [unassignedRequirements, setUnassignedRequirements] = useState([]);
    const [allRequirements, setAllRequirements] = useState([]);
    const [reqRefreshKey, setReqRefreshKey] = useState(0);

    const assignableProjectUsers = useMemo(() => {
        if (!Array.isArray(projectUsers) || projectUsers.length === 0) return [];
        if (!Array.isArray(nodeTeamIds) || nodeTeamIds.length === 0) return projectUsers;

        const usersWithTeams = projectUsers.filter((u) => Array.isArray(u?.teams) && u.teams.length > 0);
        if (usersWithTeams.length === 0) return projectUsers;

        return usersWithTeams.filter((u) => u.teams.some((t) => nodeTeamIds.includes(t.id)));
    }, [projectUsers, nodeTeamIds]);

    const assignableOwnerValues = useMemo(() => {
        const names = assignableProjectUsers
            .map((u) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email)
            .filter(Boolean);
        return ['', ...Array.from(new Set(names))];
    }, [assignableProjectUsers]);

    const token = () => sessionStorage.getItem('token');
    const authHeaders = useCallback(() => ({
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
    }), []);

    const fetchUnassignedRequirements = useCallback(async () => {
        if (!nodeId) return;
        try {
            const res = await fetch(`${API_URL}/material-requirements/node/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: authHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.items || []);
            setAllRequirements(list);
            const unassigned = list.filter(r => {
                try { return Object.keys(JSON.parse(r.wbsNodeAllocations || '{}')).length === 0; } catch { return true; }
            });
            setUnassignedRequirements(unassigned);
        } catch (err) {
            console.error('[WBS fetchUnassigned]', err);
        }
    }, [nodeId, versionId, authHeaders]);

    const handleWbsExtract = useCallback(async () => {
        if (!nodeId || !isManagerOrAdmin) return;
        setExtractingForWbs(true);
        try {
            const url = `${API_URL}/material-requirements/extract/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`;
            const res = await fetch(url, { method: 'POST', headers: authHeaders() });
            if (!res.ok) throw new Error('Extract failed');
            await fetchUnassignedRequirements();
        } catch (err) {
            console.error('[WBS extract]', err);
        } finally {
            setExtractingForWbs(false);
        }
    }, [nodeId, versionId, isManagerOrAdmin, authHeaders, fetchUnassignedRequirements]);

    const normalizeImportedType = (value) => {
        const raw = normKey(value);
        if (!raw) return '';
        if (['work', 'praca', 'robocizna'].includes(raw)) return 'work';
        if (['material', 'materiał', 'materialy', 'materiały'].includes(raw)) return 'material';
        if (['equipment', 'sprzet', 'sprzęt', 'urzadzenie', 'urządzenie'].includes(raw)) return 'equipment';
        if (['service', 'usluga', 'usługa'].includes(raw)) return 'service';
        if (['lodging', 'nocleg', 'noclegi'].includes(raw)) return 'lodging';
        if (['fuel', 'paliwo', 'paliwa'].includes(raw)) return 'fuel';
        return raw;
    };

    const buildBudgetImportAutoMapping = useCallback((header) => {
        const autoMapping = {};
        const safeHeader = Array.isArray(header) ? header : [];
        const findCol = (patterns) => safeHeader.findIndex((h) => patterns.some((p) => normKey(h).includes(p)));
        const setMapped = (key, patterns) => {
            const idx = findCol(patterns);
            if (idx >= 0) autoMapping[key] = String(idx);
        };
        setMapped('subjectName', ['przedmiot', 'subject']);
        setMapped('name', ['nazwa', 'pozycja', 'element', 'opis']);
        setMapped('type', ['typ', 'type']);
        setMapped('quantity', ['ilosc', 'ilość', 'qty', 'quantity']);
        setMapped('unit', ['jednost', 'unit', 'jm']);
        setMapped('unitCost', ['koszt jednostk', 'cena jednostk', 'unit cost']);
        setMapped('totalCost', ['koszt cal', 'koszt cał', 'wartosc', 'wartość', 'suma']);
        setMapped('margin', ['marza', 'marża', 'margin']);
        setMapped('discount', ['rabat', 'discount']);
        setMapped('comment', ['komentarz', 'uwagi', 'comment', 'notes']);
        return autoMapping;
    }, []);

    const budgetImportColumnOptions = useMemo(() => {
        const header = budgetImportRows[budgetImportHeaderRow - 1] || [];
        return header.map((value, idx) => ({
            value: String(idx),
            label: `${excelColumnLetter(idx + 1)} - ${value || '(pusta)'}`,
        }));
    }, [budgetImportRows, budgetImportHeaderRow]);

    const handleBudgetImportFileChange = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const buffer = await file.arrayBuffer();
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buffer);
            const worksheets = wb.worksheets || [];
            if (!worksheets.length) {
                alert('Plik Excel nie zawiera arkusza.');
                return;
            }

            const parsedSheets = worksheets.map((sheet, idx) => {
                const rowCount = sheet.rowCount || 0;
                const colCount = sheet.columnCount || 0;
                const rows = [];
                for (let r = 1; r <= rowCount; r++) {
                    const rowValues = [];
                    for (let c = 1; c <= colCount; c++) {
                        rowValues.push(excelCellToText(sheet.getRow(r).getCell(c).value).trim());
                    }
                    rows.push(rowValues);
                }
                return {
                    name: sheet.name || `Arkusz ${idx + 1}`,
                    rows,
                };
            });

            const firstSheet = parsedSheets[0];
            const rows = firstSheet?.rows || [];
            const header = rows[0] || [];

            setBudgetImportSheets(parsedSheets);
            setBudgetImportSheetName(firstSheet?.name || '');
            setBudgetImportRows(rows);
            setBudgetImportFileName(file.name);
            setBudgetImportHeaderRow(1);
            setBudgetImportLastRow(Math.max(1, rows.length));
            setBudgetImportMapping(buildBudgetImportAutoMapping(header));
            setBudgetImportOpen(true);
        } catch (e) {
            console.error('Budget Excel parse error:', e);
            alert('Nie udało się odczytać pliku Excel.');
        } finally {
            if (event.target) event.target.value = '';
        }
    }, [buildBudgetImportAutoMapping]);

    const fetchData = useCallback(async (listIdOverride = null) => {
        try {
            let nextRequirementsQtyByNode = {};
            const res = await fetch(`${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) {
                const data = await res.json();
                setWbsData(data.items || []);
                nextRequirementsQtyByNode = Object.fromEntries(
                    (data.items || [])
                        .filter((n) => n?.id != null && Number.isFinite(Number(n.quantity)))
                        .map((n) => [n.id, Number(n.quantity)])
                );
                // Expand top-level and second-level nodes by default
                const autoExpandIds = (data.items || []).filter(n => n.depth === 0 || n.depth === 1).map(n => n.id);
                setExpandedIds(prev => {
                    const next = new Set(prev);
                    autoExpandIds.forEach(id => next.add(id));
                    return next;
                });
            }

            const materialsParams = new URLSearchParams();
            if (versionId) materialsParams.append('versionId', String(versionId));
            if (listIdOverride) materialsParams.append('listId', String(listIdOverride));
            const materialsQuery = materialsParams.toString();
            const materialsRes = await fetch(`${API_URL}/material-requirements/node/${nodeId}${materialsQuery ? `?${materialsQuery}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
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

                // Build WBS node ID → root parent name map from relational WBS data
                const wbsNodesById = new Map((wbsData || []).map(n => [n.id, n]));
                const wbsNodeToRootName = {};
                for (const node of (wbsData || [])) {
                    let current = node;
                    while (current?.parentId) {
                        const parent = wbsNodesById.get(current.parentId);
                        if (!parent) break;
                        current = parent;
                    }
                    wbsNodeToRootName[node.id] = current?.name || '';
                    // Also map to direct parent name for nodes at depth 1
                    if (!projectItemNamesById[node.id] && current?.name) {
                        projectItemNamesById[node.id] = current.name;
                    }
                }

                for (const req of Array.isArray(requirements) ? requirements : []) {
                    const statusCode = normalizeStatusCode(req.status);
                    const selected = (req.proposals || []).find((p) => p.isSelected);
                    const unitNet = parseFloat(req.priceNetto ?? selected?.priceNetto) || 0;
                    const nameCandidates = Array.from(new Set([
                        req.name,
                    ].filter(Boolean).map(name => String(name).trim())));

                    const registerLookupMeta = (subjectName, quantity) => {
                        if (!subjectName || !nameCandidates.length) return;
                        for (const candidateName of nameCandidates) {
                            const key = makeMaterialLookupKey(subjectName, candidateName);
                            if (!nextLookupMeta[key]) {
                                nextLookupMeta[key] = { statuses: [], cost: 0, quantity: 0, unit: '' };
                            }
                            if (statusCode && !nextLookupMeta[key].statuses.includes(statusCode)) {
                                nextLookupMeta[key].statuses.push(statusCode);
                            }
                            if (quantity > 0) {
                                nextLookupMeta[key].quantity += quantity;
                            }
                            if (!nextLookupMeta[key].unit && req.unit) {
                                nextLookupMeta[key].unit = String(req.unit);
                            }
                            if (unitNet > 0 && quantity > 0) {
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
                            if (unitNet > 0) {
                                nextCosts[wbsNodeId] = (nextCosts[wbsNodeId] || 0) + unitNet * qty;
                            }
                        }
                        continue;
                    }

                    if (req.wbsNodeId) {
                        const qty = parseFloat(req.quantity) || 0;
                        if (qty > 0) {
                            registerLookupMeta(projectItemNamesById[req.wbsNodeId], qty);
                            if (unitNet > 0) {
                                nextCosts[req.wbsNodeId] = (nextCosts[req.wbsNodeId] || 0) + unitNet * qty;
                            }
                        }
                    }
                }
                setMaterialCostsByNode(nextCosts);
                setMaterialMetaByLookupKey(nextLookupMeta);
            }
            setRequirementsQtyByNode(nextRequirementsQtyByNode);
        } catch (e) { console.error('Fetch WBS error:', e); }
    }, [nodeId, versionId, wbsData]);

    const syncMaterialRequirementsFromWbsQuantity = useCallback(async (wbsNodeId, quantityRaw, wbsNodeName = '') => {
        const nextQuantity = parseFloat(quantityRaw);
        if (!wbsNodeId || !Number.isFinite(nextQuantity) || nextQuantity < 0) return;

        try {
            const res = await fetch(`${API_URL}/material-requirements/node/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
            if (!res.ok) return;
            const requirements = await res.json();
            if (!Array.isArray(requirements) || !requirements.length) return;

            const normalizedNodeName = normKey(wbsNodeName);
            const linked = (requirements || []).filter((req) => {
                if (!req || !['MATERIAL', 'DEVICE'].includes(String(req.type || '').toUpperCase())) return false;
                let alloc = {};
                try { alloc = req.wbsNodeAllocations ? JSON.parse(req.wbsNodeAllocations) : {}; } catch { alloc = {}; }
                let ids = [];
                try {
                    const parsedIds = req.wbsNodeIds ? JSON.parse(req.wbsNodeIds) : [];
                    ids = Array.isArray(parsedIds) ? parsedIds : [];
                } catch {
                    ids = [];
                }
                return req.wbsNodeId === wbsNodeId || ids.includes(wbsNodeId) || Object.prototype.hasOwnProperty.call(alloc || {}, wbsNodeId);
            });

            if (!linked.length) return;

            const exactByName = linked.find((req) => {
                if (!normalizedNodeName) return false;
                return normKey(req.name) === normalizedNodeName;
            });
            const targetReq = exactByName || linked[0];

            let currentAlloc = {};
            try { currentAlloc = targetReq.wbsNodeAllocations ? JSON.parse(targetReq.wbsNodeAllocations) : {}; } catch { currentAlloc = {}; }
            const nextAlloc = { ...(currentAlloc || {}), [wbsNodeId]: nextQuantity };
            const totalQty = Object.values(nextAlloc).reduce((sum, value) => sum + (parseFloat(value) || 0), 0);

            await fetch(`${API_URL}/material-requirements/${targetReq.id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({
                    quantity: totalQty,
                    wbsNodeId: targetReq.wbsNodeId || wbsNodeId,
                    wbsNodeIds: targetReq.wbsNodeIds || JSON.stringify([wbsNodeId]),
                    wbsNodeAllocations: Object.keys(nextAlloc).length > 0 ? JSON.stringify(nextAlloc) : null,
                    isAiAssigned: false,
                }),
            });
            await fetchData();
        } catch (e) {
            console.error('Sync material requirements from WBS quantity error:', e);
        }
    }, [nodeId, versionId, authHeaders, fetchData]);

    // Zwinięcie sidebara na wejściu do Planowanie
    useEffect(() => {
        setLeftVisible?.(false);
        setAiVisible?.(false);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Zwinięcie sidebara przy każdej zmianie sekcji
    useEffect(() => {
        setLeftVisible?.(false);
        setAiVisible?.(false);
    }, [expandedSection, setLeftVisible, setAiVisible]);

    useEffect(() => {
        let active = true;

        const loadMarkerLinks = async () => {
            const nodeIds = Array.from(new Set(wbsData.map(n => n.id).filter(Boolean)));
            if (nodeIds.length === 0) {
                if (active) setMarkerLinksCache({});
                return;
            }

            const entries = await Promise.all(nodeIds.map(async (id) => {
                try {
                    const res = await fetch(`${API_URL}/schematics/wbs-node-markers/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
                    const data = res.ok ? await res.json() : [];
                    return [id, data];
                } catch {
                    return [id, []];
                }
            }));

            if (active) setMarkerLinksCache(Object.fromEntries(entries));
        };

        loadMarkerLinks();
        return () => { active = false; };
    }, [wbsData]);

    const fetchUsers = useCallback(async () => {
        const t = token();
        if (!t) return;
        try {
            const [usersRes, logistykRes, permissionsRes] = await Promise.all([
                fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${t}` } }),
                fetch(`${API_URL}/users/by-role/LOGISTYK`, { headers: { Authorization: `Bearer ${t}` } }),
                nodeId
                    ? fetch(`${API_URL}/process-tree/${nodeId}/permissions`, { headers: { Authorization: `Bearer ${t}` } })
                    : Promise.resolve(null),
            ]);

            setProjectUsers(usersRes?.ok ? await usersRes.json() : []);
            setLogistykUsers(logistykRes?.ok ? await logistykRes.json() : []);

            if (permissionsRes?.ok) {
                const permissionsData = await permissionsRes.json();
                const teamIds = Array.from(new Set(
                    (permissionsData?.permissions || [])
                        .filter((p) => p.teamId)
                        .map((p) => p.teamId)
                ));
                setNodeTeamIds(teamIds);
            } else {
                setNodeTeamIds([]);
            }
        } catch {
            setProjectUsers([]);
            setLogistykUsers([]);
            setNodeTeamIds([]);
        }
    }, [nodeId]);

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
            fetchUnassignedRequirements();
        } 
    }, [nodeId, versionId, fetchData, fetchUsers, fetchStrategy, fetchUnassignedRequirements]);

    const refreshUnified = useCallback(async (listId = null) => {
        await fetchData(listId);
        onWbsUpdate?.();
    }, [fetchData, onWbsUpdate]);

    const handleRequirementAssignToWbs = useCallback(async (wbsNodeId, reqId) => {
        if (!wbsNodeId || !reqId) return;
        try {
            const req = unassignedRequirements.find(r => r.id === reqId);
            const qty = parseFloat(req?.quantity) || 1;
            const alloc = { [wbsNodeId]: qty };
            const res = await fetch(`${API_URL}/material-requirements/${reqId}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ wbsNodeId, wbsNodeAllocations: JSON.stringify(alloc) }),
            });
            if (!res.ok) throw new Error('Assign failed');

            setUnassignedRequirements(prev => prev.filter(r => r.id !== reqId));
            setAllRequirements(prev => prev.map(r => r.id === reqId ? { ...r, wbsNodeAllocations: JSON.stringify(alloc) } : r));

            // Utwórz węzeł WBS pod docelową gałęzią (tag req: do synchronizacji z Materiały)
            const reqName = String(req?.name || req?.productName || '').trim();
            const typeMap = { DEVICE: 'equipment', MATERIAL: 'material', CABLE: 'material', SOFTWARE: 'service', SERVICE: 'service' };
            const nodeType = typeMap[String(req?.type || '').toUpperCase()] || '';
            if (reqName) {
                // Sprawdź czy węzeł z tagiem req: już istnieje
                const existing = wbsData.find(n =>
                    Array.isArray(n.tags) && n.tags.includes(`req:${reqId}`)
                );
                if (!existing) {
                    await fetch(`${API_URL}/wbs-nodes`, {
                        method: 'POST',
                        headers: authHeaders(),
                        body: JSON.stringify({
                            nodeId, versionId: versionId || undefined, parentId: wbsNodeId,
                            name: reqName, type: nodeType, tags: [`req:${reqId}`, 'auto-requirement'],
                        }),
                    }).catch(() => {});
                }
            }

            setReqRefreshKey(k => k + 1);
            // Rozwiń gałąź docelową aby nowy węzeł był widoczny
            setExpandedIds(prev => {
                const next = new Set(prev);
                next.add(wbsNodeId);
                return next;
            });
            await refreshUnified();
        } catch (err) {
            console.error('[WBS assign]', err);
        }
    }, [authHeaders, refreshUnified, unassignedRequirements, wbsData, nodeId, versionId]);

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

        const markerSummary = (nodeId) => {
            const links = markerLinksCache[nodeId] || [];
            const allAtts = links.flatMap((l) => (l.marker?.attachments || []));
            if (allAtts.length === 0) return '';

            const itemsHtml = allAtts.map((a) => {
                const url = `${API_URL}/schematics/file/${a.fileUrl || ''}`;
                const name = esc(a.fileName || 'plik');
                if (a.fileType === 'IMAGE' && a.fileUrl) {
                    return `<div style="margin:4px 0 8px 0;">
                        <div style="font-size:10px;color:#4b5563;margin-bottom:3px;">${name}</div>
                        <img src="${esc(url)}" alt="${name}" style="max-width:260px;width:100%;height:auto;object-fit:contain;border:1px solid #d1d5db;border-radius:4px;" />
                    </div>`;
                }
                return `<div style="font-size:10px;color:#374151;margin:2px 0;">📎 ${name}</div>`;
            }).join('');

            return `<div><div style="font-size:10px;color:#111827;font-weight:bold;margin-bottom:4px;">📎 ${allAtts.length}</div>${itemsHtml}</div>`;
        };

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
                    <td>${esc(n.unit || 'sztuki')}</td>
                    <td class="num">${fmtPct(n.margin)}</td>
                    <td class="num">${fmtPLN(n.totalCost)}</td>
                    <td class="num">${fmtPLN(n.totalPrice)}</td>` : `
                    <td>${esc(TYPE_LABELS[n.type] || n.type || '')}</td>
                    <td>${esc(n.status || '')}</td>
                    <td>${esc(n.owner || '')}</td>
                    <td>${markerSummary(n.id)}</td>`;
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
                    <thead><tr><th>Nazwa</th><th>Typ</th><th>Status</th><th>Osoba</th><th>Znaczniki</th></tr></thead>
                    <tbody>${wbsData.length ? buildTreeRows(null, 0, false) : '<tr><td colspan="5">Brak danych WBS</td></tr>'}</tbody>
                </table>
            </div>` : '';

        const budgetHtml = show('budget') && isManagerOrAdmin ? `
            <div class="section">
                <div class="section-header">Plan i harmonogram (Budżet)</div>
                <table>
                    <thead><tr><th>Nazwa</th><th>Koszt jednostkowy</th><th>Ilość</th><th>Jednostki</th><th>Marża%</th><th>Koszt całościowy</th><th>Suma netto</th></tr></thead>
                    <tbody>${wbsData.length ? buildTreeRows(null, 0, true) : '<tr><td colspan="7">Brak danych budżetowych</td></tr>'}</tbody>
                </table>
            </div>` : '';

        const matStatusLabel = (code) => {
            const labels = { PENDING: 'Oczekuje', PROPOSAL: 'Propozycja', CONFIRMED: 'Potwierdzone', REJECTED: 'Odrzucone', ORDERED: 'Zamówione', IN_STOCK: 'Na magazynie', ISSUED: 'Wydane' };
            return labels[code] || code || '—';
        };
        const matTypeLabel = (code) => {
            const labels = { DEVICE: 'Urządzenie', MATERIAL: 'Materiał', CABLE: 'Kabel', SOFTWARE: 'Oprogramowanie', SERVICE: 'Usługa' };
            return labels[String(code || '').toUpperCase()] || code || '—';
        };
        const materialsHtml = show('materials') ? (() => {
            const reqs = allRequirements.filter(r => r.id);
            if (!reqs.length) return '';
            const rows = reqs.map(r => {
                const name = esc(r.name || r.productName || '—');
                const type = esc(matTypeLabel(r.type));
                const qty = r.quantity != null ? `${r.quantity}` : '—';
                const unit = esc(r.unit || '');
                const status = esc(matStatusLabel(r.status));
                const spec = esc(String(r.technicalSpec || '').slice(0, 120));
                const price = r.priceNetto != null ? fmtPLN(r.priceNetto) : '—';
                return `<tr><td>${name}</td><td>${type}</td><td class="num">${qty}</td><td>${unit}</td><td>${status}</td><td class="num">${price}</td><td style="font-size:9px;color:#6b7280">${spec}</td></tr>`;
            }).join('');
            return `
            <div class="section">
                <div class="section-header">Materiały</div>
                <table>
                    <thead><tr><th>Nazwa</th><th>Typ</th><th>Ilość</th><th>Jedn.</th><th>Status</th><th>Cena netto</th><th>Specyfikacja</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        })() : '';

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

    const handleExportBudgetExcel = async () => {
        const rows = [];
        if (budgetGridApiRef.current) {
            budgetGridApiRef.current.forEachNodeAfterFilterAndSort((node) => {
                if (node?.data) rows.push(node.data);
            });
        } else {
            rows.push(...buildRows(VIEWS.BUDGET));
        }

        if (!rows.length) {
            alert('Brak danych budżetowych do eksportu.');
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const summarySheet = workbook.addWorksheet('Podsumowanie');
        const budgetSheet = workbook.addWorksheet('Budzet');
        const exportDate = new Date().toLocaleDateString('pl-PL');
        const fileProjectName = String(projectName || 'projekt').trim() || 'projekt';
        const safeProjectName = fileProjectName.replace(/[\\/:*?"<>|]+/g, '_');
        const summary = summarizeBudgetRows(rows);
        const parsedPercentDiscount = Number(String(budgetDiscountPercent).replace(',', '.'));
        const parsedAmountDiscount = Number(String(budgetDiscountAmount).replace(',', '.'));
        const discountAmountFromPercent = Number.isFinite(parsedPercentDiscount)
            ? Math.max(0, parsedPercentDiscount) / 100 * summary.totalRevenue
            : 0;
        const discountAmountFromValue = Number.isFinite(parsedAmountDiscount) ? Math.max(0, parsedAmountDiscount) : 0;
        const exportedTotalDiscount = discountAmountFromPercent + discountAmountFromValue;
        const exportedRevenueAfterDiscount = Math.max(0, summary.totalRevenue - exportedTotalDiscount);
        const exportedProfitAfterDiscount = exportedRevenueAfterDiscount - summary.totalCost;
        const exportedMarginAfterDiscount = exportedRevenueAfterDiscount > 0
            ? (exportedProfitAfterDiscount / exportedRevenueAfterDiscount) * 100
            : 0;
        const totalQuantity = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
        const averageDiscount = rows.length
            ? rows.reduce((sum, row) => sum + (Number(row.discount) || 0), 0) / rows.length
            : 0;
        const weightedUnitCost = totalQuantity > 0 ? summary.totalCost / totalQuantity : 0;

        summarySheet.columns = [
            { width: 28 },
            { width: 22 },
        ];
        summarySheet.addRow([`Budżet projektu`, fileProjectName]);
        summarySheet.addRow(['Data eksportu', exportDate]);
        summarySheet.addRow(['Liczba wierszy', summary.rows]);
        summarySheet.addRow(['Koszt całkowity', summary.totalCost]);
        summarySheet.addRow(['Przychód przed rabatami', summary.totalRevenue]);
        summarySheet.addRow(['Rabat procentowy', parsedPercentDiscount / 100 || 0]);
        summarySheet.addRow(['Rabat kwotowy', discountAmountFromValue]);
        summarySheet.addRow(['Łączny rabat', exportedTotalDiscount]);
        summarySheet.addRow(['Przychód po rabatach', exportedRevenueAfterDiscount]);
        summarySheet.addRow(['Zysk po rabatach', exportedProfitAfterDiscount]);
        summarySheet.addRow(['Marża po rabatach', exportedMarginAfterDiscount / 100]);

        summarySheet.getColumn(2).numFmt = '#,##0.00';
        summarySheet.getCell('B6').numFmt = '0.00%';
        summarySheet.getCell('B11').numFmt = '0.00%';
        summarySheet.getRow(1).font = { bold: true, size: 14 };

        // Mapa WBS nodeId → nazwa wymagania
        const reqNameByNodeId = {};
        for (const req of allRequirements) {
            try {
                const alloc = JSON.parse(req.wbsNodeAllocations || '{}');
                for (const nid of Object.keys(alloc)) {
                    if (nid) reqNameByNodeId[nid] = req.name || req.productName || '';
                }
            } catch {}
        }

        budgetSheet.columns = [
            { header: 'Lp.', key: 'index', width: 6 },
            { header: 'Przedmiot', key: 'subjectName', width: 28 },
            { header: 'Nazwa', key: 'name', width: 34 },
            { header: 'Nazwa wymagania', key: 'requirementName', width: 30 },
            { header: 'Typ', key: 'type', width: 16 },
            { header: 'Koszt jednostkowy', key: 'unitCost', width: 18 },
            { header: 'Ilość', key: 'quantity', width: 12 },
            { header: 'Jednostka', key: 'unit', width: 14 },
            { header: 'Koszt całościowy', key: 'totalCost', width: 18 },
            { header: 'Marża (%)', key: 'margin', width: 12 },
            { header: 'Rabat (%)', key: 'discount', width: 12 },
            { header: 'Cena ofertowa', key: 'offerPrice', width: 18 },
            { header: 'Komentarz', key: 'comment', width: 32 },
            { header: 'Status', key: 'status', width: 18 },
        ];

        const headerRow = budgetSheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

        rows.forEach((row, index) => {
            budgetSheet.addRow({
                index: index + 1,
                subjectName: row.subjectName || '',
                name: row.name || '',
                requirementName: reqNameByNodeId[row.id] || '',
                type: TYPE_LABELS[row.type] || row.type || '',
                unitCost: Number(row.unitCost) || 0,
                quantity: Number(row.quantity) || 0,
                unit: row.unit || '',
                totalCost: Number(row.totalCost) || 0,
                margin: (Number(row.margin) || 0) / 100,
                discount: (Number(row.discount) || 0) / 100,
                offerPrice: Number(row.offerPrice) || 0,
                comment: row.comment || '',
                status: row.status || '',
            });
        });

        const totalsRow = budgetSheet.addRow({
            subjectName: 'Razem',
            totalCost: summary.totalCost,
            offerPrice: exportedRevenueAfterDiscount,
        });
        totalsRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

        ['F', 'I', 'L'].forEach((column) => {
            budgetSheet.getColumn(column).numFmt = '#,##0.00';
        });
        budgetSheet.getColumn('G').numFmt = '#,##0.00';
        budgetSheet.getColumn('J').numFmt = '0.00%';
        budgetSheet.getColumn('K').numFmt = '0.00%';
        budgetSheet.views = [{ state: 'frozen', ySplit: 1 }];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `budzet_${safeProjectName}_${exportDate.replace(/\./g, '-')}.xlsx`;
        anchor.click();
        URL.revokeObjectURL(url);
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

    const deleteNodeById = useCallback(async (id) => {
        if (!id || !window.confirm('Usunąć ten węzeł?')) return;
        try {
            // Sprawdź czy usuwany węzeł ma tag req: — jeśli tak, odłącz wymaganie
            const node = wbsData.find(n => n.id === id);
            const reqTag = (node?.tags || []).find(t => String(t).startsWith('req:'));
            if (reqTag) {
                const reqId = reqTag.slice(4);
                // Odłącz wymaganie od węzła WBS (wróci do koszyka nieprzypisanych)
                await fetch(`${API_URL}/material-requirements/${reqId}`, {
                    method: 'PATCH',
                    headers: authHeaders(),
                    body: JSON.stringify({ wbsNodeId: null, wbsNodeIds: '[]', wbsNodeAllocations: null, isAiAssigned: false }),
                }).catch(() => {});
            }

            await fetch(`${API_URL}/wbs-nodes/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (selectedId === id) setSelectedId(null);
            setReqRefreshKey(k => k + 1);
            await refreshUnified();
            await fetchUnassignedRequirements();
        } catch (e) { console.error('Delete node error:', e); }
    }, [authHeaders, refreshUnified, selectedId, wbsData, fetchUnassignedRequirements]);

    const updateNodeField = useCallback(async (id, field, value) => {
        try {
            await fetch(`${API_URL}/wbs-nodes/${id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ [field]: value }),
            });
            // Synchronizuj nazwę do powiązanego wymagania materialnego
            if (field === 'name') {
                const node = wbsData.find(n => n.id === id);
                const reqTag = (node?.tags || []).find(t => String(t).startsWith('req:'));
                if (reqTag) {
                    const reqId = reqTag.slice(4);
                    await fetch(`${API_URL}/material-requirements/${reqId}`, {
                        method: 'PATCH',
                        headers: authHeaders(),
                        body: JSON.stringify({ name: value }),
                    }).catch(() => {});
                    setReqRefreshKey(k => k + 1);
                }
            }
        } catch (e) { console.error('Update node error:', e); }
    }, [authHeaders, wbsData]);

    const saveBudgetField = useCallback(async (wbsNodeId, data) => {
        try {
            await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}/budget`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify(data),
            });
        } catch (e) { console.error('Save budget field error:', e); }
    }, [authHeaders]);

    const updateMaterialRequirementField = useCallback(async (id, patch) => {
        if (!id || !patch || Object.keys(patch).length === 0) return;
        try {
            await fetch(`${API_URL}/material-requirements/${id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify(patch),
            });
        } catch (e) { console.error('Update material requirement error:', e); }
    }, [authHeaders]);

    const updateLocalWbsBudgetRow = useCallback((wbsNodeId, patch) => {
        setWbsData(prev => prev.map(item => item.id === wbsNodeId ? { ...item, ...patch } : item));
    }, []);

    const applyBudgetImport = useCallback(async () => {
        if (!budgetImportRows.length) return;
        setBudgetImportLoading(true);
        try {
            const startDataRow = Math.max(1, Number(budgetImportHeaderRow) || 1) + 1;
            const lastDataRow = Math.max(startDataRow, Number(budgetImportLastRow) || budgetImportRows.length);
            const getMapped = (rowValues, key) => {
                const idxRaw = budgetImportMapping[key];
                if (idxRaw === undefined || idxRaw === '') return '';
                const idx = Number(idxRaw);
                return Number.isInteger(idx) ? String(rowValues[idx] || '').trim() : '';
            };

            const byId = new Map(wbsData.map((n) => [n.id, n]));
            const getSubjectNameForNode = (node) => {
                if (!node) return '';
                let current = node;
                while (current?.parentId && byId.get(current.parentId)) {
                    current = byId.get(current.parentId);
                }
                return current?.name || node.name || '';
            };
            const subjectRootsByName = new Map();
            for (const item of wbsData) {
                if (Number(item?.depth) === 0) {
                    const key = normKey(item.name);
                    if (key && !subjectRootsByName.has(key)) {
                        subjectRootsByName.set(key, item);
                    }
                }
            }
            const budgetRows = [...wbsData]
                .sort((a, b) => (a.path || '').localeCompare(b.path || '', 'pl'));
            const used = new Set();
            let imported = 0;
            let updated = 0;
            let created = 0;
            let skipped = 0;

            for (let rowNo = startDataRow; rowNo <= lastDataRow && rowNo <= budgetImportRows.length; rowNo++) {
                const rowValues = budgetImportRows[rowNo - 1] || [];
                const importedRow = {
                    subjectName: getMapped(rowValues, 'subjectName'),
                    name: getMapped(rowValues, 'name'),
                    type: getMapped(rowValues, 'type'),
                    quantity: getMapped(rowValues, 'quantity'),
                    unit: getMapped(rowValues, 'unit'),
                    unitCost: getMapped(rowValues, 'unitCost'),
                    totalCost: getMapped(rowValues, 'totalCost'),
                    margin: getMapped(rowValues, 'margin'),
                    discount: getMapped(rowValues, 'discount'),
                    comment: getMapped(rowValues, 'comment'),
                };

                const hasData = Object.values(importedRow).some((v) => String(v || '').trim() !== '');
                if (!hasData) continue;
                imported += 1;

                const wantedName = normKey(importedRow.name);
                const wantedSubject = normKey(importedRow.subjectName);

                let target = null;
                if (wantedName) {
                    target = budgetRows.find((row) => (
                        !used.has(row.id)
                        && normKey(row.name) === wantedName
                        && (!wantedSubject || normKey(getSubjectNameForNode(row)) === wantedSubject)
                    ));
                }

                if (!target) {
                    const subjectRoot = subjectRootsByName.get(wantedSubject);
                    if (!subjectRoot || !importedRow.name) {
                        skipped += 1;
                        continue;
                    }

                    const createRes = await fetch(`${API_URL}/wbs-nodes`, {
                        method: 'POST',
                        headers: authHeaders(),
                        body: JSON.stringify({
                            nodeId,
                            versionId: versionId || null,
                            parentId: subjectRoot.id,
                            name: importedRow.name,
                        }),
                    });
                    if (!createRes.ok) continue;
                    const createdNode = await createRes.json().catch(() => null);
                    if (!createdNode?.id) continue;
                    target = {
                        id: createdNode.id,
                        name: createdNode.name || importedRow.name || `Pozycja ${importIndex + 1}`,
                        quantity: 1,
                        unitCost: 0,
                    };
                    budgetRows.push(target);
                    created += 1;
                }
                used.add(target.id);

                const parsedQuantity = parseLocaleNumber(importedRow.quantity);
                const parsedUnitCost = parseLocaleNumber(importedRow.unitCost);
                const parsedTotalCost = parseLocaleNumber(importedRow.totalCost);
                const resolvedQuantity = parsedQuantity != null ? parsedQuantity : (parseFloat(target.quantity) || 1);
                const resolvedUnitCost = parsedUnitCost != null
                    ? parsedUnitCost
                    : (parsedTotalCost != null && resolvedQuantity > 0 ? parsedTotalCost / resolvedQuantity : null);

                const nodePatch = {};
                const budgetPatch = {};

                if (importedRow.name) nodePatch.name = importedRow.name;
                const mappedType = normalizeImportedType(importedRow.type);
                if (mappedType && TYPE_OPTIONS.includes(mappedType)) nodePatch.type = mappedType;

                if (resolvedQuantity != null) budgetPatch.quantity = resolvedQuantity;
                if (importedRow.unit) budgetPatch.unit = importedRow.unit;
                if (resolvedUnitCost != null) budgetPatch.unitCost = resolvedUnitCost;
                const parsedMargin = parseLocaleNumber(importedRow.margin);
                if (parsedMargin != null) budgetPatch.margin = parsedMargin;
                const parsedDiscount = parseLocaleNumber(importedRow.discount);
                if (parsedDiscount != null) budgetPatch.discount = parsedDiscount;
                if (importedRow.comment) budgetPatch.comment = importedRow.comment;

                const previewUnitCost = budgetPatch.unitCost != null ? budgetPatch.unitCost : (parseFloat(target.unitCost) || 0);
                const previewQuantity = budgetPatch.quantity != null ? budgetPatch.quantity : (parseFloat(target.quantity) || 1);
                const previewPatch = {
                    ...nodePatch,
                    ...budgetPatch,
                    totalCost: previewUnitCost * previewQuantity,
                };

                updateLocalWbsBudgetRow(target.id, previewPatch);

                if (Object.keys(nodePatch).length > 0) {
                    await fetch(`${API_URL}/wbs-nodes/${target.id}`, {
                        method: 'PATCH',
                        headers: authHeaders(),
                        body: JSON.stringify(nodePatch),
                    });
                }

                if (Object.keys(budgetPatch).length > 0) {
                    await saveBudgetField(target.id, budgetPatch);
                }

                updated += 1;
            }

            await refreshUnified();
            setBudgetImportOpen(false);
            alert(`Import zakończony: przetworzono ${imported} wierszy, zaktualizowano ${updated}, dodano ${created}, pominięto ${skipped}.`);
        } catch (e) {
            console.error('Budget import apply error:', e);
            alert('Wystąpił błąd podczas importu budżetu.');
        } finally {
            setBudgetImportLoading(false);
        }
    }, [
        budgetImportRows,
        budgetImportHeaderRow,
        budgetImportLastRow,
        budgetImportMapping,
        updateLocalWbsBudgetRow,
        authHeaders,
        saveBudgetField,
        refreshUnified,
        wbsData,
        nodeId,
        versionId,
    ]);

    const onCellValueChanged = useCallback((params) => {
        const row = params.data;
        if (!row) return;
        const field = params.colDef.field;
        if (['subjectName', 'name', 'type', 'status', 'owner', 'requirementsQty'].includes(field)) {
            if (field === 'subjectName') {
                if (row.subjectId && row.subjectName) {
                    updateNodeField(row.subjectId, 'name', row.subjectName);
                    setWbsData(prev => prev.map(item => item.id === row.subjectId ? { ...item, name: row.subjectName } : item));
                }
                return;
            }
            if (field === 'requirementsQty') {
                const parsedQuantity = parseLocaleNumber(row[field]);
                if (parsedQuantity == null || parsedQuantity < 0) return;
                row[field] = parsedQuantity;
                setRequirementsQtyByNode((prev) => ({ ...prev, [row.id]: parsedQuantity }));
                updateLocalWbsBudgetRow(row.id, { quantity: parsedQuantity });
                saveBudgetField(row.id, { quantity: parsedQuantity });
                syncMaterialRequirementsFromWbsQuantity(row.id, parsedQuantity, row.name);
                return;
            }
            if (field === 'status') {
                const normalizedType = String(row.type || '').toLowerCase();
                const wbsNode = wbsData.find(n => n.id === row.id);
                const reqTag = (wbsNode?.tags || []).find(t => String(t).startsWith('req:'));
                // Dla material/equipment bez tagu req: — status dziedziczony, blokuj edycję
                if (['material', 'equipment'].includes(normalizedType) && !reqTag) return;
                row.statusLabel = getStatusLabel(row[field], row[field]);
                updateNodeField(row.id, field, row[field]);
                setWbsData(prev => prev.map(item => item.id === row.id ? { ...item, [field]: row[field], statusLabel: row.statusLabel } : item));
                // Synchronizuj status do powiązanego wymagania materialnego
                if (reqTag) {
                    const reqId = reqTag.slice(4);
                    fetch(`${API_URL}/material-requirements/${reqId}`, {
                        method: 'PATCH',
                        headers: authHeaders(),
                        body: JSON.stringify({ status: row[field] }),
                    }).then(async () => {
                        setReqRefreshKey(k => k + 1);
                        await refreshUnified();
                    }).catch(() => {});
                }
            } else {
                updateNodeField(row.id, field, row[field]);
                setWbsData(prev => prev.map(item => item.id === row.id ? { ...item, [field]: row[field] } : item));
            }
            if (field === 'type') {
                const normalizedType = String(row.type || '').toLowerCase();
                const inheritedFromMaterials = normalizedType === 'material' || normalizedType === 'equipment';
                const quantity = parseFloat(row.quantity) || 1;
                const lookupKey = makeMaterialLookupKey(row.subjectName || row.name, row.name);
                const inheritedQuantity = parseFloat(materialMetaByLookupKey[lookupKey]?.quantity) || 0;
                const inheritedCost = parseFloat(materialMetaByLookupKey[lookupKey]?.cost)
                    || parseFloat(row.materialTabCost)
                    || parseFloat(row.materialsTotalCost)
                    || 0;
                const resolvedQuantity = inheritedFromMaterials
                    ? (inheritedQuantity > 0 ? inheritedQuantity : quantity)
                    : quantity;
                const inheritedUnitCost = inheritedQuantity > 0 ? inheritedCost / inheritedQuantity : 0;
                const resolvedUnitCost = inheritedFromMaterials
                    ? inheritedUnitCost
                    : (parseFloat(row.unitCost) || 0);
                const totalCost = inheritedFromMaterials
                    ? inheritedCost
                    : (Number.isFinite(parseFloat(row.totalCost)) ? parseFloat(row.totalCost) : resolvedUnitCost * resolvedQuantity);
                const margin = parseFloat(row.margin) || 0;
                row.inheritedFromMaterials = inheritedFromMaterials;
                row.quantity = resolvedQuantity;
                row.unit = inheritedFromMaterials
                    ? (materialMetaByLookupKey[lookupKey]?.unit || row.unit || 'sztuki')
                    : (row.unit || 'sztuki');
                row.unitCost = inheritedFromMaterials
                    ? resolvedUnitCost
                    : (resolvedQuantity > 0 ? totalCost / resolvedQuantity : totalCost);
                row.cost = totalCost;
                row.totalCost = totalCost;
                row.offerPrice = margin !== 0 ? totalCost * (1 + margin / 100) : 0;
                row.totalPrice = row.offerPrice;
                updateLocalWbsBudgetRow(row.id, {
                    type: row.type,
                    quantity: row.quantity,
                    unit: row.unit,
                    unitCost: row.unitCost,
                    totalCost: row.totalCost,
                    totalPrice: row.totalPrice,
                    margin: row.margin,
                });
                params.api.applyTransaction({ update: [row] });

                // Auto-create MaterialRequirement when type set to material/equipment and no req: tag yet
                if (inheritedFromMaterials) {
                    const wbsNode = wbsData.find(n => n.id === row.id);
                    const hasReqTag = Array.isArray(wbsNode?.tags) && wbsNode.tags.some(t => String(t).startsWith('req:'));
                    if (!hasReqTag) {
                        const reqType = normalizedType === 'equipment' ? 'DEVICE' : 'MATERIAL';
                        fetch(`${API_URL}/material-requirements`, {
                            method: 'POST',
                            headers: authHeaders(),
                            body: JSON.stringify({
                                nodeId,
                                versionId: versionId || null,
                                name: row.name || 'Nowy element',
                                type: reqType,
                                quantity: resolvedQuantity,
                                unit: row.unit || 'szt',
                                wbsNodeId: row.id,
                                wbsNodeIds: JSON.stringify([row.id]),
                                wbsNodeAllocations: JSON.stringify({ [row.id]: resolvedQuantity }),
                            }),
                        }).then(async (res) => {
                            if (!res.ok) return;
                            const created = await res.json().catch(() => null);
                            if (created?.id) {
                                // Tag the WBS node with req:<id> for bidirectional sync
                                const currentTags = Array.isArray(wbsNode?.tags) ? [...wbsNode.tags] : [];
                                currentTags.push(`req:${created.id}`);
                                await fetch(`${API_URL}/wbs-nodes/${row.id}`, {
                                    method: 'PATCH',
                                    headers: authHeaders(),
                                    body: JSON.stringify({ tags: currentTags }),
                                }).catch(() => {});
                                setReqRefreshKey(k => k + 1);
                                await refreshUnified();
                            }
                        }).catch(() => {});
                    }
                }
            }
        } else {
            const q = parseFloat(row.quantity) || 1;
            const uc = parseFloat(row.unitCost) || 0;
            const totalCost = uc * q;
            const m = parseFloat(row.margin) || 0;
            const d = parseFloat(row.discount) || 0;
            let up = uc;
            if (uc > 0 && m !== 0) up = uc * (1 + m / 100);
            if (d > 0) up = up * (1 - d / 100);

            row.unit = row.unit || 'sztuki';
            row.unitCost = uc;
            row.totalCost = totalCost;
            row.cost = totalCost;
            row.unitPrice = up;
            row.totalPrice = m !== 0 ? up * q : 0;
            row.offerPrice = row.totalPrice;
            updateLocalWbsBudgetRow(row.id, {
                unit: row.unit,
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
                unit: row.unit,
                unitCost: uc,
                quantity: q,
                margin: m,
                discount: d,
                unitPrice: up,
                comment: row.comment ?? '',
            });
            // Sync budget quantity → WBS for work-type nodes
            if (field === 'quantity') {
                const normalizedType = String(row.type || row.budgetType || '').toLowerCase();
                if (normalizedType === 'work' || normalizedType === 'praca') {
                    setRequirementsQtyByNode((prev) => ({ ...prev, [row.id]: q }));
                    syncMaterialRequirementsFromWbsQuantity(row.id, q, row.name);
                }
            }
        }
    }, [saveBudgetField, updateNodeField, materialMetaByLookupKey, updateLocalWbsBudgetRow, syncMaterialRequirementsFromWbsQuantity, authHeaders, nodeId, versionId, wbsData, refreshUnified]);

    const buildRows = (view) => {
        const byId = new Map(wbsData.map(item => [item.id, item]));

        const matchesSearch = (...values) => {
            if (!normalizedSearchQuery) return true;
            return values.some((value) => String(value ?? '').toLowerCase().includes(normalizedSearchQuery));
        };
        const getSubjectInfo = (item) => {
            let current = item;
            while (current?.parentId) {
                const parent = byId.get(current.parentId);
                if (!parent) break;
                current = parent;
            }
            return {
                id: current?.id || item.id,
                name: current?.name || item.name || '',
            };
        };

        const getInheritedMaterialStatus = (item) => {
            const normalizedType = String(item.type || '').toLowerCase();
            if (!['material', 'equipment'].includes(normalizedType)) {
                const code = normalizeStatusCode(item.status);
                return { code, label: getStatusLabel(code, item.status) };
            }
            const lookupKey = makeMaterialLookupKey(getSubjectInfo(item).name, item.name);
            const lookupStatuses = Array.from(new Set((materialMetaByLookupKey[lookupKey]?.statuses || [])
                .map((s) => normalizeStatusCode(s))
                .filter(Boolean)));
            const statuses = lookupStatuses.length ? lookupStatuses : Array.from(new Set((item.materials || [])
                .map(m => m.status)
                .filter(Boolean)
                .map((s) => normalizeStatusCode(s))
                .filter(Boolean)));

            if (statuses.length === 0) {
                const fallbackCode = normalizeStatusCode(item.status);
                return { code: fallbackCode, label: getStatusLabel(fallbackCode, item.status) };
            }

            if (statuses.length === 1) {
                const code = statuses[0];
                return { code, label: getStatusLabel(code) };
            }

            return {
                code: 'MIXED',
                label: statuses.map((code) => getStatusLabel(code)).join(', '),
            };
        };

        if (view === VIEWS.BUDGET) {
            return [...wbsData]
                .filter(item => item.parentId != null)
                .sort((a, b) => (a.path || '').localeCompare(b.path || '', 'pl'))
                .map(item => {
                    const normalizedType = String(item.type || '').toLowerCase();
                    const inheritedFromMaterials = normalizedType === 'material' || normalizedType === 'equipment';
                    const subject = getSubjectInfo(item);
                    const subjectName = subject.name;
                    const lookupKey = makeMaterialLookupKey(subjectName, item.name);
                    const inheritedQuantity = parseFloat(materialMetaByLookupKey[lookupKey]?.quantity) || 0;
                    const inheritedCost = parseFloat(materialMetaByLookupKey[lookupKey]?.cost)
                        || parseFloat(materialCostsByNode[item.id])
                        || parseFloat(item.materialsTotalCost)
                        || 0;
                    const persistedQuantity = parseFloat(item.quantity) || 1;
                    const isWorkType = normalizedType === 'work' || normalizedType === 'praca'
                        || String(item.budgetType || '').toUpperCase() === 'WORK';
                    const wbsReqQty = Object.prototype.hasOwnProperty.call(requirementsQtyByNode, item.id)
                        ? requirementsQtyByNode[item.id]
                        : null;
                    const quantity = inheritedFromMaterials
                        ? (inheritedQuantity > 0 ? inheritedQuantity : persistedQuantity)
                        : (isWorkType && wbsReqQty != null ? wbsReqQty : persistedQuantity);
                    const totalCost = inheritedFromMaterials
                        ? inheritedCost
                        : (Number.isFinite(parseFloat(item.totalCost))
                            ? parseFloat(item.totalCost)
                            : (parseFloat(item.unitCost) || 0) * quantity);
                    const unitCost = inheritedFromMaterials
                        ? (inheritedQuantity > 0 ? inheritedCost / inheritedQuantity : (quantity > 0 ? totalCost / quantity : totalCost))
                        : (Number.isFinite(parseFloat(item.unitCost))
                            ? parseFloat(item.unitCost)
                            : (quantity > 0 ? totalCost / quantity : 0));
                    const clearDerivedFields = inheritedFromMaterials && totalCost <= 0;
                    const margin = clearDerivedFields ? 0 : (parseFloat(item.margin) || 0);
                    const discount = clearDerivedFields ? 0 : (parseFloat(item.discount) || 0);
                    let offerPrice = margin !== 0 ? totalCost * (1 + margin / 100) : 0;
                    if (discount > 0) {
                        offerPrice = offerPrice * (1 - discount / 100);
                    }
                    const inheritedStatus = getInheritedMaterialStatus(item);
                    return {
                        ...item,
                        subjectId: subject.id,
                        subjectName,
                        status: inheritedStatus.code,
                        statusLabel: inheritedStatus.label,
                        unit: inheritedFromMaterials
                            ? (materialMetaByLookupKey[lookupKey]?.unit || item.unit || 'sztuki')
                            : (item.unit || 'sztuki'),
                        materialTabCost: inheritedCost,
                        unitCost,
                        totalCost,
                        cost: totalCost,
                        margin,
                        discount,
                        offerPrice,
                        quantity,
                        inheritedFromMaterials,
                    };
                })
                .filter((row) => matchesSearch(
                    row.subjectName,
                    row.name,
                    TYPE_LABELS[row.type] || row.type,
                    row.status,
                    row.comment,
                    row.unit,
                    row.quantity,
                    row.unitCost,
                    row.totalCost,
                    row.margin,
                    row.discount,
                    row.offerPrice,
                ));
        }

        const childrenMap = new Map();
        for (const item of wbsData) {
            const pid = item.parentId || '__root__';
            if (!childrenMap.has(pid)) childrenMap.set(pid, []);
            childrenMap.get(pid).push(item);
        }
        const rows = [];
        const getRequirementsQty = (id) => Object.prototype.hasOwnProperty.call(requirementsQtyByNode, id)
            ? requirementsQtyByNode[id]
            : 1;
        const addVisible = (pId, depth) => {
            const children = childrenMap.get(pId || '__root__') || [];
            children.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            for (const item of children) {
                const inheritedStatus = getInheritedMaterialStatus(item);
                rows.push({
                    ...item,
                    status: inheritedStatus.code,
                    statusLabel: inheritedStatus.label,
                    requirementsQty: getRequirementsQty(item.id),
                    _isProjectItem: depth === 0,
                    _depth: depth,
                    _hasChildren: childrenMap.has(item.id),
                    materialsCount: Number(item.materialsCount) || 0,
                });
                if (expandedIds.has(item.id)) {
                    addVisible(item.id, depth + 1);
                }
            }
        };

        if (view === VIEWS.STRUCTURE) {
            const matchesById = new Map();
            const branchMatches = (item) => {
                if (!item) return false;
                if (matchesById.has(item.id)) return matchesById.get(item.id);
                const selfMatches = matchesSearch(
                    item.name,
                    TYPE_LABELS[item.type] || item.type,
                    item.status,
                    item.owner,
                    item.path,
                );
                const childMatch = (childrenMap.get(item.id) || []).some(branchMatches);
                const result = selfMatches || childMatch;
                matchesById.set(item.id, result);
                return result;
            };

            if (normalizedSearchQuery) {
                const filteredRoots = (childrenMap.get('__root__') || []).filter(branchMatches);
                const addFilteredVisible = (items, depth) => {
                    for (const item of items) {
                        const inheritedStatus = getInheritedMaterialStatus(item);
                        rows.push({
                            ...item,
                            status: inheritedStatus.code,
                            statusLabel: inheritedStatus.label,
                            requirementsQty: getRequirementsQty(item.id),
                            _isProjectItem: depth === 0,
                            _depth: depth,
                            _hasChildren: childrenMap.has(item.id),
                            materialsCount: Number(item.materialsCount) || 0,
                        });
                        const matchingChildren = (childrenMap.get(item.id) || []).filter(branchMatches);
                        if (matchingChildren.length) addFilteredVisible(matchingChildren, depth + 1);
                    }
                };
                addFilteredVisible(filteredRoots, 0);
            } else addVisible(null, 0);
            return rows;
        }

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
        const marginPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
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
        const parsedPercentDiscount = Number(String(budgetDiscountPercent).replace(',', '.'));
        const parsedAmountDiscount = Number(String(budgetDiscountAmount).replace(',', '.'));
        const discountAmountFromPercent = Number.isFinite(parsedPercentDiscount)
            ? Math.max(0, parsedPercentDiscount) / 100 * baseRevenue
            : 0;
        const discountAmountFromValue = Number.isFinite(parsedAmountDiscount) ? Math.max(0, parsedAmountDiscount) : 0;
        const totalDiscount = discountAmountFromPercent + discountAmountFromValue;

        if (totalDiscount <= 0) {
            return budgetSummary;
        }

        const totalRevenue = Math.max(0, baseRevenue - totalDiscount);
        const profit = totalRevenue - budgetSummary.totalCost;
        const marginPct = budgetSummary.totalCost > 0 ? (profit / budgetSummary.totalCost) * 100 : 0;
        return {
            ...budgetSummary,
            totalRevenue,
            profit,
            marginPct,
        };
    }, [budgetSummary, budgetDiscountAmount, budgetDiscountPercent]);

    const getColumnDefs = (view) => {
        const nameCol = {
            field: 'name',
            headerName: 'Nazwa',
            flex: 1,
            minWidth: 250,
            cellRenderer: TreeNameRenderer,
            cellRendererParams: {
                context: {
                    expandedIds,
                    toggleExpand: (id) => setExpandedIds(prev => {
                        const n = new Set(prev);
                        if (n.has(id)) n.delete(id); else n.add(id);
                        return n;
                    }),
                    selectedId,
                    onSelectRow: setSelectedId,
                    onAddChild: (id) => addNode(id),
                },
            },
            cellEditor: 'agTextCellEditor',
            cellEditorParams: {
                maxLength: 255,
            },
            editable: (params) => !params.data?._isRequirementLeaf,
        };
        
        const ownerCol = {
            field: 'owner', headerName: 'Osoba', width: 140,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: {
                values: assignableOwnerValues
            },
            editable: (params) => !params.data?._isRequirementLeaf,
            valueFormatter: (p) => p.value || 'Brak',
            cellClass: STRUCTURE_COMMON_CELL_CLASS,
        };

        if (view === VIEWS.STRUCTURE) return [
            nameCol, 
            {
                field: 'type',
                headerName: 'Typ',
                width: 100,
                cellEditor: 'agSelectCellEditor',
                cellEditorParams: { values: TYPE_OPTIONS },
                valueFormatter: (p) => p.data?._isProjectItem ? '' : (TYPE_LABELS[p.value] || p.value || 'Brak'),
                editable: (params) => !params.data?._isProjectItem && !params.data?._isRequirementLeaf,
                cellClass: STRUCTURE_COMMON_CELL_CLASS,
            },
            {
                field: 'requirementsQty',
                headerName: 'Ilość wymagań',
                width: 140,
                editable: (params) => {
                    if (params.data?._isProjectItem) return false;
                    if (params.data?._isRequirementLeaf) return false;
                    if (params.data?._hasChildren) return false;
                    return true;
                },
                cellEditor: 'agTextCellEditor',
                sortable: true,
                valueFormatter: (p) => {
                    if (p.data?._isProjectItem || p.data?._hasChildren) return '';
                    return fmtQty(p.value) || '1';
                },
                cellClass: `${STRUCTURE_COMMON_CELL_CLASS} text-gray-300`,
            },
            {
                field: 'status',
                headerName: 'Status',
                width: 160,
                cellEditor: 'agSelectCellEditor',
                cellEditorParams: { values: Object.keys(STRUCTURE_STATUS_META) },
                valueFormatter: (p) => p.data?.statusLabel || getStatusLabel(p.value, p.value),
                cellRenderer: StructureStatusRenderer,
                cellClass: STRUCTURE_COMMON_CELL_CLASS,
                editable: (params) => {
                    if (params.data?._isRequirementLeaf) return false;
                    const normalizedType = String(params.data?.type || '').toLowerCase();
                    if (['material', 'equipment'].includes(normalizedType)) {
                        // Dozwól edycję statusu dla węzłów z tagiem req: (synchronizacja z Materiały)
                        const node = wbsData.find(n => n.id === params.data?.id);
                        return Array.isArray(node?.tags) && node.tags.some(t => String(t).startsWith('req:'));
                    }
                    return true;
                },
            },
            ownerCol,
            {
                headerName: 'Znaczniki',
                minWidth: 120,
                flex: 1,
                sortable: false,
                filter: false,
                editable: false,
                cellRenderer: MarkerIconsRenderer,
                cellRendererParams: { context: { markerLinksCache, onOpenAttachment: setPreviewAttachment } },
            },
            {
                headerName: '',
                width: 64,
                pinned: 'right',
                sortable: false,
                filter: false,
                editable: false,
                cellRenderer: RowActionsRenderer,
                cellRendererParams: { context: { onDeleteRow: deleteNodeById } },
            }
        ];

        if (view === VIEWS.BUDGET) return [
            { field: 'subjectName', headerName: 'Przedmiot', minWidth: 220, flex: 1, sortable: true, editable: true, headerComponent: BudgetHeaderRenderer },
            { field: 'name', headerName: 'Nazwa', minWidth: 220, flex: 1, sortable: true, editable: true, headerComponent: BudgetHeaderRenderer },
            { field: 'type', headerName: 'Typ', width: 130, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: TYPE_OPTIONS }, valueFormatter: p => TYPE_LABELS[p.value] || p.value, editable: true, sortable: true, headerComponent: BudgetHeaderRenderer },
            {
                field: 'unitCost',
                headerName: 'Koszt jednostkowy',
                width: 170,
                cellEditor: 'agTextCellEditor',
                editable: (params) => !params.data?.inheritedFromMaterials,
                sortable: true,
                valueFormatter: p => fmtPLN(p.value),
                cellClass: (params) => params.data?.inheritedFromMaterials ? 'text-red-300' : '',
                tooltipValueGetter: (params) => params.data?.inheritedFromMaterials ? 'Koszt dziedziczony z zakładki Materiały (wyliczony względem ilości)' : '',
                headerComponent: BudgetHeaderRenderer
            },
            { field: 'quantity', headerName: 'Ilość', width: 110, cellEditor: 'agTextCellEditor', editable: true, sortable: true, valueFormatter: p => fmtQty(p.value), headerComponent: BudgetHeaderRenderer },
            { field: 'unit', headerName: 'Jednostki', width: 140, editable: true, sortable: true, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: UNIT_OPTIONS }, headerComponent: BudgetHeaderRenderer },
            { field: 'totalCost', headerName: 'Koszt całościowy', width: 170, editable: false, sortable: true, valueFormatter: p => fmtPLN(p.value), headerComponent: BudgetHeaderRenderer },
            { field: 'margin', headerName: 'Marża (%)', width: 110, cellEditor: 'agTextCellEditor', editable: true, sortable: true, valueFormatter: p => fmtPct(p.value), cellClass: 'text-green-300', headerComponent: BudgetHeaderRenderer },
            { field: 'discount', headerName: 'Rabat (%)', width: 110, cellEditor: 'agTextCellEditor', editable: true, sortable: true, valueFormatter: p => fmtPct(p.value), cellClass: 'text-orange-300', headerComponent: BudgetHeaderRenderer },
            { field: 'offerPrice', headerName: 'Cena ofertowa', width: 150, sortable: true, valueFormatter: p => fmtPLN(p.value), headerComponent: BudgetHeaderRenderer },
            { field: 'comment', headerName: 'Komentarz', minWidth: 220, flex: 1, editable: true, sortable: true, wrapText: true, autoHeight: true, cellStyle: { whiteSpace: 'normal', lineHeight: '1.4' }, headerComponent: BudgetHeaderRenderer },
            {
                headerName: '',
                width: 64,
                pinned: 'right',
                sortable: false,
                filter: false,
                editable: false,
                cellRenderer: RowActionsRenderer,
                cellRendererParams: { context: { onDeleteRow: deleteNodeById } },
            }
        ];

        return [nameCol, { field: 'status', width: 100 }];
    };

    const onGridCellKeyDown = useCallback((params) => {
        const key = params?.event?.key;
        if (!key) return;

        const rowIndex = params?.node?.rowIndex;
        const currentColumn = params?.column;
        if (rowIndex == null || !currentColumn) return;

        const api = params.api;
        const allCols = api.getAllDisplayedColumns?.() || [];
        const currentColId = currentColumn.getColId();
        const isEditable = (column, nextRowIndex) => {
            const rowNode = api.getDisplayedRowAtIndex(nextRowIndex);
            if (!rowNode) return false;
            const colDef = column.getColDef();
            const editable = colDef.editable;
            if (typeof editable === 'function') {
                return !!editable({
                    ...params,
                    colDef,
                    column,
                    data: rowNode.data,
                    node: rowNode,
                    rowIndex: nextRowIndex,
                });
            }
            return !!editable;
        };

        if (key === 'Enter' && !params.event.shiftKey) {
            params.event.preventDefault();
            params.event.stopPropagation();
            const currentIdx = allCols.findIndex((c) => c.getColId() === currentColId);
            if (currentIdx < 0) return;
            for (let i = currentIdx + 1; i < allCols.length; i++) {
                const nextCol = allCols[i];
                if (!isEditable(nextCol, rowIndex)) continue;
                api.stopEditing();
                api.setFocusedCell(rowIndex, nextCol.getColId());
                api.startEditingCell({ rowIndex, colKey: nextCol.getColId() });
                return;
            }
            return;
        }

        if (key === 'ArrowUp' || key === 'ArrowDown') {
            params.event.preventDefault();
            params.event.stopPropagation();
            const delta = key === 'ArrowUp' ? -1 : 1;
            const targetRow = rowIndex + delta;
            const rowCount = api.getDisplayedRowCount();
            if (targetRow < 0 || targetRow >= rowCount) return;

            api.stopEditing();
            api.setFocusedCell(targetRow, currentColId);
            if (isEditable(currentColumn, targetRow)) {
                api.startEditingCell({ rowIndex: targetRow, colKey: currentColId });
            }
        }
    }, []);

    const onGridCellClicked = useCallback((params) => {
        if (params?.colDef?.field !== 'type') return;
        if (!params?.column || params?.node?.rowIndex == null) return;

        const editable = params.colDef?.editable;
        const canEdit = typeof editable === 'function' ? !!editable(params) : !!editable;
        if (!canEdit) return;

        const editingCells = params.api.getEditingCells?.() || [];
        const isSameCellAlreadyEditing = editingCells.some((cell) => {
            const editingRow = cell?.rowIndex;
            const editingColId = cell?.column?.getColId?.() || cell?.colId;
            return editingRow === params.node.rowIndex && editingColId === params.column.getColId();
        });
        if (isSameCellAlreadyEditing) return;

        params.api.startEditingCell({
            rowIndex: params.node.rowIndex,
            colKey: params.column.getColId(),
        });
    }, []);

    const renderGrid = (v) => {
        const isBudgetView = v === VIEWS.BUDGET;
        const isStructureView = v === VIEWS.STRUCTURE;

        return (
            <div
                className={isBudgetView ? 'flex-1 min-h-[200px] overflow-hidden pb-2' : 'flex-1 min-h-[400px]'}
                onDoubleClick={(e) => e.stopPropagation()}
                onDragOver={isStructureView ? (e) => {
                    const types = Array.from(e.dataTransfer?.types || []);
                    if (!types.includes('application/requirement-id')) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    const rowEl = e.target.closest('[row-id]');
                    if (rowEl) {
                        const rowId = rowEl.getAttribute('row-id');
                        if (rowId && !rowId.startsWith('__req__:')) reqDropTargetRef.current = rowId;
                    }
                } : undefined}
                onDragLeave={isStructureView ? () => { reqDropTargetRef.current = null; } : undefined}
                onDrop={isStructureView ? (e) => {
                    const reqId = e.dataTransfer.getData('application/requirement-id');
                    const targetNodeId = reqDropTargetRef.current;
                    reqDropTargetRef.current = null;
                    if (reqId && targetNodeId) {
                        e.preventDefault();
                        handleRequirementAssignToWbs(targetNodeId, reqId);
                    }
                } : undefined}
            >
                <div className="h-full">
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
                        onCellClicked={onGridCellClicked}
                        onCellKeyDown={onGridCellKeyDown}
                        defaultColDef={v === VIEWS.BUDGET
                            ? { resizable: true, sortable: true, filter: true, floatingFilter: false }
                            : { resizable: true, sortable: false }}
                        singleClickEdit={v === VIEWS.BUDGET}
                        animateRows={true}
                    />
                </div>
            </div>
        );
    };

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
                <div className="text-[10px] uppercase tracking-widest text-orange-300/90 font-bold">Rabat - wartość procentowa</div>
                <div className="relative mt-1">
                    <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={budgetDiscountPercent}
                        onChange={(e) => setBudgetDiscountPercent(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded-lg border border-orange-400/25 bg-black/30 px-2 py-1.5 pr-8 text-sm font-black text-orange-100 focus:outline-none focus:border-orange-400"
                        placeholder="0,00"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-black text-orange-200/80">%</span>
                </div>
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
            <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-orange-300/90 font-bold">Rabat - wartość kwotowa</div>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={budgetDiscountAmount}
                    onChange={(e) => setBudgetDiscountAmount(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 w-full rounded-lg border border-orange-400/25 bg-black/30 px-2 py-1.5 text-sm font-black text-orange-100 focus:outline-none focus:border-orange-400"
                    placeholder="0,0"
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
        </div>
    );

    const renderSection = (key, title, Icon, colorClass, content, onExport, extraButtons = null) => {
        const isActive = expandedSection === key;
        if (expandedSection !== null && !isActive) return null;
        const isCompactSection = key === 'budget' || key === 'materials2';

        return (
            <div
                className={`flex flex-col glass-panel border border-white/5 transition-all duration-300 shadow-2xl ${isCompactSection && isActive ? 'rounded-none h-full' : 'rounded-2xl overflow-hidden'} ${isActive ? 'bg-white/[0.04]' : 'bg-white/[0.02] hover:bg-white/[0.03] cursor-pointer'}`}
                style={isActive && !isCompactSection ? { minHeight: 'calc(100vh - 200px)' } : {}}
            >
                <div
                    className={`flex items-center gap-2 px-5 py-2 transition-colors text-left flex-shrink-0 border-b border-white/10 sticky top-0 z-20 ${isActive ? 'bg-[#0b0f17]' : 'bg-white/[0.04]'}`}
                    onClick={() => setExpandedSection(isActive ? null : key)}
                >
                    <Icon size={16} className={`text-${colorClass}-400 flex-shrink-0`} />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-300 font-inter">{title}</h3>
                    <div className="flex-1 px-4 flex items-center gap-2 flex-nowrap min-w-0">{isActive && extraButtons}</div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {key === 'wbs' && (
                            <button
                                className="ml-2 px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs rounded-lg font-bold shadow border border-emerald-900/40 transition-all flex-shrink-0"
                                onClick={e => {
                                    e.stopPropagation();
                                    console.log('[WBS] Dodaj produkt projektu kliknięty');
                                    addNode(null);
                                }}
                            >
                                + Dodaj produkt projektu
                            </button>
                        )}
                        {onExport && (
                            <>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleExportPDF('all'); }} 
                                    className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-red-300 text-[10px] font-bold uppercase tracking-widest transition-all flex-shrink-0 whitespace-nowrap"
                                >
                                    <FileDown size={11} /> PDF wszystkie sekcje
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onExport(); }}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-red-300 text-[10px] font-bold uppercase tracking-widest transition-all flex-shrink-0"
                                >
                                    <FileDown size={11} /> PDF
                                </button>
                            </>
                        )}
                        <ChevronRight size={14} className={`text-gray-500 transition-transform flex-shrink-0 ${isActive ? 'rotate-90' : ''}`} />
                    </div>
                </div>
                {isActive && (
                    <div className={`flex-1 min-h-0 animate-fade-in flex flex-col ${isCompactSection ? 'p-0' : 'p-4 overflow-auto custom-scrollbar'}`}>
                        {content}
                    </div>
                )}
            </div>
        );
    };

    const isCompactActive = (expandedSection === 'budget' || expandedSection === 'materials2');

    return (
        <div className={`flex flex-col w-full h-full relative bg-[#0a0c10]/50 border border-white/[0.03] gap-1 pt-0 ${isCompactActive ? 'overflow-hidden p-0' : 'overflow-y-auto pr-2 custom-scrollbar rounded-[40px] p-2'}`}>
            <input
                ref={budgetImportFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleBudgetImportFileChange}
            />
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

            {renderSection(
                'wbs',
                `Struktura zadań projektu: ${projectName || '—'}`,
                Layers,
                'blue',
                (<div className="flex flex-col gap-0 h-full">
                    {renderGrid(VIEWS.STRUCTURE)}
                    {selectedId && !selectedId.startsWith('__req__:') && (() => {
                        const node = wbsData.find(n => n.id === selectedId);
                        const assignedReqs = allRequirements.filter(r => {
                            try { return !!JSON.parse(r.wbsNodeAllocations || '{}')[selectedId]; } catch { return false; }
                        });
                        if (!assignedReqs.length) return null;
                        return (
                            <div className="mt-2 px-1 py-3 border-t border-white/10">
                                <p className="text-[10px] uppercase tracking-widest text-blue-400/70 font-bold mb-2 flex items-center gap-1.5">
                                    <Package size={10} />
                                    Wymagania dla: {node?.name} ({assignedReqs.length})
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {assignedReqs.map(r => (
                                        <div key={r.id} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-900/20 border border-blue-500/20 rounded-lg text-blue-300 text-[11px]">
                                            <span>{r.name || r.productName || '—'}</span>
                                            {r.quantity > 0 && <span className="text-blue-400/60 text-[10px]">×{r.quantity}{r.unit ? ` ${r.unit}` : ''}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                    {isManagerOrAdmin && unassignedRequirements.length > 0 && (
                        <div className="mt-3 px-1 py-3 border-t border-white/10">
                            <p className="text-[10px] uppercase tracking-widest text-amber-500/70 font-bold mb-2 flex items-center gap-1.5">
                                <Package size={10} />
                                Koszyk — nieprzypisane ({unassignedRequirements.length})
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {unassignedRequirements.map(req => (
                                    <div key={req.id}
                                        draggable
                                        onDragStart={e => {
                                            e.dataTransfer.setData('application/requirement-id', req.id);
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-900/30 border border-emerald-500/20 rounded-lg text-emerald-300 text-[11px] cursor-grab select-none"
                                    >
                                        <span>{req.name || req.productName || '—'}</span>
                                        {req.quantity && <span className="text-emerald-500/60 text-[10px]">×{req.quantity}{req.unit ? ` ${req.unit}` : ''}</span>}
                                        {selectedId && !selectedId.startsWith('__req__:') && (
                                            <button
                                                onClick={e => { e.stopPropagation(); handleRequirementAssignToWbs(selectedId, req.id); }}
                                                className="ml-1 px-1.5 py-0.5 bg-emerald-600/40 hover:bg-emerald-600/70 rounded text-[9px] font-bold text-emerald-200 cursor-pointer"
                                                title="Przypisz do zaznaczonej gałęzi"
                                            >→ Przypisz</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ), () => handleExportPDF('wbs'), isManagerOrAdmin ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleWbsExtract(); }}
                        disabled={extractingForWbs}
                        className={`flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-emerald-300 text-[10px] font-bold uppercase tracking-widest transition-all flex-shrink-0 ${extractingForWbs ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                        {extractingForWbs ? <div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> : <Sparkles size={11} />}
                        Wyciągnij z dokumentów
                    </button>
            ) : null)}

            {isManagerOrAdmin && renderSection('budget', 'Plan i harmonogram (Budżet)', DollarSign, 'green', (
                <div className="flex flex-col gap-3 h-full">
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-2.5">
                        {budgetSummaryCards}
                    </div>
                    {renderGrid(VIEWS.BUDGET)}
                </div>
            ), () => handleExportPDF('budget'), (
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleExportBudgetExcel();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg text-green-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                        <FileDown size={11} /> Eksport budżetu do Excel
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            budgetImportFileInputRef.current?.click();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-emerald-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                        <FileDown size={11} /> Import budżetu z Excel
                    </button>
                </div>
            ),
            null,
            // extraButtons
            wbsData.filter(n => n.parentId == null).length === 0 ? (
                <button
                    className="ml-2 px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs rounded-lg font-bold shadow border border-emerald-900/40 transition-all"
                    onClick={e => { e.stopPropagation(); addNode(null); }}
                >
                    + Dodaj produkt projektu
                </button>
            ) : null
        )}

            {renderSection('materials2', 'Materiały', Zap, 'yellow', (
                <MaterialRequirementsPanel
                    nodeId={nodeId}
                    versionId={versionId}
                    readOnly={!isManagerOrAdmin}
                    onWbsUpdate={refreshUnified}
                    useWbsRequirementSelection={true}
                    refreshKey={reqRefreshKey}
                    searchQuery={searchQuery}
                />
            ), () => handleExportPDF('materials'))}

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
                                className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-red-300 text-[10px] font-bold uppercase tracking-widest transition-all"
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

            {budgetImportOpen && (
                <div className="fixed inset-0 z-[125] bg-[#05070bcc] backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !budgetImportLoading && setBudgetImportOpen(false)}>
                    <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]" onClick={(e) => e.stopPropagation()}>
                        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Import budżetu z Excel</h3>
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Plik: {budgetImportFileName || '—'}</p>
                            </div>
                            <button
                                onClick={() => !budgetImportLoading && setBudgetImportOpen(false)}
                                className="p-2 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"
                                aria-label="Zamknij import budżetu"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="p-5 overflow-auto max-h-[calc(90vh-64px)] custom-scrollbar space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <label className="text-xs text-gray-300 flex flex-col gap-1">
                                    Zakładka arkusza
                                    <select
                                        value={budgetImportSheetName}
                                        onChange={(e) => {
                                            const nextName = e.target.value;
                                            const nextSheet = budgetImportSheets.find((s) => s.name === nextName);
                                            const nextRows = nextSheet?.rows || [];
                                            setBudgetImportSheetName(nextName);
                                            setBudgetImportRows(nextRows);
                                            setBudgetImportHeaderRow(1);
                                            setBudgetImportLastRow(Math.max(1, nextRows.length));
                                            setBudgetImportMapping(buildBudgetImportAutoMapping(nextRows[0] || []));
                                        }}
                                        className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                    >
                                        {budgetImportSheets.map((sheet) => (
                                            <option key={sheet.name} value={sheet.name}>{sheet.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="text-xs text-gray-300 flex flex-col gap-1">
                                    Wiersz nagłówka
                                    <input
                                        type="number"
                                        min="1"
                                        max={Math.max(1, budgetImportRows.length)}
                                        value={budgetImportHeaderRow}
                                        onChange={(e) => setBudgetImportHeaderRow(Math.max(1, Number(e.target.value) || 1))}
                                        className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                    />
                                </label>
                                <label className="text-xs text-gray-300 flex flex-col gap-1">
                                    Ostatni wiersz budżetu
                                    <input
                                        type="number"
                                        min={Math.max(2, Number(budgetImportHeaderRow) + 1)}
                                        max={Math.max(1, budgetImportRows.length)}
                                        value={budgetImportLastRow}
                                        onChange={(e) => setBudgetImportLastRow(e.target.value)}
                                        onBlur={(e) => {
                                            const minRow = Math.max(2, Number(budgetImportHeaderRow) + 1);
                                            const maxRow = Math.max(1, budgetImportRows.length);
                                            const parsed = Number(e.target.value);
                                            const safeValue = Number.isFinite(parsed) ? parsed : minRow;
                                            setBudgetImportLastRow(Math.max(minRow, Math.min(maxRow, safeValue)));
                                        }}
                                        className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                    />
                                </label>
                            </div>

                            <div className="rounded-xl border border-white/10 overflow-hidden">
                                <div className="px-3 py-2 text-[11px] uppercase tracking-widest text-gray-400 bg-white/5">Mapowanie kolumn Excel → aplikacja</div>
                                <div className="max-h-[260px] overflow-auto custom-scrollbar divide-y divide-white/5">
                                    {BUDGET_IMPORT_FIELD_DEFS.map((field) => (
                                        <div key={field.key} className="grid grid-cols-[240px,1fr] gap-3 px-3 py-2 items-center">
                                            <div className="text-xs text-gray-300">{field.label}</div>
                                            <select
                                                value={budgetImportMapping[field.key] ?? ''}
                                                onChange={(e) => setBudgetImportMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                                className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                                            >
                                                <option value="">(nie mapuj)</option>
                                                {budgetImportColumnOptions.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 overflow-auto">
                                <table className="min-w-full text-xs">
                                    <thead className="bg-white/5">
                                        <tr>
                                            <th className="px-2 py-2 text-left text-gray-300">#</th>
                                            {(budgetImportRows[budgetImportHeaderRow - 1] || []).slice(0, 8).map((h, idx) => (
                                                <th key={idx} className="px-2 py-2 text-left text-gray-300">{excelColumnLetter(idx + 1)}: {h || '(pusta)'}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {budgetImportRows.slice(Math.max(0, budgetImportHeaderRow), Math.max(0, budgetImportHeaderRow) + 5).map((row, rowIdx) => (
                                            <tr key={rowIdx} className="border-t border-white/5">
                                                <td className="px-2 py-1 text-gray-500">{budgetImportHeaderRow + rowIdx + 1}</td>
                                                {row.slice(0, 8).map((cell, cellIdx) => (
                                                    <td key={cellIdx} className="px-2 py-1 text-gray-200 max-w-[220px] truncate" title={cell}>{cell || '—'}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex items-center justify-end gap-2">
                                <button
                                    onClick={() => setBudgetImportOpen(false)}
                                    disabled={budgetImportLoading}
                                    className="px-4 py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/10 transition-all disabled:opacity-50"
                                >
                                    Anuluj
                                </button>
                                <button
                                    onClick={applyBudgetImport}
                                    disabled={budgetImportLoading}
                                    className="px-4 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 transition-all disabled:opacity-50"
                                >
                                    {budgetImportLoading ? 'Importowanie...' : 'Importuj'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {previewAttachment && (
                <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setPreviewAttachment(null)}>
                    <div className="max-w-[92vw] max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
                        {previewAttachment.fileType === 'IMAGE' && previewAttachment.fileUrl ? (
                            <img
                                src={`${API_URL}/schematics/file/${previewAttachment.fileUrl}`}
                                alt={previewAttachment.fileName || 'attachment'}
                                className="max-w-[92vw] max-h-[88vh] w-auto h-auto object-contain rounded-xl border border-white/15 shadow-2xl"
                            />
                        ) : (
                            <div className="bg-[#0b0f17] border border-white/10 rounded-xl p-6 min-w-[360px]">
                                <h4 className="text-sm font-bold text-white mb-2">Podgląd załącznika</h4>
                                <p className="text-xs text-gray-300 mb-4">{previewAttachment.fileName || 'plik'}</p>
                                {previewAttachment.fileUrl && (
                                    <a
                                        href={`${API_URL}/schematics/file/${previewAttachment.fileUrl}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-cyan-300 text-sm hover:underline"
                                    >
                                        Otwórz plik
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
