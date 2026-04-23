import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { Layers, Package, DollarSign, ChevronRight, ChevronDown, Plus, Trash2, FolderPlus, RefreshCw, HelpCircle, Save, CheckCircle, FileDown, X, LayoutList, Zap, Sparkles, ListTree, CalendarDays } from 'lucide-react';
import { API_URL } from '../../../config';
import MaterialRequirementsPanel from './MaterialRequirementsPanel';
import WbsMaterialsPanel from './WbsMaterialsPanel';
import TasksCalendarSection from './TasksCalendarSection';
import { fmtPLN, fmtQty, fmtPct, STRUCTURE_STATUS_META, normKey, makeMaterialLookupKey, parseLocaleNumber, normalizeStatusCode, TYPE_LABELS, TYPE_OPTIONS, UNIT_OPTIONS, MATERIAL_STATUS_LABELS, defaultUnitForType } from './wbsConstants';
import { exportProjectPdf } from '../../../utils/projectPdfExport';
import WBSHybridTable from './WBSHybridTable';
import BudgetTable from './BudgetTable';


const VIEWS = {
    STRUCTURE: 'structure',
    MATERIALS: 'materials',
    BUDGET: 'budget',
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

const BUDGET_IMPORT_FIELD_DEFS = [
    { key: 'subjectName', label: 'Przedmiot (gałąź nadrzędna)' },
    { key: 'parentName', label: 'Podgałąź (opcjonalne grupowanie)' },
    { key: 'name', label: 'Nazwa pozycji' },
    { key: 'type', label: 'Typ (praca/materiał/sprzęt...)' },
    { key: 'quantity', label: 'Ilość' },
    { key: 'unit', label: 'Jednostka' },
    { key: 'unitCost', label: 'Koszt jednostkowy' },
    { key: 'totalCost', label: 'Wartość całkowita' },
    { key: 'margin', label: 'Marża (%)' },
    { key: 'discount', label: 'Rabat (%)' },
    { key: 'comment', label: 'Komentarz / uwagi' },
];

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


// ─── Main Component ─────────────────────────────────────────────────────────

export default function UnifiedWbsPanel({ nodeId, versionId, onWbsUpdate, userRoles = [], projectName = '', orderName = '', searchQuery = '', setLeftVisible, setAiVisible }) {
    const [wbsData, setWbsData] = useState([]);
    const wbsDataRef = useRef(wbsData);
    wbsDataRef.current = wbsData;
    const [expandedSection, setExpandedSection] = useState('wbs-hybrid');
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

    // ── WBS Hybrid Tree state ──
    const [wbsTree, setWbsTree] = useState({ items: [] });
    const wbsTreeRef = useRef(wbsTree);
    // Synchronicznie aktualizuj ref przez wrapper — nie polegaj na useEffect (może nie zdążyć przed save debounce)
    const setWbsTreeAndRef = useCallback((updater) => {
        setWbsTree(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            wbsTreeRef.current = next;
            return next;
        });
    }, []);

    const materialRef = useRef();
    const strategyRef = useRef();
    const strategyLoadedRef = useRef(false);
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
    const materialsExportFn = useRef(null);
    const materialsPdfExportFn = useRef(null);

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
        setMapped('parentName', ['galaz', 'gałąź', 'podgalaz', 'podgałąź', 'group', 'section']);
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
            let wbsItemsById = new Map();
            if (res.ok) {
                const data = await res.json();
                setWbsData(data.items || []);
                wbsItemsById = new Map((data.items || []).map(n => [n.id, n]));
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
                setAllRequirements(Array.isArray(requirements) ? requirements : []);
                const nextCosts = {};
                const nextLookupMeta = {};
                let projectItemNamesById = {};

                try {
                    const reqRes = await fetch(`${API_URL}/order-requirements/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
                    if (reqRes.ok) {
                        const text = await reqRes.text();
                        if (text) {
                            const reqData = JSON.parse(text);
                            const tree = JSON.parse(reqData.wbsTree || '{}');
                            const normalizedTree = Array.isArray(tree.items) ? tree : { items: [] };

                            // Reconcile: remove nodes deleted from wbs_nodes so saveTree() won't re-insert them
                            const reconcileNodes = (nodes) => (nodes || [])
                                .filter(n => !n.id || !wbsItemsById.size || wbsItemsById.has(n.id))
                                .map(n => ({ ...n, children: reconcileNodes(n.children) }));
                            const countNodes = (nodes) => (nodes || []).reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
                            const originalCount = countNodes(normalizedTree.items);
                            const reconciledItems = wbsItemsById.size > 0 ? reconcileNodes(normalizedTree.items) : normalizedTree.items;
                            const wasStale = countNodes(reconciledItems) < originalCount;

                            // Merge relational fields (comment, status, owner) from wbsData into tree nodes
                            const mergeRelational = nodes => nodes.map(n => {
                                const rel = wbsItemsById.get(n.id);
                                const merged = rel ? { ...n, comment: rel.comment || n.comment, status: rel.status || n.status, owner: rel.owner || n.owner, unit: rel.unit || n.unit, quantity: rel.quantity ?? n.quantity } : n;
                                return merged.children?.length ? { ...merged, children: mergeRelational(merged.children) } : merged;
                            });
                            const cleanedTree = { ...normalizedTree, items: mergeRelational(reconciledItems) };
                            setWbsTreeAndRef(cleanedTree);

                            // If stale nodes were removed, immediately persist to prevent re-insertion by saveTree()
                            if (wasStale) {
                                fetch(`${API_URL}/order-requirements`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ nodeId, versionId, wbsTree: JSON.stringify(cleanedTree) }),
                                }).catch(e => console.error('[WBS reconcile save]', e));
                            }

                            projectItemNamesById = Object.fromEntries(
                                (tree.items || [])
                                    .filter(item => !item.type || item.type === 'product')
                                    .map(item => [item.id, item.name])
                            );
                        }
                    }
                } catch (e) {
                    // Silent — project items mapping is non-critical
                }

                // Build WBS node ID → root parent name map from relational WBS data
                // Użyj ref zamiast stanu aby uniknąć pętli fetchData → setWbsData → fetchData
                const currentWbs = wbsDataRef.current || [];
                const wbsNodesById = new Map(currentWbs.map(n => [n.id, n]));
                const wbsNodeToRootName = {};
                for (const node of currentWbs) {
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
    }, [nodeId, versionId]);

    // Lekkie odświeżenie kosztów materiałów — bez setWbsData (nie cofa edytów inline)
    const refreshMaterialCosts = useCallback(async (listIdOverride = null) => {
        try {
            const params = new URLSearchParams();
            if (versionId) params.append('versionId', String(versionId));
            if (listIdOverride) params.append('listId', String(listIdOverride));
            const qs = params.toString();
            const res = await fetch(`${API_URL}/material-requirements/node/${nodeId}${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
            if (!res.ok) return;
            const requirements = await res.json();
            setAllRequirements(Array.isArray(requirements) ? requirements : []);
            const nextCosts = {};
            const nextLookupMeta = {};

            const tree = wbsTreeRef.current || { items: [] };
            const projectItemNamesById = Object.fromEntries(
                (tree.items || [])
                    .filter(item => !item.type || item.type === 'product')
                    .map(item => [item.id, item.name])
            );
            const currentWbs = wbsDataRef.current || [];
            const wbsNodesById = new Map(currentWbs.map(n => [n.id, n]));
            for (const node of currentWbs) {
                let current = node;
                while (current?.parentId) {
                    const parent = wbsNodesById.get(current.parentId);
                    if (!parent) break;
                    current = parent;
                }
                if (!projectItemNamesById[node.id] && current?.name) {
                    projectItemNamesById[node.id] = current.name;
                }
            }

            for (const req of Array.isArray(requirements) ? requirements : []) {
                const statusCode = normalizeStatusCode(req.status);
                const selected = (req.proposals || []).find((p) => p.isSelected);
                const unitNet = parseFloat(req.priceNetto ?? selected?.priceNetto) || 0;
                const nameCandidates = Array.from(new Set([req.name].filter(Boolean).map(n => String(n).trim())));

                const registerLookupMeta = (subjectName, quantity) => {
                    if (!subjectName || !nameCandidates.length) return;
                    for (const candidateName of nameCandidates) {
                        const key = makeMaterialLookupKey(subjectName, candidateName);
                        if (!nextLookupMeta[key]) nextLookupMeta[key] = { statuses: [], cost: 0, quantity: 0, unit: '' };
                        if (statusCode && !nextLookupMeta[key].statuses.includes(statusCode)) nextLookupMeta[key].statuses.push(statusCode);
                        if (quantity > 0) nextLookupMeta[key].quantity += quantity;
                        if (!nextLookupMeta[key].unit && req.unit) nextLookupMeta[key].unit = String(req.unit);
                        if (unitNet > 0 && quantity > 0) nextLookupMeta[key].cost += unitNet * quantity;
                    }
                };

                let alloc = {};
                try { alloc = req.wbsNodeAllocations ? JSON.parse(req.wbsNodeAllocations) : {}; } catch {}
                const allocEntries = Object.entries(alloc || {});

                if (allocEntries.length > 0) {
                    for (const [wbsNodeId, qtyRaw] of allocEntries) {
                        const qty = parseFloat(qtyRaw) || 0;
                        if (!wbsNodeId || qty <= 0) continue;
                        registerLookupMeta(projectItemNamesById[wbsNodeId], qty);
                        if (unitNet > 0) nextCosts[wbsNodeId] = (nextCosts[wbsNodeId] || 0) + unitNet * qty;
                    }
                    continue;
                }

                if (req.wbsNodeId) {
                    const qty = parseFloat(req.quantity) || 0;
                    if (qty > 0) {
                        registerLookupMeta(projectItemNamesById[req.wbsNodeId], qty);
                        if (unitNet > 0) nextCosts[req.wbsNodeId] = (nextCosts[req.wbsNodeId] || 0) + unitNet * qty;
                    }
                }
            }
            setMaterialCostsByNode(nextCosts);
            setMaterialMetaByLookupKey(nextLookupMeta);
        } catch (e) { console.error('Refresh material costs error:', e); }
    }, [nodeId, versionId]);

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

            // Fallback: szukaj po nazwie gdy brak dopasowania po ID
            let targetReq = null;
            if (linked.length) {
                const exactByName = linked.find(req => normalizedNodeName && normKey(req.name) === normalizedNodeName);
                targetReq = exactByName || linked[0];
            } else if (normalizedNodeName) {
                targetReq = requirements.find(req =>
                    ['MATERIAL', 'DEVICE'].includes(String(req.type || '').toUpperCase()) &&
                    normKey(req.name) === normalizedNodeName
                ) || null;
            }

            if (!targetReq) return;

            // Gdy znaleziony po nazwie (nie po ID) — re-linkuj do własnego wbsNodeId i ustaw qty wprost
            const foundById = linked.includes(targetReq);
            let nextAlloc;
            let totalQty;
            if (foundById) {
                let currentAlloc = {};
                try { currentAlloc = targetReq.wbsNodeAllocations ? JSON.parse(targetReq.wbsNodeAllocations) : {}; } catch { currentAlloc = {}; }
                nextAlloc = { ...(currentAlloc || {}), [wbsNodeId]: nextQuantity };
                totalQty = Object.values(nextAlloc).reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
            } else {
                // Re-linkuj: zastąp alokacje własnym wbs_node id
                nextAlloc = { [wbsNodeId]: nextQuantity };
                totalQty = nextQuantity;
            }

            const patchRes = await fetch(`${API_URL}/material-requirements/${targetReq.id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({
                    quantity: totalQty,
                    wbsNodeId: wbsNodeId,
                    wbsNodeIds: JSON.stringify([wbsNodeId]),
                    wbsNodeAllocations: JSON.stringify(nextAlloc),
                    isAiAssigned: false,
                }),
            });
            if (patchRes.ok) {
                // Optimistic local update — nie wywołuj fetchData() bo nadpisałby edytowany wbsData
                const updated = { ...targetReq, quantity: totalQty, wbsNodeAllocations: JSON.stringify(nextAlloc) };
                setAllRequirements(prev => prev.map(r => r.id === targetReq.id ? updated : r));
            }
            // Don't call fetchData() here — it overwrites local wbsData and reverts user edits
        } catch (e) {
            console.error('Sync material requirements from WBS quantity error:', e);
        }
    }, [nodeId, versionId, authHeaders]);

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
        const canManage = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
        try {
            const promises = [];
            // GET /users requires ADMIN/MANAGER role
            promises.push(canManage
                ? fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${t}` } })
                : Promise.resolve(null));
            promises.push(fetch(`${API_URL}/users/by-role/LOGISTYK`, { headers: { Authorization: `Bearer ${t}` } }));
            // GET /process-tree/:id/permissions requires TREE_VIEW permission (managers only)
            promises.push(nodeId && canManage
                ? fetch(`${API_URL}/process-tree/${nodeId}/permissions`, { headers: { Authorization: `Bearer ${t}` } })
                : Promise.resolve(null));

            const [usersRes, logistykRes, permissionsRes] = await Promise.all(promises);

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
    }, [nodeId, userRoles]);

    const getStrategyText = useCallback(() => strategyRef.current ? strategyRef.current.value : wbsDescription, [wbsDescription]);
    const setStrategyText = useCallback((val) => { if (strategyRef.current) strategyRef.current.value = val; }, []);

    // Reset strategy state when switching nodes/versions so the new record loads fresh.
    // Pending autosave timeouts are left intact — they capture the old saveStrategy closure
    // (with the old nodeId) so typed-but-unsaved text still flushes to the correct record.
    useEffect(() => {
        strategyLoadedRef.current = false;
        setWbsDescription('');
    }, [nodeId, versionId]);

    const fetchStrategy = useCallback(async () => {
        try {
            const url = versionId ? `${API_URL}/order-requirements/${nodeId}?versionId=${versionId}` : `${API_URL}/order-requirements/${nodeId}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) {
                const text = await res.text();
                const data = text ? JSON.parse(text) : null;
                if (data && !strategyLoadedRef.current) {
                    setWbsDescription(data.wbsDescription || '');
                    strategyLoadedRef.current = true;
                }
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

    // ── Hybrid WBS save ──
    const hybridSaveRef = useRef(false);
    const hybridSavePending = useRef(false);
    const hybridSaveTimeout = useRef(null);
    const handleSaveHybridWBS = useCallback(async () => {
        if (hybridSaveTimeout.current) clearTimeout(hybridSaveTimeout.current);
        hybridSaveTimeout.current = setTimeout(async () => {
            if (hybridSaveRef.current) {
                hybridSavePending.current = true; // kolejkuj — wyślij po zakończeniu bieżącego
                return;
            }
            hybridSaveRef.current = true;
            hybridSavePending.current = false;
            try {
                await fetch(`${API_URL}/order-requirements`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        nodeId,
                        versionId,
                        wbsTree: JSON.stringify(wbsTreeRef.current),
                    }),
                });
                onWbsUpdate?.();
            } catch (err) {
                console.error('[HybridWBS save]', err);
            } finally {
                hybridSaveRef.current = false;
                if (hybridSavePending.current) {
                    hybridSavePending.current = false;
                    // retry z najnowszymi danymi
                    setTimeout(async () => {
                        hybridSaveRef.current = true;
                        try {
                            await fetch(`${API_URL}/order-requirements`, {
                                method: 'POST',
                                headers: authHeaders(),
                                body: JSON.stringify({ nodeId, versionId, wbsTree: JSON.stringify(wbsTreeRef.current) }),
                            });
                            onWbsUpdate?.();
                        } catch (e) { console.error('[HybridWBS retry]', e); }
                        finally { hybridSaveRef.current = false; }
                    }, 0);
                }
            }
        }, 400);
    }, [nodeId, versionId, authHeaders, onWbsUpdate]);

    const assignedUsers = useMemo(() => {
        if (!Array.isArray(projectUsers) || !projectUsers.length) return [];
        if (!Array.isArray(nodeTeamIds) || !nodeTeamIds.length) return projectUsers;
        return projectUsers.filter(u => Array.isArray(u?.teams) && u.teams.some(t => nodeTeamIds.includes(t.id)));
    }, [projectUsers, nodeTeamIds]);

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
        const text = strategyRef.current ? strategyRef.current.value : wbsDescription;
        if (immediate) { saveStrategy(text); return; }
        strategySaveTimeout.current = setTimeout(() => saveStrategy(text), 1500);
    }, [wbsDescription, saveStrategy]);

    const wrapSelection = useCallback((before, after = before, placeholder = 'tekst') => {
        const ta = strategyRef.current;
        if (!ta) return;
        const text = ta.value;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const selected = text.slice(start, end);
        const insert = `${before}${selected || placeholder}${after}`;
        const next = `${text.slice(0, start)}${insert}${text.slice(end)}`;
        setWbsDescription(next);
        setTimeout(() => {
            ta.focus();
            const cursor = selected ? start + insert.length : start + before.length + placeholder.length;
            ta.setSelectionRange(cursor, cursor);
        }, 0);
        if (strategySaveTimeout.current) clearTimeout(strategySaveTimeout.current);
        strategySaveTimeout.current = setTimeout(() => saveStrategy(next), 1500);
    }, [saveStrategy]);

    const prefixSelectionLines = useCallback((prefix) => {
        const ta = strategyRef.current;
        if (!ta) return;
        const text = ta.value;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const selected = text.slice(start, end);

        let next, cursorPos;
        if (selected) {
            const transformed = selected.split('\n').map(line => `${prefix}${line}`).join('\n');
            next = `${text.slice(0, start)}${transformed}${text.slice(end)}`;
            cursorPos = start + transformed.length;
        } else {
            // Znajdź początek bieżącej linii
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            next = `${text.slice(0, lineStart)}${prefix}${text.slice(lineStart)}`;
            cursorPos = lineStart + prefix.length + (start - lineStart);
        }

        setWbsDescription(next);
        setTimeout(() => {
            ta.focus();
            ta.setSelectionRange(cursorPos, cursorPos);
        }, 0);
        if (strategySaveTimeout.current) clearTimeout(strategySaveTimeout.current);
        strategySaveTimeout.current = setTimeout(() => saveStrategy(next), 1500);
    }, [saveStrategy]);

    const handleStrategyKeyDown = useCallback((e) => {
        if (e.key !== 'Enter') return;
        const ta = strategyRef.current;
        if (!ta) return;
        const text = ta.value;
        const pos = ta.selectionStart;
        const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
        const lineEnd = text.indexOf('\n', pos);
        const fullLine = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);

        const ulMatch = fullLine.match(/^- (.*)/);
        const olMatch = fullLine.match(/^(\d+)\. (.*)/);

        if (ulMatch) {
            e.preventDefault();
            const content = ulMatch[1].trim();
            let newText, np;
            if (!content) {
                newText = text.slice(0, lineStart) + text.slice(lineStart + 2);
                np = lineStart;
            } else {
                const insert = '\n- ';
                newText = text.slice(0, pos) + insert + text.slice(pos);
                np = pos + insert.length;
            }
            setWbsDescription(newText);
            setTimeout(() => { ta.setSelectionRange(np, np); ta.focus(); }, 0);
            if (strategySaveTimeout.current) clearTimeout(strategySaveTimeout.current);
            strategySaveTimeout.current = setTimeout(() => saveStrategy(newText), 1500);
            return;
        }

        if (olMatch) {
            e.preventDefault();
            const n = parseInt(olMatch[1], 10);
            const content = olMatch[2].trim();
            const prefixLen = String(n).length + 2;
            let newText, np;
            if (!content) {
                newText = text.slice(0, lineStart) + text.slice(lineStart + prefixLen);
                np = lineStart;
            } else {
                const insert = `\n${n + 1}. `;
                newText = text.slice(0, pos) + insert + text.slice(pos);
                np = pos + insert.length;
            }
            setWbsDescription(newText);
            setTimeout(() => { ta.setSelectionRange(np, np); ta.focus(); }, 0);
            if (strategySaveTimeout.current) clearTimeout(strategySaveTimeout.current);
            strategySaveTimeout.current = setTimeout(() => saveStrategy(newText), 1500);
            return;
        }
    }, [saveStrategy, setWbsDescription]);

    const renderStrategyHtml = useCallback((text) => {
        const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const lines = (text || '').split('\n');
        let html = '';
        let inUl = false;
        let inOl = false;
        const closeList = () => {
            if (inUl) { html += '</ul>'; inUl = false; }
            if (inOl) { html += '</ol>'; inOl = false; }
        };
        for (const raw of lines) {
            const h3m = raw.match(/^### (.+)/);
            const h2m = raw.match(/^## (.+)/);
            const h1m = raw.match(/^# (.+)/);
            const ulm = raw.match(/^- (.*)/);
            const olm = raw.match(/^(\d+)\. (.*)/);
            if (h3m) {
                closeList();
                html += `<h3 style="font-size:12px;font-weight:bold;margin:12px 0 2px 0;padding-left:4em">${bold(h3m[1])}</h3>`;
            } else if (h2m) {
                closeList();
                html += `<h2 style="font-size:13px;font-weight:bold;margin:14px 0 3px 0;padding-left:2em">${bold(h2m[1])}</h2>`;
            } else if (h1m) {
                closeList();
                html += `<h1 style="font-size:14px;font-weight:bold;margin:16px 0 4px 0;padding-left:0">${bold(h1m[1])}</h1>`;
            } else if (ulm) {
                if (inOl) { html += '</ol>'; inOl = false; }
                if (!inUl) { html += '<ul style="margin:4px 0 8px 1.5em;padding-left:1em">'; inUl = true; }
                html += `<li>${bold(ulm[1])}</li>`;
            } else if (olm) {
                if (inUl) { html += '</ul>'; inUl = false; }
                if (!inOl) { html += '<ol style="margin:4px 0 8px 1.5em;padding-left:1.2em">'; inOl = true; }
                html += `<li>${bold(olm[2])}</li>`;
            } else if (raw.trim() === '') {
                closeList();
                html += '<br>';
            } else {
                closeList();
                html += `<p style="margin:0 0 4px 0">${bold(raw)}</p>`;
            }
        }
        closeList();
        return html;
    }, []);

    const handleExportPDF = async (sectionKey = 'all') => {
        const date = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });
        const show = (key) => sectionKey === key || sectionKey === 'all';

        let logoDataUrl = '';
        try {
            const logoRes = await fetch(`${window.location.origin}/airtel-logo-services.png`);
            if (logoRes.ok) {
                const blob = await logoRes.blob();
                logoDataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
            }
        } catch (_) {}
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
                    <td>${esc(n.unit || defaultUnitForType(n.type))}</td>
                    <td class="num">${fmtPct(n.margin)}</td>
                    <td class="num">${fmtPLN(n.totalCost)}</td>
                    <td class="num">${fmtPLN(n.totalPrice)}</td>
                    <td style="text-align:left;word-wrap:break-word;white-space:normal;max-width:120px">${esc(n.comment || '')}</td>` : `
                    <td>${esc(TYPE_LABELS[n.type] || n.type || '')}</td>
                    <td>${esc(n.status || '')}</td>
                    <td>${esc(n.owner || '')}</td>
                    <td>${markerSummary(n.id)}</td>`;
                return `<tr>
                    <td style="padding-left:${8 + indent}px;${nameStyle};text-align:left">${depth > 0 ? '└ ' : ''}${(n.name || '').replace(/</g, '&lt;')}</td>
                    ${budgetCols}
                </tr>${buildTreeRows(n.id, depth + 1, includeBudget)}`;
            }).join('');
        };

        const strategyHtml = show('strategy') ? `
            <div class="section">
                <div class="section-header">Jak to chcemy zrobić</div>
                <div class="strategy-text">${renderStrategyHtml(getStrategyText() || 'Brak treści strategii')}</div>
            </div>` : '';

        const wbsHtml = show('wbs') ? `
            <div class="section">
                <div class="section-header">Struktura zadań projektu</div>
                <table>
                    <thead><tr><th>Nazwa</th><th>Typ</th><th>Status</th><th>Osoba</th><th>Znaczniki</th></tr></thead>
                    <tbody>${wbsData.length ? buildTreeRows(null, 0, false) : '<tr><td colspan="5">Brak danych WBS</td></tr>'}</tbody>
                </table>
            </div>` : '';

        const _bItems = wbsData.filter(n => n.parentId != null);
        const _bTotalCost = _bItems.reduce((s, n) => s + (parseFloat(n.totalCost) || 0), 0);
        const _bTotalPrice = _bItems.reduce((s, n) => s + (parseFloat(n.totalPrice) || 0), 0);

        // Per-subject (top-level branch) breakdown
        const _idToParent = Object.fromEntries(wbsData.map(n => [n.id, n.parentId]));
        const _getRootId = (id) => { let c = id, s = 20; while (_idToParent[c] && s-- > 0) c = _idToParent[c]; return c; };
        const _rootNames = Object.fromEntries(wbsData.filter(n => !n.parentId).map(n => [n.id, n.name]));
        const _subjectMap = {};
        const _typeMap = {};
        for (const item of _bItems) {
            const rid = _getRootId(item.id);
            const rn = _rootNames[rid] || '(inne)';
            if (!_subjectMap[rid]) _subjectMap[rid] = { name: rn, cost: 0, price: 0 };
            _subjectMap[rid].cost += parseFloat(item.totalCost) || 0;
            _subjectMap[rid].price += parseFloat(item.totalPrice) || 0;
            const t = item.type || '—';
            if (!_typeMap[t]) _typeMap[t] = { label: TYPE_LABELS[t] || t, cost: 0, price: 0 };
            _typeMap[t].cost += parseFloat(item.totalCost) || 0;
            _typeMap[t].price += parseFloat(item.totalPrice) || 0;
        }
        const _parsedPct = parseFloat(String(budgetDiscountPercent || '').replace(',', '.')) || 0;
        const _parsedAmt = parseFloat(String(budgetDiscountAmount || '').replace(',', '.')) || 0;
        const _discFromPct = _parsedPct > 0 ? _bTotalPrice * _parsedPct / 100 : 0;
        const _revAfterDisc = Math.max(0, _bTotalPrice - _discFromPct - (_parsedAmt > 0 ? _parsedAmt : 0));
        const _profit = _revAfterDisc - _bTotalCost;
        const _marginPct = _revAfterDisc > 0 ? (_profit / _revAfterDisc) * 100 : 0;

        const _summaryRow = (label, cost, price, bold = false, dark = false) => {
            const p = price - cost;
            const m = price > 0 ? (p / price) * 100 : 0;
            const style = dark ? 'background:#e5e7eb;font-size:15px;font-weight:bold;color:#111' : bold ? 'font-weight:bold' : '';
            const nc = '';
            const pc = dark ? (p >= 0 ? '#86efac' : '#fca5a5') : (p >= 0 ? '#16a34a' : '#dc2626');
            return `<tr style="${style}">
                <td style="text-align:left${dark ? ';color:#fff' : ''}">${esc(label)}</td>
                <td class="num" ${nc}>${fmtPLN(cost)}</td>
                <td class="num" ${nc}>${fmtPLN(price)}</td>
                <td class="num" style="color:${pc}">${fmtPLN(p)}</td>
                <td class="num" style="color:${pc}">${m.toLocaleString('pl-PL', { minimumFractionDigits: 1 })}%</td>
            </tr>`;
        };

        const _budgetSummaryHtml = sectionKey === 'budget' && isManagerOrAdmin ? `
            <div class="section summary-section">
                <div class="section-header">Podsumowanie budżetu</div>
                <div class="summary-block">
                    <div class="table-title">Podział wg typu pozycji</div>
                    <table>
                        <thead><tr><th style="text-align:left">Typ</th><th>Koszt</th><th>Przychód</th><th>Zysk</th><th>Marża%</th></tr></thead>
                        <tbody>
                            ${Object.values(_typeMap).map(t => _summaryRow(t.label, t.cost, t.price)).join('')}
                            ${_summaryRow('Razem', _bTotalCost, _bTotalPrice, true, true)}
                        </tbody>
                    </table>
                </div>
                <div class="summary-block">
                    <div class="table-title">Podział wg przedmiotu projektu</div>
                    <table>
                        <thead><tr><th style="text-align:left">Przedmiot</th><th>Koszt</th><th>Przychód</th><th>Zysk</th><th>Marża%</th></tr></thead>
                        <tbody>
                            ${Object.values(_subjectMap).map(s => _summaryRow(s.name, s.cost, s.price)).join('')}
                            ${_summaryRow('Razem', _bTotalCost, _bTotalPrice, true, true)}
                        </tbody>
                    </table>
                </div>
                <div class="summary-block">
                    <div class="table-title">Wyniki finansowe</div>
                    <table class="kv">
                        <tbody>
                            <tr><th>Koszt całkowity</th><td class="num">${fmtPLN(_bTotalCost)} PLN</td></tr>
                            <tr><th>Przychód przed rabatami</th><td class="num">${fmtPLN(_bTotalPrice)} PLN</td></tr>
                            ${_parsedPct > 0 ? `<tr><th>Rabat procentowy</th><td class="num">${_parsedPct.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}%</td></tr>` : ''}
                            ${_parsedAmt > 0 ? `<tr><th>Rabat kwotowy</th><td class="num">${fmtPLN(_parsedAmt)} PLN</td></tr>` : ''}
                            <tr style="font-weight:bold"><th>Przychód po rabatach</th><td class="num">${fmtPLN(_revAfterDisc)} PLN</td></tr>
                            <tr><th>Zysk</th><td class="num" style="color:${_profit >= 0 ? '#16a34a' : '#dc2626'}">${fmtPLN(_profit)} PLN</td></tr>
                            <tr><th>Marża</th><td class="num" style="color:${_profit >= 0 ? '#16a34a' : '#dc2626'}">${_marginPct.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}%</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>` : '';

        const budgetHtml = show('budget') && isManagerOrAdmin ? `
            <div class="section">
                <div class="section-header">Budżet</div>
                <table class="budget-table">
                    <thead><tr><th style="width:26%;text-align:left">Pozycja</th><th>Koszt jednostkowy</th><th>Ilość</th><th>Jednostki</th><th>Marża%</th><th>Koszt całościowy</th><th>Suma netto</th><th style="width:18%;text-align:left">Komentarz</th></tr></thead>
                    <tbody>${wbsData.length ? buildTreeRows(null, 0, true) : '<tr><td colspan="8">Brak danych budżetowych</td></tr>'}</tbody>
                    <tfoot><tr style="background:#f3f4f6;font-weight:bold;font-size:15px;color:#111">
                        <td colspan="5" style="text-align:right;text-transform:uppercase;letter-spacing:0.05em;padding:7px 8px">Razem:</td>
                        <td class="num" style="color:#111">${fmtPLN(_bTotalCost)} PLN</td>
                        <td class="num" style="color:#111">${fmtPLN(_bTotalPrice)} PLN</td>
                        <td></td>
                    </tr></tfoot>
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
                return `<tr><td style="text-align:left">${name}</td><td>${type}</td><td class="num">${qty}</td><td>${unit}</td><td>${status}</td><td class="num">${price}</td><td style="font-size:9px;color:#6b7280;text-align:left">${spec}</td></tr>`;
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
<title>${esc(projectName || orderName || 'Projekt')}_${esc(orderName || 'zamowienie')}_projekt</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 0 6px 28px 6px; }
  .doc-header { border-bottom: 3px solid #1a1a2e; padding: 18px 0 10px 0; margin: 0 0 18px 0; break-after: avoid; page-break-after: avoid; display: flex; align-items: flex-start; gap: 16px; }
  .doc-header-logo { height: 48px; width: auto; object-fit: contain; flex-shrink: 0; }
  .doc-header-text { flex: 1; }
  .doc-header h1 { font-size: 20px; margin: 0 0 2px 0; }
  .doc-header .sub { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #6b7280; }
  .doc-header .meta { font-size: 10px; color: #9ca3af; margin-top: 4px; }
  .section { margin-bottom: 22px; }
  .section-header { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.12em; background: #1a1a2e; color: #fff; padding: 7px 12px; break-after: avoid; page-break-after: avoid; }
  .strategy-text { padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; line-height: 1.6; }
  .strategy-text p { margin: 0 0 4px 0; }
  .strategy-text p:empty { display: none; margin: 0; }
  .strategy-text h1:first-child, .strategy-text h2:first-child, .strategy-text h3:first-child { margin-top: 0; }
  .strategy-text ul, .strategy-text ol { margin: 4px 0 8px 1.5em; padding-left: 1em; }
  .strategy-text li { margin: 2px 0; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; text-align: center; }
  td.num { text-align: center; font-family: monospace; font-size: 10px; }
  tr:nth-child(even) td { background: #f9fafb; }
  .budget-table td { font-size: 12px; }
  .budget-table td.num { font-size: 11px; }
  table.kv th { width: 50%; background: #f9fafb; text-transform: none; font-size: 10px; color: #4b5563; text-align: left; border-bottom: 1px solid #e5e7eb; }
  table.kv td { font-size: 11px; color: #111; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1.6fr; gap: 16px; padding: 12px 0 0 0; }
  .summary-block { margin-bottom: 24px; }
  .table-title { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; color: #111; margin-bottom: 6px; padding: 5px 0; border-bottom: 2px solid #1a1a2e; }
  th { background: #f3f4f6; color: #374151; padding: 7px 8px; text-align: center; font-size: 12px; font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #d1d5db; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  @page { margin: 0; size: A4; }
  .budget-table { table-layout: fixed; word-wrap: break-word; }
  @media print {
    body { padding: 14mm 7mm 14mm 7mm; }
    .summary-grid { display: block; }
    .summary-block { margin-bottom: 16px; }
    .summary-section { page-break-before: always; }
  }
</style>
</head>
<body>
<div class="doc-header">
  ${logoDataUrl ? `<img class="doc-header-logo" src="${logoDataUrl}" alt="Logo" />` : ''}
  <div class="doc-header-text">
    <h1>${esc(orderName || projectName || 'Zamówienie')}</h1>
    <div class="sub">${{ strategy: 'Jak to chcemy zrobić', budget: 'Budżet', 'wbs-hybrid': 'Struktura projektu', wbs: 'Struktura projektu', materials: 'Materiały' }[sectionKey] || 'Planowanie'}</div>
    <div class="meta">Przygotowano: ${date}</div>
  </div>
</div>
${strategyHtml}
${wbsHtml}
${budgetHtml}
${_budgetSummaryHtml}
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
        const rows = buildRows(VIEWS.BUDGET);

        if (!rows.length) {
            alert('Brak danych budżetowych do eksportu.');
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const safeOrderName = String(orderName || projectName || 'zamowienie').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'zamowienie';
        const summarySheet = workbook.addWorksheet(`${safeOrderName}_podsumowanie`);
        const budgetSheet = workbook.addWorksheet(`${safeOrderName}_budzet`);
        const exportDate = new Date().toLocaleDateString('pl-PL');
        const fileProjectName = String(orderName || projectName || 'projekt').trim() || 'projekt';
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

        // Columns: A=Lp B=Przedmiot C=Podgałąź D=Nazwa E=Nazwawymagania F=Typ G=KosztJedn H=Ilość I=Jednostka J=KosztCałościowy=G*H K=Marża L=Rabat M=CenaOfertowa=J*(1+K)*(1-L)
        budgetSheet.columns = [
            { header: 'Lp.', key: 'index', width: 6 },
            { header: 'Przedmiot', key: 'subjectName', width: 28 },
            { header: 'Podgałąź', key: 'parentName', width: 24 },
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
            const excelRow = index + 2; // row 1 = header
            const addedRow = budgetSheet.addRow({
                index: index + 1,
                subjectName: row.subjectName || '',
                parentName: row.parentName || '',
                name: row.name || '',
                requirementName: reqNameByNodeId[row.id] || '',
                type: TYPE_LABELS[row.type] || row.type || '',
                unitCost: Number(row.unitCost) || 0,
                quantity: Number(row.quantity) || 0,
                unit: row.unit || '',
                totalCost: { formula: `=G${excelRow}*H${excelRow}`, result: Number(row.totalCost) || 0 },
                margin: (Number(row.margin) || 0) / 100,
                discount: (Number(row.discount) || 0) / 100,
                offerPrice: { formula: `=J${excelRow}*(1+K${excelRow})*(1-L${excelRow})`, result: Number(row.offerPrice) || 0 },
                comment: row.comment || '',
                status: row.status || '',
            });
            void addedRow;
        });

        const totalsRowNum = rows.length + 2;
        const totalsRow = budgetSheet.addRow({
            subjectName: 'Razem',
            totalCost: { formula: `=SUM(J2:J${totalsRowNum - 1})`, result: summary.totalCost },
            offerPrice: { formula: `=SUM(M2:M${totalsRowNum - 1})`, result: exportedRevenueAfterDiscount },
        });
        totalsRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

        ['G', 'J', 'M'].forEach((column) => {
            budgetSheet.getColumn(column).numFmt = '#,##0.00';
        });
        budgetSheet.getColumn('H').numFmt = '#,##0.00';
        budgetSheet.getColumn('K').numFmt = '0.00%';
        budgetSheet.getColumn('L').numFmt = '0.00%';
        budgetSheet.views = [{ state: 'frozen', ySplit: 1 }];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${safeProjectName}_budzet.xlsx`;
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

    // Gdy w HybridWBS zmieni się typ na material/equipment — auto-utwórz MaterialRequirement
    const handleMaterialNodeCreated = useCallback(async ({ wbsNodeId, name, type }) => {
        if (!wbsNodeId || !name) return;
        const normalizedType = String(type || '').toLowerCase();
        if (normalizedType !== 'material' && normalizedType !== 'equipment') return;
        // Sprawdź czy węzeł już ma tag req: i czy wymaganie faktycznie istnieje
        const wbsNode = wbsData.find(n => n.id === wbsNodeId);
        const reqTag = Array.isArray(wbsNode?.tags) ? wbsNode.tags.find(t => String(t).startsWith('req:')) : null;
        if (reqTag) {
            const reqId = reqTag.slice(4);
            // Zweryfikuj czy wymaganie istnieje — jeśli tak, zaktualizuj nazwę i nie duplikuj
            try {
                const checkRes = await fetch(`${API_URL}/material-requirements/${reqId}`, { headers: { Authorization: `Bearer ${token()}` } });
                if (checkRes.ok) {
                    const existing = await checkRes.json().catch(() => null);
                    if (existing && existing.name !== name) {
                        await fetch(`${API_URL}/material-requirements/${reqId}`, {
                            method: 'PATCH',
                            headers: authHeaders(),
                            body: JSON.stringify({ name }),
                        }).catch(() => {});
                        setReqRefreshKey(k => k + 1);
                    }
                    return;
                }
            } catch {}
            // Wymaganie nie istnieje (zostało usunięte) — usuń nieważny tag i kontynuuj tworzenie nowego
            const cleanedTags = (wbsNode.tags || []).filter(t => t !== reqTag && t !== 'auto-requirement');
            await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ tags: cleanedTags }),
            }).catch(() => {});
            setWbsData(prev => prev.map(n => n.id === wbsNodeId ? { ...n, tags: cleanedTags } : n));
        }
        try {
            const reqType = normalizedType === 'equipment' ? 'DEVICE' : 'MATERIAL';
            const res = await fetch(`${API_URL}/material-requirements`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    nodeId, versionId: versionId || null,
                    name, type: reqType, quantity: 1, unit: 'sztuki',
                    wbsNodeId,
                    wbsNodeIds: JSON.stringify([wbsNodeId]),
                    wbsNodeAllocations: JSON.stringify({ [wbsNodeId]: 1 }),
                }),
            });
            if (!res.ok) return;
            const created = await res.json().catch(() => null);
            if (created?.id) {
                const currentTags = Array.isArray(wbsNode?.tags) ? [...wbsNode.tags] : [];
                currentTags.push(`req:${created.id}`, 'auto-requirement');
                await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
                    method: 'PATCH',
                    headers: authHeaders(),
                    body: JSON.stringify({ tags: currentTags }),
                }).catch(() => {});
                // Aktualizuj lokalny stan bez pełnego fetchData
                setWbsData(prev => {
                    const exists = prev.some(n => n.id === wbsNodeId);
                    if (exists) return prev.map(n => n.id === wbsNodeId ? { ...n, tags: currentTags } : n);
                    return [...prev, { id: wbsNodeId, name, type: normalizedType, nodeId, tags: currentTags }];
                });
                setWbsTreeAndRef(prev => {
                    const upd = items => items.map(n => n.id === wbsNodeId ? { ...n, tags: currentTags } : { ...n, children: n.children?.length ? upd(n.children) : n.children });
                    return { ...prev, items: upd(prev.items || []) };
                });
                setReqRefreshKey(k => k + 1);
                await refreshMaterialCosts();
            }
        } catch (e) { console.error('Auto-create material requirement error:', e); }
    }, [nodeId, versionId, authHeaders, wbsData, refreshUnified]);

    const handleHybridNodesDeleted = useCallback(async (deletedIds) => {
        const rootId = deletedIds?.[0];
        if (!rootId) return;
        try {
            const res = await fetch(`${API_URL}/wbs-nodes/${rootId}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) { console.error('[WBS delete] Błąd serwera:', res.status); return; }
            setReqRefreshKey(k => k + 1);
            await refreshUnified();
            await fetchUnassignedRequirements();
        } catch (e) { console.error('Delete node error:', e); }
    }, [authHeaders, refreshUnified, fetchUnassignedRequirements]);

    const deleteNodeByIdRef = useRef(null);
    const deleteNodeById = useCallback(async (id) => {
        if (!id || !window.confirm('Usunąć ten węzeł i wszystkie podgałęzie?')) return;
        try {
            const res = await fetch(`${API_URL}/wbs-nodes/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) {
                console.error('[WBS delete] Błąd serwera:', res.status, await res.text().catch(() => ''));
                return;
            }
            if (selectedId === id) setSelectedId(null);
            setReqRefreshKey(k => k + 1);

            // fetchData() in refreshUnified will reconcile wbsTree and persist immediately
            await refreshUnified();
            await fetchUnassignedRequirements();
        } catch (e) { console.error('Delete node error:', e); }
    }, [authHeaders, refreshUnified, selectedId, wbsData, fetchUnassignedRequirements]);
    deleteNodeByIdRef.current = deleteNodeById;

    const handleMaterialStatusChange = useCallback(async (reqId, newStatus) => {
        const node = wbsData.find(n => (n.tags || []).some(t => t === `req:${reqId}`));
        if (node) {
            await fetch(`${API_URL}/wbs-nodes/${node.id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ status: newStatus }),
            }).catch(() => {});
            setWbsData(prev => prev.map(n => n.id === node.id ? { ...n, status: newStatus } : n));
            setWbsTreeAndRef(prev => {
                const upd = items => items.map(n => n.id === node.id ? { ...n, status: newStatus } : { ...n, children: n.children?.length ? upd(n.children) : n.children });
                return { ...prev, items: upd(prev.items || []) };
            });
        }
        await refreshMaterialCosts();
        setReqRefreshKey(k => k + 1);
    }, [wbsData, authHeaders, refreshMaterialCosts]);

    const updateNodeField = useCallback(async (id, field, value) => {
        try {
            await fetch(`${API_URL}/wbs-nodes/${id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ [field]: value }),
            });
            setWbsData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
            setWbsTreeAndRef(prev => {
                const upd = items => items.map(n => n.id === id ? { ...n, [field]: value } : { ...n, children: n.children?.length ? upd(n.children) : n.children });
                return { ...prev, items: upd(prev.items || []) };
            });
            // Synchronizuj nazwę/jednostkę/typ do powiązanego wymagania materialnego
            if (field === 'name' || field === 'unit' || field === 'type') {
                const node = wbsData.find(n => n.id === id);
                const reqTag = (node?.tags || []).find(t => String(t).startsWith('req:'));
                if (reqTag) {
                    const reqId = reqTag.slice(4);
                    let body;
                    if (field === 'type') {
                        const reqType = value === 'equipment' ? 'DEVICE' : (value === 'material' ? 'MATERIAL' : null);
                        body = reqType ? { type: reqType } : null;
                    } else {
                        body = { [field]: value };
                    }
                    if (body) {
                        await fetch(`${API_URL}/material-requirements/${reqId}`, {
                            method: 'PATCH',
                            headers: authHeaders(),
                            body: JSON.stringify(body),
                        }).catch(() => {});
                        setReqRefreshKey(k => k + 1);
                    }
                }
                if (field === 'unit' || field === 'type') {
                    await refreshMaterialCosts();
                }
            }
        } catch (e) { console.error('Update node error:', e); }
    }, [authHeaders, wbsData, refreshMaterialCosts]);

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

    const handleHybridRequirementsQtyChange = useCallback(async (id, qty, name) => {
        setRequirementsQtyByNode(prev => ({ ...prev, [id]: qty }));
        updateLocalWbsBudgetRow(id, { quantity: qty });
        saveBudgetField(id, { quantity: qty });
        await syncMaterialRequirementsFromWbsQuantity(id, qty, name || '');
        // Rebuild materialMetaByLookupKey so Budget row (inheritedQuantity) reflects new qty
        await refreshMaterialCosts();
    }, [updateLocalWbsBudgetRow, saveBudgetField, syncMaterialRequirementsFromWbsQuantity, refreshMaterialCosts]);

    const handleHybridNodeStatusChange = useCallback(async (_wbsNodeId, status, reqId) => {
        try {
            await fetch(`${API_URL}/material-requirements/${reqId}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ status }),
            });
            // refreshUnified() intentionally omitted: it calls fetchData() which merges
            // rel.status from wbs_nodes (still stale at this point — hybrid WBS save has
            // a 400ms debounce) and reverts the local edit. setReqRefreshKey triggers
            // fetchMat in WBSHybridTable which re-syncs status from material-requirements
            // (already updated above) into the tree without the stale-backend problem.
            setReqRefreshKey(k => k + 1);
        } catch {}
    }, [authHeaders]);

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
            const qtyChanges = []; // { wbsNodeId, quantity, name }

            for (let rowNo = startDataRow; rowNo <= lastDataRow && rowNo <= budgetImportRows.length; rowNo++) {
                const rowValues = budgetImportRows[rowNo - 1] || [];
                const importedRow = {
                    subjectName: getMapped(rowValues, 'subjectName'),
                    parentName: getMapped(rowValues, 'parentName'),
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
                const wantedParent = normKey(importedRow.parentName);

                let target = null;
                if (wantedName) {
                    target = budgetRows.find((row) => {
                        if (used.has(row.id)) return false;
                        if (normKey(row.name) !== wantedName) return false;
                        if (wantedSubject && normKey(getSubjectNameForNode(row)) !== wantedSubject) return false;
                        if (wantedParent) {
                            const directParent = byId.get(row.parentId);
                            if (!directParent || normKey(directParent.name) !== wantedParent) return false;
                        }
                        return true;
                    });
                }

                if (!target) {
                    if (!importedRow.name) { skipped += 1; continue; }

                    let subjectRoot = subjectRootsByName.get(wantedSubject);

                    // Create root node if it doesn't exist yet
                    if (!subjectRoot && wantedSubject) {
                        const rootRes = await fetch(`${API_URL}/wbs-nodes`, {
                            method: 'POST',
                            headers: authHeaders(),
                            body: JSON.stringify({ nodeId, versionId: versionId || null, parentId: null, name: importedRow.subjectName.trim() }),
                        });
                        if (rootRes.ok) {
                            const rootNode = await rootRes.json().catch(() => null);
                            if (rootNode?.id) {
                                subjectRoot = { id: rootNode.id, name: rootNode.name, parentId: null };
                                subjectRootsByName.set(wantedSubject, subjectRoot);
                                byId.set(rootNode.id, subjectRoot);
                            }
                        }
                    }

                    if (!subjectRoot) { skipped += 1; continue; }

                    // Find or create parentName sub-group
                    let createParentId = subjectRoot.id;
                    if (wantedParent) {
                        let parentNode = budgetRows.find((row) =>
                            normKey(row.name) === wantedParent
                            && normKey(getSubjectNameForNode(row)) === wantedSubject
                        );
                        if (!parentNode) {
                            const pgRes = await fetch(`${API_URL}/wbs-nodes`, {
                                method: 'POST',
                                headers: authHeaders(),
                                body: JSON.stringify({ nodeId, versionId: versionId || null, parentId: subjectRoot.id, name: importedRow.parentName.trim() }),
                            });
                            if (pgRes.ok) {
                                const pgNode = await pgRes.json().catch(() => null);
                                if (pgNode?.id) {
                                    parentNode = { id: pgNode.id, name: pgNode.name, parentId: subjectRoot.id };
                                    budgetRows.push(parentNode);
                                    byId.set(pgNode.id, parentNode);
                                }
                            }
                        }
                        if (parentNode) createParentId = parentNode.id;
                    }

                    const createRes = await fetch(`${API_URL}/wbs-nodes`, {
                        method: 'POST',
                        headers: authHeaders(),
                        body: JSON.stringify({
                            nodeId,
                            versionId: versionId || null,
                            parentId: createParentId,
                            name: importedRow.name,
                        }),
                    });
                    if (!createRes.ok) continue;
                    const createdNode = await createRes.json().catch(() => null);
                    if (!createdNode?.id) continue;
                    target = {
                        id: createdNode.id,
                        parentId: createParentId,
                        name: createdNode.name || importedRow.name,
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
                if (parsedMargin != null) budgetPatch.margin = parsedMargin * 100;
                const parsedDiscount = parseLocaleNumber(importedRow.discount);
                if (parsedDiscount != null) budgetPatch.discount = parsedDiscount * 100;
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
                    if (budgetPatch.quantity != null) {
                        qtyChanges.push({ wbsNodeId: target.id, quantity: budgetPatch.quantity, name: importedRow.name || target.name || '' });
                    }
                }

                updated += 1;
            }

            // Sync ilości do material requirements (jeden fetch + N PATCHy)
            if (qtyChanges.length > 0) {
                try {
                    const qs = versionId ? `?versionId=${versionId}` : '';
                    const reqRes = await fetch(`${API_URL}/material-requirements/node/${nodeId}${qs}`, { headers: { Authorization: `Bearer ${token()}` } });
                    if (reqRes.ok) {
                        const allReqs = await reqRes.json();
                        if (Array.isArray(allReqs)) {
                            for (const { wbsNodeId, quantity: nextQty, name: wbsNodeName } of qtyChanges) {
                                const normName = normKey(wbsNodeName);
                                const linked = allReqs.filter(req => {
                                    if (!['MATERIAL', 'DEVICE'].includes(String(req.type || '').toUpperCase())) return false;
                                    let alloc = {};
                                    try { alloc = JSON.parse(req.wbsNodeAllocations || '{}'); } catch {}
                                    let ids = [];
                                    try { const p = JSON.parse(req.wbsNodeIds || '[]'); ids = Array.isArray(p) ? p : []; } catch {}
                                    return req.wbsNodeId === wbsNodeId || ids.includes(wbsNodeId) || Object.prototype.hasOwnProperty.call(alloc, wbsNodeId);
                                });
                                let targetReq = linked.find(r => normName && normKey(r.name) === normName) || linked[0]
                                    || (normName ? allReqs.find(r => ['MATERIAL', 'DEVICE'].includes(String(r.type || '').toUpperCase()) && normKey(r.name) === normName) : null);
                                if (!targetReq) continue;
                                let curAlloc = {};
                                try { curAlloc = JSON.parse(targetReq.wbsNodeAllocations || '{}'); } catch {}
                                const nextAlloc = { ...curAlloc, [wbsNodeId]: nextQty };
                                const totalQty = Object.values(nextAlloc).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                                await fetch(`${API_URL}/material-requirements/${targetReq.id}`, {
                                    method: 'PATCH',
                                    headers: authHeaders(),
                                    body: JSON.stringify({ quantity: totalQty, wbsNodeAllocations: JSON.stringify(nextAlloc) }),
                                }).catch(() => {});
                            }
                        }
                    }
                } catch (e) { console.error('Batch qty sync error:', e); }
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


    const onBudgetFieldChange = useCallback((rowOrig, field, rawValue) => {
        const row = { ...rowOrig, [field]: rawValue };
        if (!row) return;
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
                row.statusLabel = getStatusLabel(row[field], row[field]);
                updateNodeField(row.id, field, row[field]);
                setWbsData(prev => prev.map(item => item.id === row.id ? { ...item, [field]: row[field], statusLabel: row.statusLabel } : item));
            } else if (field !== 'type') {
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
                const typeDefault = defaultUnitForType(row.type);
                const otherDefault = typeDefault === 'sztuki' ? 'dni' : 'sztuki';
                const isOldDefault = !row.unit || row.unit === otherDefault;
                row.unit = inheritedFromMaterials
                    ? (materialMetaByLookupKey[lookupKey]?.unit || (isOldDefault ? typeDefault : row.unit))
                    : (isOldDefault ? typeDefault : row.unit);
                row.unitCost = inheritedFromMaterials
                    ? resolvedUnitCost
                    : (resolvedQuantity > 0 ? totalCost / resolvedQuantity : totalCost);
                row.cost = totalCost;
                row.totalCost = totalCost;
                row.offerPrice = margin !== 0 ? totalCost * (1 + margin / 100) : 0;
                row.totalPrice = row.offerPrice;
                updateNodeField(row.id, 'type', row.type);
                setWbsData(prev => prev.map(item => item.id === row.id ? {
                    ...item,
                    type: row.type,
                    inheritedFromMaterials: row.inheritedFromMaterials,
                    quantity: row.quantity,
                    unit: row.unit,
                    unitCost: row.unitCost,
                    cost: row.cost,
                    totalCost: row.totalCost,
                    offerPrice: row.offerPrice,
                    totalPrice: row.totalPrice,
                } : item));
                updateLocalWbsBudgetRow(row.id, {
                    type: row.type,
                    quantity: row.quantity,
                    unit: row.unit,
                    unitCost: row.unitCost,
                    totalCost: row.totalCost,
                    totalPrice: row.totalPrice,
                    margin: row.margin,
                });
                saveBudgetField(row.id, {
                    unit: row.unit,
                    unitCost: row.unitCost,
                    quantity: row.quantity,
                    margin: row.margin,
                    discount: row.discount ?? 0,
                    comment: row.comment ?? '',
                });

                // Karta produktowa tworzona jest przez użytkownika z panelu WbsMaterialsPanel
                // (przycisk "Utwórz kartę" przy węźle) — nie auto-tworzymy tutaj
            }
        } else {
            const q = parseLocaleNumber(row.quantity) ?? 1;
            const uc = parseLocaleNumber(row.unitCost) ?? 0;
            const totalCost = uc * q;
            const m = parseFloat(row.margin) || 0;
            const d = parseFloat(row.discount) || 0;
            let up = uc;
            if (uc > 0 && m !== 0) up = uc * (1 + m / 100);
            if (d > 0) up = up * (1 - d / 100);

            row.unit = row.unit || defaultUnitForType(row.type);
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
            // Sync WBS-visible fields to wbsTree (WBSHybridTable reads from wbsTree, not wbsData)
            if (field === 'comment' || field === 'unit') {
                setWbsTreeAndRef(prev => {
                    const upd = items => items.map(n =>
                        n.id === row.id
                            ? { ...n, [field]: row[field] }
                            : { ...n, children: n.children?.length ? upd(n.children) : n.children }
                    );
                    return { ...prev, items: upd(prev.items || []) };
                });
            }
            saveBudgetField(row.id, {
                unit: row.unit,
                unitCost: uc,
                quantity: q,
                margin: m,
                discount: d,
                unitPrice: up,
                comment: row.comment ?? '',
            });
            // Sync budget quantity → WBS/MR
            if (field === 'quantity') {
                const normalizedType = String(row.type || row.budgetType || '').toLowerCase();
                if (normalizedType === 'work' || normalizedType === 'praca') {
                    setRequirementsQtyByNode((prev) => ({ ...prev, [row.id]: q }));
                    syncMaterialRequirementsFromWbsQuantity(row.id, q, row.name);
                } else if (normalizedType === 'material' || normalizedType === 'equipment') {
                    // Variant B: WBS is source of truth; update local material meta so inheritedQuantity reflects edit
                    const lookupKey = makeMaterialLookupKey(row.subjectName || row.name, row.name);
                    setRequirementsQtyByNode((prev) => ({ ...prev, [row.id]: q }));
                    setMaterialMetaByLookupKey(prev => ({
                        ...prev,
                        [lookupKey]: { ...(prev[lookupKey] || {}), quantity: q },
                    }));
                    (async () => {
                        await syncMaterialRequirementsFromWbsQuantity(row.id, q, row.name);
                        await refreshMaterialCosts();
                    })();
                }
            }
            // Sync unitCost → priceNetto in material-requirements for material/equipment rows
            if (field === 'unitCost') {
                const normalizedType = String(row.type || row.budgetType || '').toLowerCase();
                if (normalizedType === 'material' || normalizedType === 'equipment') {
                    const lookupKey = makeMaterialLookupKey(row.subjectName || row.name, row.name);
                    setMaterialMetaByLookupKey(prev => {
                        const existing = prev[lookupKey];
                        const existingQty = parseFloat(existing?.quantity) || q;
                        return { ...prev, [lookupKey]: { ...(existing || {}), cost: uc * existingQty, quantity: existingQty } };
                    });
                    const reqTag = (row.tags || []).find(t => String(t).startsWith('req:'));
                    if (reqTag) {
                        const reqId = reqTag.slice(4);
                        fetch(`${API_URL}/material-requirements/${reqId}`, {
                            method: 'PATCH',
                            headers: authHeaders(),
                            body: JSON.stringify({ priceNetto: uc }),
                        }).then(async () => {
                            setReqRefreshKey(k => k + 1);
                            await refreshMaterialCosts();
                        }).catch(() => {});
                    }
                }
            }
            // Sync unit → material-requirements for material/equipment rows (fixes grid reset)
            if (field === 'unit') {
                const normalizedType = String(row.type || row.budgetType || '').toLowerCase();
                if (normalizedType === 'material' || normalizedType === 'equipment') {
                    const lookupKey = makeMaterialLookupKey(row.subjectName || row.name, row.name);
                    setMaterialMetaByLookupKey(prev => ({
                        ...prev,
                        [lookupKey]: { ...(prev[lookupKey] || {}), unit: row.unit },
                    }));
                    const reqTag = (row.tags || []).find(t => String(t).startsWith('req:'));
                    if (reqTag) {
                        const reqId = reqTag.slice(4);
                        fetch(`${API_URL}/material-requirements/${reqId}`, {
                            method: 'PATCH',
                            headers: authHeaders(),
                            body: JSON.stringify({ unit: row.unit }),
                        }).then(() => setReqRefreshKey(k => k + 1)).catch(() => {});
                    }
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
                    const directParent = item.parentId ? byId.get(item.parentId) : null;
                    const parentIsRoot = !directParent?.parentId;
                    const parentName = (directParent && !parentIsRoot) ? (directParent.name || '') : '';
                    return {
                        ...item,
                        subjectId: subject.id,
                        subjectName,
                        parentName,
                        status: inheritedStatus.code,
                        statusLabel: inheritedStatus.label,
                        unit: inheritedFromMaterials
                            ? (materialMetaByLookupKey[lookupKey]?.unit || item.unit || 'sztuki')
                            : (item.unit || defaultUnitForType(item.type)),
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

        // Gdy aktywne wyszukiwanie — oblicz zbiór widocznych węzłów (pasujące + ich przodkowie)
        let searchVisibleIds = null;
        if (normalizedSearchQuery) {
            const matching = new Set();
            for (const item of wbsData) {
                if (matchesSearch(item.name, TYPE_LABELS[item.type] || item.type, item.status, item.owner, item.comment, item.unit, String(item.quantity ?? ''))) {
                    matching.add(item.id);
                }
            }
            searchVisibleIds = new Set(matching);
            for (const id of matching) {
                let current = byId.get(id);
                while (current?.parentId) {
                    searchVisibleIds.add(current.parentId);
                    current = byId.get(current.parentId);
                }
            }
        }

        const addVisible = (pId, depth) => {
            const children = childrenMap.get(pId || '__root__') || [];
            children.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            for (const item of children) {
                if (searchVisibleIds && !searchVisibleIds.has(item.id)) continue;
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
                if (searchVisibleIds || expandedIds.has(item.id)) {
                    addVisible(item.id, depth + 1);
                }
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
        const marginPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
        return {
            rows: rows.length,
            totalCost,
            totalRevenue,
            profit,
            marginPct,
        };
    }, []);

    const commitPendingEdits = useCallback(() => {
        const active = document.activeElement;
        if (active && active !== document.body && typeof active.blur === 'function') {
            active.blur();
        }
    }, []);

    const toggleSection = useCallback((key) => {
        commitPendingEdits();
        setExpandedSection(prev => prev === key ? null : key);
    }, [commitPendingEdits]);

    const renderSection = (key, title, Icon, colorClass, content, onExport, extraButtons = null) => {
        const isActive = expandedSection === key;
        const isHidden = expandedSection !== null && !isActive;
        const isCompactSection = key === 'budget' || key === 'materials' || key === 'wbs-hybrid' || key === 'strategy';

        return (
            <div
                className={`flex flex-col glass-panel border border-white/5 transition-all duration-300 shadow-2xl overflow-hidden ${isCompactSection && isActive ? 'rounded-none flex-1 min-h-0' : 'rounded-2xl'} ${isActive ? 'bg-white/[0.04]' : 'bg-white/[0.02] hover:bg-white/[0.03] cursor-pointer'}`}
                style={isActive && !isCompactSection ? { minHeight: 'calc(100vh - 200px)' } : isHidden ? { display: 'none' } : {}}
            >
                <div
                    className={`flex items-center gap-2 px-5 py-2 transition-colors text-left flex-shrink-0 border-b border-white/10 sticky top-0 z-20 ${isActive ? 'bg-[#0b0f17]' : 'bg-white/[0.04]'}`}
                    onClick={() => toggleSection(key)}
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
                                    onClick={(e) => { e.stopPropagation(); exportProjectPdf({ nodeId, versionId, projectName, orderName }); }}
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
                <div className={`flex-1 min-h-0 flex flex-col ${isCompactSection ? 'p-0' : 'p-4 overflow-auto custom-scrollbar'}`} style={isActive ? {} : { display: 'none' }}>
                    {content}
                </div>
            </div>
        );
    };

    const isCompactActive = (expandedSection === 'budget' || expandedSection === 'materials' || expandedSection === 'wbs-hybrid' || expandedSection === 'strategy');

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
                <div className="flex flex-col flex-1 min-h-0 p-4 gap-2">
                    <div className="flex justify-end h-4">
                        {strategySaving && <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Zapisywanie...</span>}
                        {strategySaved && !strategySaving && <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Zapisano</span>}
                    </div>
                    <textarea
                        ref={strategyRef}
                        value={wbsDescription}
                        onChange={(e) => { setWbsDescription(e.target.value); handleStrategySave(); }}
                        onKeyDown={handleStrategyKeyDown}
                        onBlur={() => handleStrategySave(true)}
                        className="flex-1 min-h-0 w-full bg-black/40 border border-white/10 rounded-xl p-6 text-gray-300 text-lg focus:outline-none focus:border-blue-500 transition-colors custom-scrollbar leading-relaxed"
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
                        onClick={(e) => { e.stopPropagation(); prefixSelectionLines('# '); }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                        title="Nagłówek H1"
                    >
                        H1
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); prefixSelectionLines('## '); }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                        title="Nagłówek H2"
                    >
                        H2
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); prefixSelectionLines('### '); }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                        title="Nagłówek H3"
                    >
                        H3
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); prefixSelectionLines('- '); }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                        title="Lista punktowana"
                    >
                        Lista
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); prefixSelectionLines('1. '); }}
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

            {renderSection('tasks', 'Zadania', CalendarDays, 'blue', (
                <TasksCalendarSection
                    nodeId={nodeId}
                    versionId={versionId}
                    nodeName={projectName}
                    onWbsUpdate={onWbsUpdate}
                />
            ))}

            {renderSection('wbs-hybrid', `Struktura projektu: ${orderName || projectName || '—'}`, ListTree, 'violet', (
                <div className="flex flex-col flex-1 min-h-0">
                    <WBSHybridTable
                        wbsTree={wbsTree}
                        setWbsTree={setWbsTreeAndRef}
                        nodeName={orderName || projectName || 'Projekt'}
                        processNodeId={nodeId}
                        onSave={handleSaveHybridWBS}
                        users={assignedUsers}
                        onRequirementDrop={isManagerOrAdmin ? handleRequirementAssignToWbs : null}
                        isManager={isManagerOrAdmin}
                        onNodesDeleted={handleHybridNodesDeleted}
                        onMaterialNodeCreated={handleMaterialNodeCreated}
                        requirementsQtyByNode={requirementsQtyByNode}
                        onRequirementsQtyChange={handleHybridRequirementsQtyChange}
                        onNodeStatusChange={handleHybridNodeStatusChange}
                        unassignedRequirements={isManagerOrAdmin ? unassignedRequirements : []}
                        onRequirementAssign={isManagerOrAdmin ? handleRequirementAssignToWbs : null}
                        onNodeFieldSave={updateNodeField}
                        materialRefreshKey={reqRefreshKey}
                        searchQuery={normalizedSearchQuery}
                        onMaterialReqUpdated={() => setReqRefreshKey(k => k + 1)}
                    />
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

            {isManagerOrAdmin && renderSection('budget', 'Budżet', DollarSign, 'green', (
                <BudgetTable
                    rows={buildRows(VIEWS.BUDGET)}
                    onFieldChange={onBudgetFieldChange}
                    onDeleteRow={(id) => deleteNodeByIdRef.current?.(id)}
                    discountPercent={budgetDiscountPercent}
                    discountAmount={budgetDiscountAmount}
                    onDiscountPercentChange={setBudgetDiscountPercent}
                    onDiscountAmountChange={setBudgetDiscountAmount}
                />
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

            {renderSection('materials', 'Materiały', Zap, 'yellow', (
                <WbsMaterialsPanel
                    nodeId={nodeId}
                    versionId={versionId}
                    readOnly={!isManagerOrAdmin}
                    externalWbsNodes={wbsData}
                    onPatchNode={(id, data) => setWbsData(prev => prev.map(n => n.id === id ? { ...n, ...data } : n))}
                    onWbsUpdate={async () => { await refreshMaterialCosts(); }}
                    refreshKey={reqRefreshKey}
                    projectName={projectName}
                    orderName={orderName}
                    onExportReady={fn => { materialsExportFn.current = fn; }}
                    onExportPdfReady={fn => { materialsPdfExportFn.current = fn; }}
                />
            ), null, (
                <>
                    <button
                        onClick={e => { e.stopPropagation(); materialsPdfExportFn.current?.(); }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-red-300 text-[10px] font-bold uppercase tracking-widest transition-all flex-shrink-0"
                    >
                        <FileDown size={11} /> PDF
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); materialsExportFn.current?.(); }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-lg text-emerald-300 text-[10px] font-bold uppercase tracking-widest transition-all flex-shrink-0"
                    >
                        <FileDown size={11} /> Excel
                    </button>
                </>
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
                                dangerouslySetInnerHTML={{ __html: renderStrategyHtml(getStrategyText() || 'Brak treści strategii') }}
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
