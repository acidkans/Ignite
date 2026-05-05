import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { Layers, Package, DollarSign, ChevronRight, ChevronDown, Plus, Trash2, FolderPlus, RefreshCw, HelpCircle, Save, CheckCircle, FileDown, X, Zap, Sparkles, ListTree, CalendarDays, BarChart3, ChevronUp, FileText } from 'lucide-react';
import MarkdownEditor from '../MarkdownEditor';
import { API_URL } from '../../../config';
import MaterialRequirementsPanel from './MaterialRequirementsPanel';
import WbsMaterialsPanel from './WbsMaterialsPanel';
import TasksCalendarSection from './TasksCalendarSection';
import GanttSection from './GanttSection';
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


const DEFAULT_SECTION_ORDER = ['oferta', 'strategy', 'tasks', 'gantt', 'wbs-hybrid', 'budget', 'materials'];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function UnifiedWbsPanel({ nodeId, versionId, onWbsUpdate, userRoles = [], projectName = '', orderName = '', searchQuery = '', setLeftVisible, setAiVisible }) {
    const [wbsData, setWbsData] = useState([]);
    const wbsDataRef = useRef(wbsData);
    wbsDataRef.current = wbsData;
    const [expandedSection, setExpandedSection] = useState(null);
    const [fullscreenSection, setFullscreenSection] = useState(null);
    const [sectionOrder, setSectionOrder] = useState(DEFAULT_SECTION_ORDER);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [selectedId, setSelectedId] = useState(null);
    const [wbsDescription, setWbsDescription] = useState('');
    const [strategySaving, setStrategySaving] = useState(false);
    const [strategySaved, setStrategySaved] = useState(false);
    const [offerText, setOfferText] = useState('');
    const [offerSaving, setOfferSaving] = useState(false);

    const PRESETS_KEY = 'ignite_offer_presets';
    const defaultPresets = [
        { id: '1', label: 'Wstęp — odpowiedź na zapytanie', text: `# W odpowiedzi na zapytanie wyceny projektu {nazwa projektu}, firma Airtel Services składa ofertę obejmującą:` },
    ];
    const loadPresets = () => { try { const s = localStorage.getItem(PRESETS_KEY); return s ? JSON.parse(s) : defaultPresets; } catch { return defaultPresets; } };
    const [offerPresets, setOfferPresets] = useState(loadPresets);
    const [presetManagerOpen, setPresetManagerOpen] = useState(false);
    const [editingPreset, setEditingPreset] = useState(null); // { id, label, text } | null (null = nowy)
    const [editingPresetDraft, setEditingPresetDraft] = useState({ label: '', text: '' });

    const savePresets = (next) => { setOfferPresets(next); localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); };
    const openNewPreset = () => { setEditingPreset(null); setEditingPresetDraft({ label: '', text: '' }); };
    const openEditPreset = (p) => { setEditingPreset(p); setEditingPresetDraft({ label: p.label, text: p.text }); };
    const commitPreset = () => {
        if (!editingPresetDraft.label.trim()) return;
        if (editingPreset) {
            savePresets(offerPresets.map(p => p.id === editingPreset.id ? { ...p, ...editingPresetDraft } : p));
        } else {
            savePresets([...offerPresets, { id: Date.now().toString(), ...editingPresetDraft }]);
        }
        setEditingPreset(undefined); // undefined = zamknij formularz
        setEditingPresetDraft({ label: '', text: '' });
    };
    const deletePreset = (id) => savePresets(offerPresets.filter(p => p.id !== id));
    const [offerSaved, setOfferSaved] = useState(false);
    const [offerDate, setOfferDate] = useState(() => new Date().toLocaleDateString('pl-PL'));
    const offerDateLoadedRef = useRef(false);
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
    const strategyLoadedRef = useRef(false);
    const strategySaveTimeout = useRef(null);
    const offerLoadedRef = useRef(false);
    const offerSaveTimeout = useRef(null);
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
    const ganttExportRef = useRef(null);
    const ganttGetHtmlRef = useRef(null);

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
                // Domyślnie wszystkie sekcje zwinięte — użytkownik rozwija ręcznie
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
                // Tylko orphan requirements (bez wbsNodeId) — nie kradnij reqów innych węzłów o tej samej nazwie
                targetReq = requirements.find(req =>
                    ['MATERIAL', 'DEVICE'].includes(String(req.type || '').toUpperCase()) &&
                    normKey(req.name) === normalizedNodeName &&
                    !req.wbsNodeId
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

    const getStrategyText = useCallback(() => wbsDescription, [wbsDescription]);
    const getOfferText = useCallback(() => offerText, [offerText]);

    // Reset strategy state when switching nodes/versions so the new record loads fresh.
    // Pending autosave timeouts are left intact — they capture the old saveStrategy closure
    // (with the old nodeId) so typed-but-unsaved text still flushes to the correct record.
    useEffect(() => {
        strategyLoadedRef.current = false;
        offerLoadedRef.current = false;
        offerDateLoadedRef.current = false;
        setWbsDescription('');
        setOfferText('');
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
                if (data && !offerLoadedRef.current) {
                    setOfferText(data.offerText || '');
                    offerLoadedRef.current = true;
                }
                if (data && !offerDateLoadedRef.current) {
                    const d = data.createdAt
                        ? new Date(data.createdAt).toLocaleDateString('pl-PL')
                        : new Date().toLocaleDateString('pl-PL');
                    setOfferDate(d);
                    offerDateLoadedRef.current = true;
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
                fetchData();
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
                            fetchData();
                        } catch (e) { console.error('[HybridWBS retry]', e); }
                        finally { hybridSaveRef.current = false; }
                    }, 0);
                }
            }
        }, 400);
    }, [nodeId, versionId, authHeaders, onWbsUpdate, fetchData]);

    // Po wklejeniu skopiowanej pozycji w WBS — natychmiast zapisz drzewo (omijamy debounce, żeby
    // nowe wbs_nodes powstały w bazie), a następnie sklonuj powiązane wymagania techniczne
    // (productName, technicalSpec, manufacturer, model, dataSheet, status, …).
    const handlePasteCloned = useCallback(async (mappings) => {
        if (!Array.isArray(mappings) || mappings.length === 0) return;
        if (hybridSaveTimeout.current) clearTimeout(hybridSaveTimeout.current);
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
            await fetch(`${API_URL}/material-requirements/clone-for-wbs`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ mappings }),
            });
            onWbsUpdate?.();
            fetchData();
            setReqRefreshKey(k => k + 1);
        } catch (err) {
            console.error('[Paste cloned WBS]', err);
        }
    }, [nodeId, versionId, authHeaders, onWbsUpdate, fetchData]);

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

    const saveOffer = useCallback(async (desc) => {
        setOfferSaving(true);
        try {
            await fetch(`${API_URL}/order-requirements`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ nodeId, versionId, offerText: desc }),
            });
            setOfferSaved(true);
            setTimeout(() => setOfferSaved(false), 2000);
        } catch (e) { console.error('Save offer error:', e); }
        finally { setOfferSaving(false); }
    }, [nodeId, versionId, authHeaders]);

    // Zachowane dla zewnętrznych wywołań (np. fetchData). MarkdownEditor zapisuje przez własny onSave.
    const handleStrategySave = useCallback((immediate = false) => {
        if (strategySaveTimeout.current) clearTimeout(strategySaveTimeout.current);
        if (immediate) { saveStrategy(wbsDescription); return; }
        strategySaveTimeout.current = setTimeout(() => saveStrategy(wbsDescription), 1500);
    }, [wbsDescription, saveStrategy]);

    // Wielopoziomowa numeracja: wcięcie 2 spacje = 1 poziom; wynik to 1, 1.1, 1.1.1, 1.2, 2, 2.1 …
    // Listy punktowane (-) zachowują wcięcie wizualnie. Bloki nie-listowe resetują liczniki.
    // Używane przez handleExportPDF — edytor inline ma własny render w MarkdownEditor.
    const renderStrategyHtml = useCallback((text) => {
        const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const lines = (text || '').split('\n');
        const indentLevel = (ws) => Math.floor((ws || '').replace(/\t/g, '  ').length / 2);
        const isTableRow = (l) => l.trimStart().startsWith('|');
        const isSepRow = (l) => /^\s*\|[\s\-:|]+\|\s*$/.test(l);
        const parseCells = (l) => l.split('|').slice(1, -1).map(c => c.trim());
        let html = '';
        let olCounters = [];
        const resetOl = () => { olCounters = []; };
        let idx = 0;
        while (idx < lines.length) {
            const raw = lines[idx];
            if (isTableRow(raw)) {
                const block = [];
                while (idx < lines.length && isTableRow(lines[idx])) { block.push(lines[idx]); idx++; }
                const sepIdx = block.findIndex(isSepRow);
                const heads = sepIdx > 0 ? block.slice(0, sepIdx) : [block[0]];
                const body = sepIdx >= 0 ? block.slice(sepIdx + 1) : block.slice(1);
                resetOl();
                html += `<table style="border-collapse:collapse;width:100%;margin:10px 0;font-size:11px">`;
                html += `<thead><tr>${parseCells(heads[0]).map(c => `<th style="font-size:13px;font-weight:bold;text-align:center;border-bottom:2px solid #888;padding:5px 10px">${bold(c)}</th>`).join('')}</tr></thead>`;
                html += `<tbody>${body.map(dr => `<tr>${parseCells(dr).map(c => `<td style="font-weight:normal;padding:4px 10px;border-bottom:1px solid #ddd">${bold(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
                html += `</table>`;
                continue;
            }
            const h3m = raw.match(/^### (.+)/);
            const h2m = raw.match(/^## (.+)/);
            const h1m = raw.match(/^# (.+)/);
            const ulm = raw.match(/^(\s*)- (.*)/);
            const olm = raw.match(/^(\s*)(\d+)\. (.*)/);
            if (h3m) {
                resetOl();
                html += `<h3 style="font-size:12px;font-weight:bold;margin:12px 0 2px 0;padding-left:4em">${bold(h3m[1])}</h3>`;
            } else if (h2m) {
                resetOl();
                html += `<h2 style="font-size:13px;font-weight:bold;margin:14px 0 3px 0;padding-left:2em">${bold(h2m[1])}</h2>`;
            } else if (h1m) {
                resetOl();
                html += `<h1 style="font-size:14px;font-weight:bold;margin:16px 0 4px 0;padding-left:0">${bold(h1m[1])}</h1>`;
            } else if (ulm) {
                resetOl();
                const L = indentLevel(ulm[1]);
                html += `<div style="display:flex;margin:2px 0;padding-left:${L * 1.5}em"><span style="display:inline-block;width:1.2em;flex-shrink:0">•</span><span style="flex:1;min-width:0">${bold(ulm[2])}</span></div>`;
            } else if (olm) {
                const L = indentLevel(olm[1]);
                const N = parseInt(olm[2], 10);
                while (olCounters.length > L + 1) olCounters.pop();
                if (olCounters.length === L + 1) olCounters[L] = N;
                else { while (olCounters.length < L) olCounters.push(1); olCounters.push(N); }
                const num = olCounters.join('.') + '.';
                const numColEm = Math.max(2, num.length * 0.55 + 0.4);
                html += `<div style="display:flex;margin:2px 0;padding-left:${L * 1.5}em"><strong style="display:inline-block;width:${numColEm}em;flex-shrink:0">${num}</strong><span style="flex:1;min-width:0">${bold(olm[3])}</span></div>`;
            } else if (raw.trim() === '') {
                resetOl();
                html += '<br>';
            } else {
                resetOl();
                html += `<p style="margin:0 0 4px 0">${bold(raw)}</p>`;
            }
            idx++;
        }
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

        const renderQaCell = (qa) => {
            const list = Array.isArray(qa) ? qa.filter(p => (p?.question || '').trim() || (p?.answer || '').trim()) : [];
            if (list.length === 0) return '';
            const rows = list.map(p => `
                <tr>
                    <td style="padding:2px 4px;border:1px solid #e5e7eb;font-size:9px;text-align:left;vertical-align:top;color:#1f2937;background:#fff">${esc(p.question || '')}</td>
                    <td style="padding:2px 4px;border:1px solid #e5e7eb;font-size:9px;text-align:left;vertical-align:top;color:#374151;background:#fff">${esc(p.answer || '')}</td>
                </tr>`).join('');
            return `<table style="width:100%;border-collapse:collapse;margin:0">
                <thead><tr>
                    <th style="padding:2px 4px;border:1px solid #d1d5db;font-size:8px;text-transform:uppercase;letter-spacing:0.05em;background:#f3f4f6;color:#4b5563;text-align:left;width:50%">Pytanie</th>
                    <th style="padding:2px 4px;border:1px solid #d1d5db;font-size:8px;text-transform:uppercase;letter-spacing:0.05em;background:#f3f4f6;color:#4b5563;text-align:left;width:50%">Odpowiedź</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
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
                    <td>${esc(n.status || '')}</td>
                    <td style="text-align:left;padding:4px">${renderQaCell(n.qa)}</td>`;
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

        const offerHtml = show('oferta') ? `
            <div class="section">
                <div class="strategy-text">${renderStrategyHtml(getOfferText() || 'Brak treści oferty')}</div>
            </div>` : '';

        const wbsHtml = show('wbs') ? `
            <div class="section">
                <div class="section-header">Struktura zadań projektu</div>
                <table>
                    <thead><tr><th style="width:30%">Nazwa</th><th style="width:14%">Status</th><th style="width:56%">Q&amp;A</th></tr></thead>
                    <tbody>${wbsData.length ? buildTreeRows(null, 0, false) : '<tr><td colspan="3">Brak danych WBS</td></tr>'}</tbody>
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
<title></title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 0; }
  .doc-header { border-bottom: 3px solid #1a1a2e; padding: 18px 0 10px 0; margin: 0 0 18px 0; break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; display: flex; align-items: flex-start; gap: 16px; }
  .doc-header-logo { height: 48px; width: auto; object-fit: contain; flex-shrink: 0; }
  .doc-header-text { flex: 1; }
  .doc-header h1 { font-size: 20px; margin: 0 0 2px 0; }
  .doc-header .sub { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #6b7280; }
  .doc-header .meta { font-size: 10px; color: #9ca3af; margin-top: 4px; }
  .section { margin-bottom: 22px; }
  .section-header { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.12em; background: #1a1a2e; color: #fff; padding: 7px 12px; break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
  h1, h2, h3, h4, h5, h6, .section-header, .table-title, .md-bold,
  .strategy-text h1, .strategy-text h2, .strategy-text h3, .strategy-text h4 {
    break-after: avoid; page-break-after: avoid;
    break-inside: avoid; page-break-inside: avoid;
  }
  p { orphans: 3; widows: 3; }
  .strategy-text { padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; line-height: 1.6; }
  .strategy-text p { margin: 0 0 4px 0; orphans: 3; widows: 3; }
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
  .summary-block { margin-bottom: 24px; break-inside: avoid; page-break-inside: avoid; }
  .table-title { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; color: #111; margin-bottom: 6px; padding: 5px 0; border-bottom: 2px solid #1a1a2e; }
  th { background: #f3f4f6; color: #374151; padding: 7px 8px; text-align: center; font-size: 12px; font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #d1d5db; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  @page { margin: 20mm 14mm; size: A4 portrait; }
  .budget-table { table-layout: fixed; word-wrap: break-word; }
  @media print {
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
    <div class="sub">${{ strategy: 'Jak to chcemy zrobić', oferta: 'Oferta', budget: 'Budżet', 'wbs-hybrid': 'Struktura projektu', wbs: 'Struktura projektu', materials: 'Materiały' }[sectionKey] || 'Planowanie'}</div>
    <div class="meta">Przygotowano: ${date}</div>
  </div>
</div>
${offerHtml}
${strategyHtml}
${wbsHtml}
${budgetHtml}
${_budgetSummaryHtml}
${materialsHtml}
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const win = window.open(blobUrl, '_blank');
        if (!win) { alert('Zezwól na otwieranie pop-upów aby eksportować PDF'); URL.revokeObjectURL(blobUrl); return; }
        win.focus();
        setTimeout(() => { win.print(); setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); }, 600);
    };

    const handleExportBudgetExcel = async () => {
        const rawRows = buildRows(VIEWS.BUDGET);

        if (!rawRows.length) {
            alert('Brak danych budżetowych do eksportu.');
            return;
        }

        // Przelicz tak samo jak BudgetTable (calcDerived: uc×qty),
        // żeby Podsumowanie i arkusz Budżet pokazywały te same wartości po przeliczeniu formuł.
        const rows = rawRows.map(r => {
            const q = Math.max(0, parseFloat(r.quantity) || 0);
            const uc = Math.max(0, parseFloat(r.unitCost) || 0);
            const marginRaw = (r.margin != null && String(r.margin) !== '') ? parseFloat(r.margin) : null;
            const d = Math.max(0, parseFloat(r.discount) || 0);
            const totalCost = uc * q;
            let offerPrice = (marginRaw !== null && marginRaw !== 0) ? totalCost * (1 + marginRaw / 100) : 0;
            if (offerPrice > 0 && d > 0) offerPrice = Math.max(0, offerPrice * (1 - d / 100));
            return { ...r, totalCost, cost: totalCost, offerPrice };
        });

        const workbook = new ExcelJS.Workbook();
        const safeOrderName = String(orderName || projectName || 'zamowienie').trim().replace(/[\\/:*?"<>|\[\]]+/g, '_') || 'zamowienie';
        // Konwencja: arkusze nazwane tylko typem (Podsumowanie / Budżet / Q&A) — nazwa projektu jest w nazwie pliku.
        const summarySheet = workbook.addWorksheet('Podsumowanie');
        const budgetSheet = workbook.addWorksheet('Budżet');
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
            { width: 18 },
            { width: 18 },
            { width: 18 },
            { width: 14 },
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

        summarySheet.getCell('B4').numFmt = '#,##0.00';
        summarySheet.getCell('B5').numFmt = '#,##0.00';
        summarySheet.getCell('B6').numFmt = '0.00%';
        summarySheet.getCell('B7').numFmt = '#,##0.00';
        summarySheet.getCell('B8').numFmt = '#,##0.00';
        summarySheet.getCell('B9').numFmt = '#,##0.00';
        summarySheet.getCell('B10').numFmt = '#,##0.00';
        summarySheet.getCell('B11').numFmt = '0.00%';
        summarySheet.getRow(1).font = { bold: true, size: 14 };

        // Per-type aggregation: grupowanie po (typ, jednostka) — np. „Praca / dni" osobno od „Praca / szt".
        const typeAgg = {};
        for (const row of rows) {
            const typeKey = row.type || '';
            const typeLabel = TYPE_LABELS[typeKey] || typeKey || '—';
            const unit = String(row.unit || '').trim() || '—';
            const aggKey = `${typeLabel}|${unit}`;
            if (!typeAgg[aggKey]) typeAgg[aggKey] = { typeLabel, unit, quantity: 0, cost: 0, revenue: 0 };
            typeAgg[aggKey].quantity += Number(row.quantity) || 0;
            typeAgg[aggKey].cost += Number(row.totalCost) || 0;
            typeAgg[aggKey].revenue += Number(row.offerPrice) || 0;
        }

        summarySheet.addRow([]);
        const perTypeTitleRow = summarySheet.addRow(['Podsumowanie per typ']);
        perTypeTitleRow.font = { bold: true, size: 12 };
        const perTypeHeaderRow = summarySheet.addRow(['Typ', 'Jednostka', 'Ilość', 'Koszt', 'Przychód', 'Zysk', 'Marża %']);
        perTypeHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        perTypeHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

        const perTypeFirstRow = perTypeHeaderRow.number + 1;
        const typeEntries = Object.values(typeAgg).sort((a, b) => {
            if (a.typeLabel !== b.typeLabel) return a.typeLabel.localeCompare(b.typeLabel, 'pl');
            return b.cost - a.cost;
        });
        for (const agg of typeEntries) {
            const profit = agg.revenue - agg.cost;
            const margin = agg.revenue > 0 ? profit / agg.revenue : 0;
            summarySheet.addRow([agg.typeLabel, agg.unit, agg.quantity, agg.cost, agg.revenue, profit, margin]);
        }
        const perTypeTotalCost = typeEntries.reduce((s, a) => s + a.cost, 0);
        const perTypeTotalRevenue = typeEntries.reduce((s, a) => s + a.revenue, 0);
        const perTypeTotalProfit = perTypeTotalRevenue - perTypeTotalCost;
        const perTypeTotalMargin = perTypeTotalRevenue > 0 ? perTypeTotalProfit / perTypeTotalRevenue : 0;
        const perTypeTotalsRow = summarySheet.addRow(['Razem', '', '', perTypeTotalCost, perTypeTotalRevenue, perTypeTotalProfit, perTypeTotalMargin]);
        perTypeTotalsRow.font = { bold: true };
        perTypeTotalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

        for (let r = perTypeFirstRow; r <= perTypeTotalsRow.number; r++) {
            summarySheet.getCell(`C${r}`).numFmt = '#,##0.##';
            summarySheet.getCell(`D${r}`).numFmt = '#,##0.00';
            summarySheet.getCell(`E${r}`).numFmt = '#,##0.00';
            summarySheet.getCell(`F${r}`).numFmt = '#,##0.00';
            summarySheet.getCell(`G${r}`).numFmt = '0.00%';
        }

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
            { header: 'Q&A (liczba)', key: 'qaCount', width: 14 },
        ];

        const headerRow = budgetSheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

        const qaSheetRows = [];
        rows.forEach((row, index) => {
            const excelRow = index + 2; // row 1 = header
            const qaList = Array.isArray(row.qa)
                ? row.qa.filter(p => String(p?.question || '').trim() || String(p?.answer || '').trim())
                : [];
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
                offerPrice: { formula: `=IF(K${excelRow}=0,0,J${excelRow}*(1+K${excelRow})*(1-L${excelRow}))`, result: Number(row.offerPrice) || 0 },
                comment: row.comment || '',
                status: row.status || '',
                qaCount: qaList.length,
            });
            void addedRow;
            qaList.forEach((p) => {
                qaSheetRows.push({
                    subjectName: row.subjectName || '',
                    parentName: row.parentName || '',
                    name: row.name || '',
                    question: String(p.question || ''),
                    answer: String(p.answer || ''),
                });
            });
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

        // Q&A sheet — zagnieżdżona tabela: Pozycja WBS / Pytanie / Odpowiedź
        const qaSheet = workbook.addWorksheet('Q&A');
        qaSheet.columns = [
            { header: 'Przedmiot', key: 'subjectName', width: 28 },
            { header: 'Podgałąź', key: 'parentName', width: 24 },
            { header: 'Pozycja WBS', key: 'name', width: 34 },
            { header: 'Pytanie', key: 'question', width: 50 },
            { header: 'Odpowiedź', key: 'answer', width: 50 },
        ];
        const qaHeaderRow = qaSheet.getRow(1);
        qaHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        qaHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        qaSheetRows.forEach((qaRow) => {
            const added = qaSheet.addRow(qaRow);
            added.alignment = { wrapText: true, vertical: 'top' };
        });
        qaSheet.views = [{ state: 'frozen', ySplit: 1 }];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${safeProjectName}_budzet.xlsx`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const handleExportOfertaExcel = async () => {
        const rows = buildRows(VIEWS.BUDGET).map(r => {
            const q = Math.max(0, parseFloat(r.quantity) || 0);
            const uc = Math.max(0, parseFloat(r.unitCost) || 0);
            const marginRaw = (r.margin != null && String(r.margin) !== '') ? parseFloat(r.margin) : null;
            const d = Math.max(0, parseFloat(r.discount) || 0);
            const totalCost = uc * q;
            let offerPrice = (marginRaw !== null && marginRaw !== 0) ? totalCost * (1 + marginRaw / 100) : 0;
            if (offerPrice > 0 && d > 0) offerPrice = Math.max(0, offerPrice * (1 - d / 100));
            return { ...r, totalCost, offerPrice };
        });
        if (!rows.length) {
            alert('Brak danych budżetowych do eksportu.');
            return;
        }

        // Agregacja po najwyższej gałęzi WBS (subjectName = root branch)
        const aggMap = new Map();
        for (const row of rows) {
            const label = (row.subjectName || '—').trim().toUpperCase();
            const key = row.subjectId || `__noid__${label}`;
            if (!aggMap.has(key)) aggMap.set(key, { label, offerPrice: 0, comments: [] });
            const entry = aggMap.get(key);
            entry.offerPrice += Number(row.offerPrice) || 0;
            const c = String(row.comment || '').trim();
            if (c && !entry.comments.includes(c)) entry.comments.push(c);
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Oferta');

        sheet.columns = [
            { header: 'Pozycja', key: 'subject', width: 48 },
            { header: 'Cena ofertowa (PLN)', key: 'offerPrice', width: 22 },
        ];

        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        headerRow.alignment = { vertical: 'middle' };

        // Rabaty z budżetu — proporcjonalnie rozłożone na pozycje (dopasowanie do PRZYCHÓD w aplikacji)
        const rawRevenue = [...aggMap.values()].reduce((s, d) => s + (Number(d.offerPrice) || 0), 0);
        const parsedPct = Number(String(budgetDiscountPercent ?? '').replace(',', '.'));
        const parsedAmt = Number(String(budgetDiscountAmount ?? '').replace(',', '.'));
        const discFromPct = Number.isFinite(parsedPct) ? Math.max(0, parsedPct) / 100 * rawRevenue : 0;
        const discFromAmt = Number.isFinite(parsedAmt) ? Math.max(0, parsedAmt) : 0;
        const totalRevenue = Math.max(0, rawRevenue - discFromPct - discFromAmt);
        const discountFactor = rawRevenue > 0 ? totalRevenue / rawRevenue : 1;

        const firstDataRow = 2;
        for (const [, data] of aggMap) {
            const discounted = (Number(data.offerPrice) || 0) * discountFactor;
            const added = sheet.addRow({
                subject: data.label,
                offerPrice: discounted > 0 ? discounted : null,
            });
            added.alignment = { wrapText: true, vertical: 'top' };
        }
        const lastDataRow = firstDataRow + aggMap.size - 1;

        // Wiersz sumujący — łączna cena ofertowa (po rabatach)
        const totalsRow = sheet.addRow({
            subject: 'Razem',
            offerPrice: aggMap.size > 0
                ? { formula: `=SUM(B${firstDataRow}:B${lastDataRow})`, result: totalRevenue }
                : totalRevenue,
        });
        totalsRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

        // Szacowana ilość dni pracy — suma quantity dla type=work/praca, unit=dni
        const workDays = rows.reduce((sum, r) => {
            const t = String(r.type || '').toLowerCase();
            const isWork = t === 'work' || t === 'praca' || String(r.budgetType || '').toUpperCase() === 'WORK';
            const u = String(r.unit || '').toLowerCase().trim();
            const isDni = u === 'dni' || u === 'dzień' || u === 'dzien' || u === 'd';
            return isWork && isDni ? sum + (Number(r.quantity) || 0) : sum;
        }, 0);

        sheet.addRow([]);
        sheet.addRow([]);
        sheet.addRow({ subject: 'szacowana ilość dni pracy', offerPrice: `${workDays} dni` });
        sheet.addRow({ subject: 'ważność oferty', offerPrice: '14 dni' });

        sheet.getColumn('offerPrice').numFmt = '#,##0.00';
        sheet.views = [{ state: 'frozen', ySplit: 1 }];

        // ── Sheet Materiały: płaska lista (bez agregacji, bez cen, z komentarzami) ──
        const materialsSheet = workbook.addWorksheet('Materiały');
        const STATUS_LABELS_XLS = { PENDING: 'Oczekuje', PROPOSAL: 'Propozycja', CONFIRMED: 'Potwierdzone', REJECTED: 'Odrzucone', ORDERED: 'Zamówione', IN_STOCK: 'Na magazynie', ISSUED: 'Wydane' };
        const upperFirstSegment = (path) => {
            if (!path) return '';
            const idx = path.indexOf(' › ');
            if (idx < 0) return path.toUpperCase();
            return path.slice(0, idx).toUpperCase() + path.slice(idx);
        };

        // Mapa nodeId → material requirement: po wbsNodeId, po allokacjach, oraz po tagu req:
        const reqByNodeId = {};
        for (const req of allRequirements) {
            if (req.wbsNodeId) reqByNodeId[req.wbsNodeId] = req;
            try {
                const alloc = JSON.parse(req.wbsNodeAllocations || '{}');
                for (const nid of Object.keys(alloc)) {
                    if (nid && !reqByNodeId[nid]) reqByNodeId[nid] = req;
                }
            } catch {}
        }
        for (const node of wbsData) {
            if (reqByNodeId[node.id]) continue;
            const reqTag = (node.tags || []).find(t => typeof t === 'string' && t.startsWith('req:'));
            if (!reqTag) continue;
            const req = allRequirements.find(r => r.id === reqTag.slice(4));
            if (req) reqByNodeId[node.id] = req;
        }

        const matNodes = wbsData.filter(n => n.type === 'material' || n.type === 'equipment');
        matNodes.sort((a, b) => (a.path || '').localeCompare(b.path || '', 'pl', { numeric: true, sensitivity: 'base' }));

        materialsSheet.columns = [
            { header: 'Lp.', key: 'idx', width: 5 },
            { header: 'Pełna ścieżka WBS', key: 'path', width: 56 },
            { header: 'Pozycja', key: 'name', width: 32 },
            { header: 'Ilość', key: 'qty', width: 10 },
            { header: 'Jednostka', key: 'unit', width: 12 },
            { header: 'Wymagania techniczne', key: 'tech', width: 48 },
            { header: 'Producent', key: 'manufacturer', width: 18 },
            { header: 'Model', key: 'model', width: 18 },
            { header: 'Nazwa handlowa', key: 'productName', width: 24 },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Komentarz', key: 'comment', width: 40 },
        ];
        const matHeader = materialsSheet.getRow(1);
        matHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        matHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

        matNodes.forEach((node, i) => {
            const card = reqByNodeId[node.id] || null;
            const segs = node.path ? node.path.split(' › ') : [];
            // Ścieżka bez ostatniego segmentu (sam węzeł jest w kolumnie "Pozycja")
            const pathWithoutSelf = segs.length > 1 ? segs.slice(0, -1).join(' › ') : '';
            const selectedProposal = (card?.proposals || []).find(p => p.isSelected);
            const chosen = selectedProposal || card || null;
            const added = materialsSheet.addRow({
                idx: i + 1,
                path: upperFirstSegment(pathWithoutSelf),
                name: node.name || '',
                qty: Number(node.quantity ?? 1),
                unit: node.unit || 'szt',
                tech: card?.technicalSpec || '',
                manufacturer: chosen?.manufacturer || '',
                model: chosen?.model || '',
                productName: chosen?.productName || '',
                status: STATUS_LABELS_XLS[card?.status] || (card?.status || ''),
                comment: node.comment || '',
            });
            added.alignment = { vertical: 'top', wrapText: true };
        });

        materialsSheet.getColumn('qty').numFmt = '#,##0.##';
        materialsSheet.views = [{ state: 'frozen', ySplit: 1 }];
        if (matNodes.length > 0) {
            materialsSheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: matNodes.length + 1, column: materialsSheet.columnCount },
            };
        }

        const safeProjectName = String(orderName || projectName || 'projekt').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'projekt';
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `Airtel_oferta_${safeProjectName}.xlsx`;
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

    // Drag krawędzi belki w Gantcie → quantity (dni) + unit='dni' przez wbs-nodes/{id} (PATCH).
    // Używa updateNodeField który optymistycznie aktualizuje wbsData i wbsTree.
    const handleGanttDurationChange = useCallback(async (nodeId, days) => {
        if (!nodeId || !Number.isFinite(days)) return;
        await updateNodeField(nodeId, 'quantity', String(days));
        await updateNodeField(nodeId, 'unit', 'dni');
    }, [updateNodeField]);

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


    // Wariant A: znajduje wszystkie material-requirements o tej samej nazwie
    // w obrębie aktualnego scope (allRequirements jest pobrane dla nodeId/versionId).
    // Match: req.name LUB nazwa dowolnego linkowanego WBS węzła (przez wbsNodeId
    // albo wbsNodeAllocations). Konieczne, bo zdarzają się orphan reqs z pustą
    // nazwą (auto-generated) gdzie poprawna nazwa jest tylko na WBS węźle.
    const findRequirementIdsForLookupKey = useCallback((_subjectName, name) => {
        const targetName = String(name || '').trim().toLowerCase();
        if (!targetName) return [];
        const wbsNameById = new Map((wbsData || []).map(n => [n.id, String(n.name || '').trim().toLowerCase()]));
        return (allRequirements || []).filter(req => {
            if (String(req?.name || '').trim().toLowerCase() === targetName) return true;
            let alloc = {};
            try { alloc = req.wbsNodeAllocations ? JSON.parse(req.wbsNodeAllocations) : {}; } catch {}
            const allocIds = Object.keys(alloc).filter(id => parseFloat(alloc[id]) > 0);
            const ids = allocIds.length > 0 ? allocIds : (req.wbsNodeId ? [String(req.wbsNodeId)] : []);
            return ids.some(id => wbsNameById.get(id) === targetName);
        }).map(r => r.id).filter(Boolean);
    }, [allRequirements, wbsData]);

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
                const resolvedQuantity = quantity; // per-node, never use aggregate inheritedQuantity
                const persistedRowUnitCost = parseFloat(row.unitCost) || 0;
                const inheritedUnitCost = inheritedQuantity > 0 && inheritedCost > 0 ? inheritedCost / inheritedQuantity : 0;
                const resolvedUnitCost = inheritedFromMaterials
                    ? (inheritedUnitCost > 0 ? inheritedUnitCost : persistedRowUnitCost)
                    : persistedRowUnitCost;
                const totalCost = inheritedFromMaterials
                    ? (inheritedCost > 0 ? inheritedCost : resolvedUnitCost * resolvedQuantity)
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
            // Wariant A: ten sam materiał (subject::name) = jedna cena - patchujemy WSZYSTKIE
            // requirements mapujące się na ten lookupKey, nie tylko ten powiązany przez req: tag.
            // Inaczej refreshMaterialCosts agreguje "starą" cenę z innych wierszy i ją "odtwarza".
            if (field === 'unitCost') {
                const normalizedType = String(row.type || row.budgetType || '').toLowerCase();
                if (normalizedType === 'material' || normalizedType === 'equipment') {
                    const lookupKey = makeMaterialLookupKey(row.subjectName || row.name, row.name);
                    setMaterialMetaByLookupKey(prev => {
                        const existing = prev[lookupKey];
                        const existingQty = parseFloat(existing?.quantity) || q;
                        return { ...prev, [lookupKey]: { ...(existing || {}), cost: uc * existingQty, quantity: existingQty } };
                    });
                    const reqIds = findRequirementIdsForLookupKey(row.subjectName || row.name, row.name);
                    if (reqIds.length > 0) {
                        Promise.all(reqIds.map(reqId => fetch(`${API_URL}/material-requirements/${reqId}`, {
                            method: 'PATCH',
                            headers: authHeaders(),
                            body: JSON.stringify({ priceNetto: uc }),
                        }))).then(async () => {
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
                    const reqIds = findRequirementIdsForLookupKey(row.subjectName || row.name, row.name);
                    if (reqIds.length > 0) {
                        Promise.all(reqIds.map(reqId => fetch(`${API_URL}/material-requirements/${reqId}`, {
                            method: 'PATCH',
                            headers: authHeaders(),
                            body: JSON.stringify({ unit: row.unit }),
                        }))).then(() => setReqRefreshKey(k => k + 1)).catch(() => {});
                    }
                }
            }
        }
    }, [saveBudgetField, updateNodeField, materialMetaByLookupKey, updateLocalWbsBudgetRow, syncMaterialRequirementsFromWbsQuantity, authHeaders, nodeId, versionId, wbsData, refreshUnified, findRequirementIdsForLookupKey, refreshMaterialCosts]);

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
                        ? (wbsReqQty != null ? wbsReqQty : persistedQuantity)
                        : (isWorkType && wbsReqQty != null ? wbsReqQty : persistedQuantity);
                    const persistedUnitCost = parseFloat(item.unitCost) || 0;
                    const totalCost = inheritedFromMaterials
                        ? (inheritedCost > 0 ? inheritedCost : persistedUnitCost * quantity)
                        : (Number.isFinite(parseFloat(item.totalCost))
                            ? parseFloat(item.totalCost)
                            : persistedUnitCost * quantity);
                    const unitCost = inheritedFromMaterials
                        ? (inheritedQuantity > 0 && inheritedCost > 0
                            ? inheritedCost / inheritedQuantity
                            : persistedUnitCost)
                        : (Number.isFinite(persistedUnitCost)
                            ? persistedUnitCost
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
                    const itemSegs = (item.path || '').split(' › ');
                    const subjectPath = itemSegs.length > 1 ? itemSegs.slice(0, -1).join(' / ') : (itemSegs[0] || subjectName);
                    return {
                        ...item,
                        subjectId: subject.id,
                        subjectName,
                        subjectPath,
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

    const budgetRows = useMemo(
        () => buildRows(VIEWS.BUDGET),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [wbsData, materialMetaByLookupKey, materialCostsByNode, requirementsQtyByNode, normalizedSearchQuery]
    );

    const wbsBranchTable = useMemo(() => {
        if (!wbsData.length) return '';
        const byId = new Map(wbsData.map(n => [n.id, n]));
        const getRootName = (item) => {
            let cur = item;
            while (cur?.parentId) { const p = byId.get(cur.parentId); if (!p) break; cur = p; }
            return { id: cur?.id || item.id, name: cur?.name || item.name || '' };
        };
        const bySubject = new Map();
        for (const item of wbsData) {
            if (!item.parentId) continue;
            const q = Math.max(0, parseFloat(item.quantity) || 0);
            const uc = Math.max(0, parseFloat(item.unitCost) || 0);
            const totalCost = uc * q;
            const marginRaw = (item.margin != null && String(item.margin) !== '') ? parseFloat(item.margin) : null;
            const d = Math.max(0, parseFloat(item.discount) || 0);
            let offerPrice = (marginRaw !== null && marginRaw !== 0) ? totalCost * (1 + marginRaw / 100) : 0;
            if (offerPrice > 0 && d > 0) offerPrice = Math.max(0, offerPrice * (1 - d / 100));
            if (offerPrice <= 0) continue;
            const { id, name } = getRootName(item);
            if (!bySubject.has(id)) bySubject.set(id, { label: name, total: 0 });
            bySubject.get(id).total += offerPrice;
        }
        const entries = [...bySubject.values()].filter(e => e.total > 0);
        if (!entries.length) return '';
        const tableRows = entries.map((e, i) => `| ${i + 1}. | ${e.label} | ${fmtPLN(e.total)} |`).join('\n');
        return `| Lp. | Etap projektu | Wartość netto |\n|---|---|---|\n${tableRows}`;
    }, [wbsData]);

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

    const moveSectionUp = useCallback((key) => {
        setSectionOrder(prev => {
            const i = prev.indexOf(key);
            if (i <= 0) return prev;
            const next = [...prev];
            [next[i - 1], next[i]] = [next[i], next[i - 1]];
            return next;
        });
    }, []);

    const moveSectionDown = useCallback((key) => {
        setSectionOrder(prev => {
            const i = prev.indexOf(key);
            if (i < 0 || i >= prev.length - 1) return prev;
            const next = [...prev];
            [next[i], next[i + 1]] = [next[i + 1], next[i]];
            return next;
        });
    }, []);

    const renderSection = (key, title, Icon, colorClass, content, onExport, extraButtons = null) => {
        const isActive = expandedSection === key;
        const isHidden = expandedSection !== null && !isActive;
        const isCompactSection = key === 'budget' || key === 'materials' || key === 'wbs-hybrid' || key === 'strategy' || key === 'gantt' || key === 'oferta';
        const orderIdx = sectionOrder.indexOf(key);

        return (
            <div
                key={key}
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
                        <div className="flex flex-col gap-0.5 opacity-40 hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button onClick={() => moveSectionUp(key)} disabled={orderIdx <= 0} className="p-0.5 rounded hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all" title="Przesuń sekcję w górę">
                                <ChevronUp size={10} className="text-gray-400" />
                            </button>
                            <button onClick={() => moveSectionDown(key)} disabled={orderIdx >= sectionOrder.length - 1} className="p-0.5 rounded hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all" title="Przesuń sekcję w dół">
                                <ChevronDown size={10} className="text-gray-400" />
                            </button>
                        </div>
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
                                    onClick={(e) => { e.stopPropagation(); exportProjectPdf({ nodeId, versionId, projectName, orderName, ganttHtml: ganttGetHtmlRef.current?.() || null }); }}
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

    const isCompactActive = (expandedSection === 'budget' || expandedSection === 'materials' || expandedSection === 'wbs-hybrid' || expandedSection === 'strategy' || expandedSection === 'gantt' || expandedSection === 'oferta');

    return (
        <div className={`flex flex-col w-full h-full relative bg-[#0a0c10]/50 border border-white/[0.03] gap-1 pt-0 ${isCompactActive ? 'overflow-hidden p-0' : 'overflow-y-auto pr-2 custom-scrollbar rounded-[40px] p-2'}`}>
            <input
                ref={budgetImportFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleBudgetImportFileChange}
            />
            {sectionOrder.map(key => {
                if (key === 'oferta') {
                    if (!isManagerOrAdmin) return null;
                    const offerSummary = summarizeBudgetRows(budgetRows);
                    const workDaysTotal = budgetRows.reduce((sum, r) => {
                        const t = String(r.type || '').toLowerCase();
                        const isWork = t === 'work' || t === 'praca' || String(r.budgetType || '').toUpperCase() === 'WORK';
                        const u = String(r.unit || '').toLowerCase().trim();
                        const isDni = u === 'dni' || u === 'dzień' || u === 'dzien' || u === 'd';
                        return isWork && isDni ? sum + (Number(r.quantity) || 0) : sum;
                    }, 0);
                    const resolvedPresets = offerPresets.map(p => ({
                        ...p,
                        text: p.text
                            .replace(/\{nazwa projektu\}/g, orderName || projectName || '')
                            .replace(/\{wartość oferty\}/g, fmtPLN(offerSummary.totalRevenue) + ' PLN')
                            .replace(/\{data oferty\}/g, offerDate)
                            .replace(/\{tabela wbs\}/g, wbsBranchTable)
                            .replace(/\{Roboczo dni w projekcie\}/gi, workDaysTotal % 1 === 0 ? String(workDaysTotal) : workDaysTotal.toFixed(1)),
                    }));
                    return renderSection('oferta', 'Oferta', FileText, 'amber', (
                        <div className="flex flex-col flex-1 min-h-0 p-4 gap-2">
                            <div className="flex items-center gap-3 px-1">
                                <span className="text-[11px] text-gray-400 uppercase tracking-widest">Data oferty</span>
                                <input
                                    type="text"
                                    value={offerDate}
                                    onChange={e => setOfferDate(e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500/50 w-32"
                                    placeholder="dd.mm.rrrr"
                                />
                                <span className="text-[11px] text-gray-500">Przychód: <span className="text-amber-300 font-semibold">{fmtPLN(offerSummary.totalRevenue)} PLN</span></span>
                            </div>
                            <MarkdownEditor
                                value={offerText}
                                onChange={setOfferText}
                                onSave={(v) => saveOffer(v)}
                                previewTitle="Oferta"
                                onExportPDF={() => handleExportPDF('oferta')}
                                placeholder="Treść oferty dla klienta..."
                                containerClassName="flex-1 min-h-0"
                                className="flex-1 min-h-0 w-full bg-black/40 border border-white/10 rounded-xl p-6 text-gray-300 text-lg focus:outline-none focus:border-amber-500 transition-colors custom-scrollbar leading-relaxed resize-none"
                                saveIndicator={true}
                                presets={resolvedPresets}
                                onManagePresets={() => setPresetManagerOpen(true)}
                            />
                        </div>
                    ), () => handleExportPDF('oferta'));
                }
                if (key === 'strategy') {
                    return renderSection('strategy', 'Jak to chcemy zrobić', HelpCircle, 'blue', (
                        <div className="flex flex-col flex-1 min-h-0 p-4">
                            <MarkdownEditor
                                value={wbsDescription}
                                onChange={setWbsDescription}
                                onSave={(v) => saveStrategy(v)}
                                previewTitle="Jak to chcemy zrobić"
                                onExportPDF={() => handleExportPDF('strategy')}
                                placeholder="Zdefiniuj plan i strategię realizacji projektu..."
                                containerClassName="flex-1 min-h-0"
                                className="flex-1 min-h-0 w-full bg-black/40 border border-white/10 rounded-xl p-6 text-gray-300 text-lg focus:outline-none focus:border-blue-500 transition-colors custom-scrollbar leading-relaxed resize-none"
                                saveIndicator={true}
                            />
                        </div>
                    ), () => handleExportPDF('strategy'));
                }
                if (key === 'tasks') {
                    return renderSection('tasks', 'Zadania', CalendarDays, 'blue', (
                        <TasksCalendarSection
                            nodeId={nodeId}
                            versionId={versionId}
                            nodeName={projectName}
                            onWbsUpdate={onWbsUpdate}
                        />
                    ));
                }
                if (key === 'gantt') {
                    return renderSection('gantt', 'Harmonogram (Gantt)', BarChart3, 'cyan', (
                        <GanttSection
                            wbsTree={wbsTree}
                            projectName={orderName || projectName || 'Projekt'}
                            onNodeDurationChange={handleGanttDurationChange}
                            onExportReady={fn => { ganttExportRef.current = fn; }}
                            onGetHtmlReady={fn => { ganttGetHtmlRef.current = fn; }}
                        />
                    ), () => ganttExportRef.current?.());
                }
                if (key === 'wbs-hybrid') {
                    return renderSection('wbs-hybrid', `Struktura projektu: ${orderName || projectName || '—'}`, ListTree, 'violet', (
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
                                onPasteCloned={handlePasteCloned}
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
                    ) : null);
                }
                if (key === 'budget') {
                    if (!isManagerOrAdmin) return null;
                    return renderSection('budget', 'Budżet', DollarSign, 'green', (
                        <BudgetTable
                            rows={budgetRows}
                            onFieldChange={onBudgetFieldChange}
                            onDeleteRow={(id) => deleteNodeByIdRef.current?.(id)}
                            discountPercent={budgetDiscountPercent}
                            discountAmount={budgetDiscountAmount}
                            onDiscountPercentChange={setBudgetDiscountPercent}
                            onDiscountAmountChange={setBudgetDiscountAmount}
                        />
                    ), () => handleExportPDF('budget'), (
                        <div className="flex items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); handleExportOfertaExcel(); }} className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-blue-300 text-[10px] font-bold uppercase tracking-widest transition-all">
                                <FileDown size={11} /> Eksport oferty
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleExportBudgetExcel(); }} className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg text-green-300 text-[10px] font-bold uppercase tracking-widest transition-all">
                                <FileDown size={11} /> Eksport budżetu do Excel
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); budgetImportFileInputRef.current?.click(); }} className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-emerald-300 text-[10px] font-bold uppercase tracking-widest transition-all">
                                <FileDown size={11} /> Import budżetu z Excel
                            </button>
                        </div>
                    ),
                    null,
                    wbsData.filter(n => n.parentId == null).length === 0 ? (
                        <button className="ml-2 px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs rounded-lg font-bold shadow border border-emerald-900/40 transition-all" onClick={e => { e.stopPropagation(); addNode(null); }}>
                            + Dodaj produkt projektu
                        </button>
                    ) : null);
                }
                if (key === 'materials') {
                    return renderSection('materials', 'Materiały', Zap, 'yellow', (
                        <WbsMaterialsPanel
                            nodeId={nodeId}
                            versionId={versionId}
                            readOnly={!isManagerOrAdmin && !isLogistyk}
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
                            <button onClick={e => { e.stopPropagation(); materialsPdfExportFn.current?.(); }} className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-red-300 text-[10px] font-bold uppercase tracking-widest transition-all flex-shrink-0">
                                <FileDown size={11} /> PDF
                            </button>
                            <button onClick={e => { e.stopPropagation(); materialsExportFn.current?.(); }} className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-lg text-emerald-300 text-[10px] font-bold uppercase tracking-widest transition-all flex-shrink-0">
                                <FileDown size={11} /> Excel
                            </button>
                        </>
                    ));
                }
                return null;
            })}

            {presetManagerOpen && (
                <div className="fixed inset-0 z-[130] bg-[#05070bcc] backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPresetManagerOpen(false)}>
                    <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                            <div>
                                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Szablony oferty</h3>
                                <p className="text-[10px] text-gray-500 mt-0.5">Zmienne: {['{nazwa projektu}', '{wartość oferty}', '{data oferty}', '{tabela wbs}', '{Roboczo dni w projekcie}'].map(v => (
                                    <code key={v} className="bg-black/30 px-1 rounded text-amber-300 mr-1">{v}</code>
                                ))}</p>
                            </div>
                            <button onClick={() => setPresetManagerOpen(false)} className="p-2 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"><X size={14} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3">
                            {offerPresets.map((p, idx) => (
                                <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-2">
                                    {editingPreset?.id === p.id ? (
                                        <>
                                            <input
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 transition-colors"
                                                placeholder="Nazwa szablonu"
                                                value={editingPresetDraft.label}
                                                onChange={e => setEditingPresetDraft(d => ({ ...d, label: e.target.value }))}
                                            />
                                            <textarea
                                                rows={5}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-amber-400 transition-colors resize-none custom-scrollbar leading-relaxed"
                                                placeholder="Treść szablonu (Markdown)..."
                                                value={editingPresetDraft.text}
                                                onChange={e => setEditingPresetDraft(d => ({ ...d, text: e.target.value }))}
                                            />
                                            <div className="flex gap-2">
                                                <button onClick={commitPreset} className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-amber-300 text-[10px] font-bold uppercase tracking-widest transition-all">Zapisz</button>
                                                <button onClick={() => { setEditingPreset(undefined); setEditingPresetDraft({ label: '', text: '' }); }} className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 text-[10px] font-bold uppercase tracking-widest transition-all">Anuluj</button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex items-start gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-bold text-amber-300 truncate">{p.label}</div>
                                                <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2 whitespace-pre-wrap">{p.text}</div>
                                            </div>
                                            <div className="flex gap-1 flex-shrink-0">
                                                <button onClick={() => openEditPreset(p)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-all text-[10px]">✏️</button>
                                                <button onClick={() => deletePreset(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-300 transition-all text-[10px]">🗑</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {editingPreset === null && (
                                <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-3 flex flex-col gap-2">
                                    <p className="text-[10px] text-amber-400/60 uppercase tracking-widest font-bold">Nowy szablon</p>
                                    <input
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 transition-colors"
                                        placeholder="Nazwa szablonu"
                                        value={editingPresetDraft.label}
                                        onChange={e => setEditingPresetDraft(d => ({ ...d, label: e.target.value }))}
                                        autoFocus
                                    />
                                    <textarea
                                        rows={5}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-amber-400 transition-colors resize-none custom-scrollbar leading-relaxed"
                                        placeholder="Treść szablonu (Markdown)..."
                                        value={editingPresetDraft.text}
                                        onChange={e => setEditingPresetDraft(d => ({ ...d, text: e.target.value }))}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={commitPreset} disabled={!editingPresetDraft.label.trim()} className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-amber-300 text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40">Dodaj</button>
                                        <button onClick={() => { setEditingPreset(undefined); setEditingPresetDraft({ label: '', text: '' }); }} className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 text-[10px] font-bold uppercase tracking-widest transition-all">Anuluj</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
                            <button
                                onClick={openNewPreset}
                                disabled={editingPreset === null}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-amber-300 text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40"
                            >
                                <Plus size={11} /> Nowy szablon
                            </button>
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
