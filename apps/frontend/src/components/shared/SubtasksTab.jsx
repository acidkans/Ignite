import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Save, Sparkles, HelpCircle, AlertTriangle, CheckCircle, Clock, X, Plus, GripVertical, Trash2, Zap, ArrowRight, BrainCircuit, RefreshCw, Layers, LayoutList, GripHorizontal, CheckCircle2, ChevronRight, FileDown, Package } from 'lucide-react';
import { API_URL } from '../../config';
import ProjectItemsPanel from './wbs/ProjectItemsPanel';
import CalendarView from './wbs/CalendarView';
import SubtaskModal from './SubtaskModal';
import ReactMarkdown from 'react-markdown';
import MaterialRequirementsPanel from './wbs/MaterialRequirementsPanel';
import WBSHybridTable from './wbs/WBSHybridTable';
import {
    ClientSideRowModelModule,
    TextEditorModule,
    NumberEditorModule,
    SelectEditorModule,
    TextFilterModule,
    NumberFilterModule,
    RowSelectionModule,
    ValidationModule
} from 'ag-grid-community';

const CATEGORIES = [
    { key: 'terminowe', label: 'Terminowe', icon: Clock, iconColor: 'text-orange-400', color: 'orange' },
    { key: 'instalacyjne', label: 'Instalacyjne', icon: Clock, iconColor: 'text-blue-400', color: 'blue' },
    { key: 'organizacyjne', label: 'Organizacyjne', icon: Clock, iconColor: 'text-purple-400', color: 'purple' },
    { key: 'jakosciowe', label: 'Jakościowe', icon: Clock, iconColor: 'text-green-400', color: 'green' },
    { key: 'techniczne', label: 'Techniczne', icon: Clock, iconColor: 'text-cyan-400', color: 'cyan' },
    { key: 'finansowe', label: 'Finansowe', icon: Clock, iconColor: 'text-yellow-400', color: 'yellow' },
    { key: 'sla', label: 'SLA', icon: Clock, iconColor: 'text-indigo-400', color: 'indigo' },
    { key: 'gwarancyjne', label: 'Gwarancyjne', icon: Clock, iconColor: 'text-rose-400', color: 'rose' },
];

export default function SubtasksTab({ nodeId, versionId, workerView = false, filterUserId = null, workerRoles = [], onNavigateToMaterials = null, nodeName, onWbsUpdate = null, searchQuery: parentSearchQuery = '' }) {
    const [reqData, setReqData] = useState(null);
    const [projectItems, setProjectItems] = useState({});
    const [subtasks, setSubtasks] = useState([]);
    const [wbsDescription, setWbsDescription] = useState('');
    const [wbsTree, setWbsTree] = useState({});
    const [showWBSTable, setShowWBSTable] = useState(false);
    const [showStrategy, setShowStrategy] = useState(false);
    const [showPlan, setShowPlan] = useState(false);
    const [showMaterials, setShowMaterials] = useState(false);
    const [expandedSection, setExpandedSection] = useState(null);
    const [matGlobalFilter, setMatGlobalFilter] = useState('');
    const [matTypeFilter, setMatTypeFilter] = useState('');
    const [matStatusFilter, setMatStatusFilter] = useState('');
    const [matRefreshKey, setMatRefreshKey] = useState(0);
    const latestWbsTreeRef = useRef({});
    const [unassignedRequirements, setUnassignedRequirements] = useState([]);
    const [extractingForWbs, setExtractingForWbs] = useState(false);
    const isManager = workerRoles.some(r => ['MANAGER', 'ADMIN'].includes(r));

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const isSavingRef = useRef(false);

    const [expandedCat, setExpandedCat] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTask, setSelectedTask] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [logistykUsers, setLogistykUsers] = useState([]);
    const [projectUsers, setProjectUsers] = useState([]);
    const [nodeOwnerId, setNodeOwnerId] = useState(null);
    const [nodeVisibility, setNodeVisibility] = useState(null);
    const [nodeTeamIds, setNodeTeamIds] = useState([]);
    const saveTimeoutRef = useRef(null);
    const strategyRef = useRef(null);
    
    // Tracking refs to solve race conditions during async saves
    const latestSubtasksRef = useRef(subtasks);
    const latestItemsRef = useRef(projectItems);
    const latestWbsDescRef = useRef(wbsDescription);

    useEffect(() => { latestSubtasksRef.current = subtasks; }, [subtasks]);
    useEffect(() => { latestItemsRef.current = projectItems; }, [projectItems]);
    useEffect(() => { latestWbsDescRef.current = wbsDescription; }, [wbsDescription]);
    useEffect(() => { latestWbsTreeRef.current = wbsTree; }, [wbsTree]);

    useEffect(() => {
        if (!loading && strategyRef.current) {
            strategyRef.current.style.height = 'auto';
            strategyRef.current.style.height = strategyRef.current.scrollHeight + 'px';
        }
    }, [loading, wbsDescription]);

    useEffect(() => {
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/users/by-role/LOGISTYK`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then(setLogistykUsers)
            .catch(() => {});
        fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then(setProjectUsers)
            .catch(() => {});
    }, []);

    useEffect(() => {
        const canFetchPermissions = workerRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
        if (!nodeId || !canFetchPermissions) return;
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/process-tree/${nodeId}/permissions`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                setNodeOwnerId(data.ownerId || null);
                setNodeVisibility(data.visibility || null);
                const teamIds = (data.permissions || [])
                    .filter(p => p.teamId)
                    .map(p => p.teamId);
                setNodeTeamIds([...new Set(teamIds)]);
            })
            .catch(() => {});
    }, [nodeId]);

    const fetchData = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const token = sessionStorage.getItem('token');

            if (!workerView) {
                const subUrl = versionId ? `${API_URL}/subtasks/node/${nodeId}?versionId=${versionId}` : `${API_URL}/subtasks/node/${nodeId}`;
                const reqUrl = versionId ? `${API_URL}/order-requirements/${nodeId}?versionId=${versionId}` : `${API_URL}/order-requirements/${nodeId}`;
                const [reqRes, subRes] = await Promise.all([
                    fetch(reqUrl, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(subUrl, { headers: { 'Authorization': `Bearer ${token}` } })
                ]);
                if (reqRes.ok) {
                    const text = await reqRes.text();
                    const data = text ? JSON.parse(text) : null;
                    if (!data) { setLoading(false); return; }
                    setReqData(data);
                    setWbsDescription(data.wbsDescription || '');
                    try { setProjectItems(JSON.parse(data.projectItems || '{}')); }
                    catch { setProjectItems({}); }
                    try {
                        const t = JSON.parse(data.wbsTree || '{}');
                        // Migrate old cat_* format → new { items: [] } format
                        if (!Array.isArray(t.items)) {
                            const migrated = { items: [] };
                            // If old format had cat_* keys with items, migrate them as top-level nodes
                            CATEGORIES.forEach(cat => {
                                const catData = t[`cat_${cat.key}`];
                                if (catData?.items?.length > 0) {
                                    migrated.items.push({
                                        id: crypto.randomUUID(),
                                        name: cat.label,
                                        status: catData.status || '',
                                        owner: catData.owner || '',
                                        resources: '',
                                        cost: '',
                                        children: catData.items.map(item => ({
                                            ...item,
                                            children: (item.children || []).map(c => ({ ...c, children: c.children || [] })),
                                        })),
                                    });
                                }
                            });
                            setWbsTree(migrated); latestWbsTreeRef.current = migrated;
                        } else {
                            setWbsTree(t); latestWbsTreeRef.current = t;
                        }
                    }
                    catch { setWbsTree({}); }
                }
                if (subRes.ok) setSubtasks(await subRes.json() || []);
            } else {
                // Worker view: fetch all tasks assigned to current user across all nodes
                const subRes = await fetch(`${API_URL}/subtasks/assigned/me`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (subRes.ok) setSubtasks(await subRes.json() || []);
            }
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (workerView) {
            fetchData();
        } else if (nodeId) {
            fetchData();
        }
    }, [nodeId, versionId, workerView]);

    const TYPE_MAP = { 'Materiały': 'MATERIAL', 'Praca': 'WORK', 'Usługi obce': 'EXTERNAL_SERVICE' };
    const UNIT_MAP = { 'Materiały': 'szt', 'Praca': 'rbh', 'Usługi obce': 'szt' };

    const handleWbsNodesDeleted = async (deletedIds) => {
        const token = localStorage.getItem('token');

        // Poczekaj na zapis WBS (debounce = 400ms) zanim odpytamy serwer
        await new Promise(r => setTimeout(r, 600));

        // Clear material requirement assignments for deleted nodes
        await fetch(`${API_URL}/material-requirements/clear-assignments`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId, deletedWbsNodeIds: deletedIds }),
        }).catch(() => {});

        // Refresh data to reflect changes
        handleWbsRefresh();
        setMatRefreshKey(k => k + 1);
    };

    // Track already-created WBS material nodes to avoid duplicates
    const createdWbsMaterialNodes = useRef(new Set());

    const handleMaterialNodeCreated = async ({ wbsNodeId, name, type, parentId }) => {
        if (!name || createdWbsMaterialNodes.current.has(wbsNodeId)) return;
        createdWbsMaterialNodes.current.add(wbsNodeId);
        const token = sessionStorage.getItem('token');
        const typeMap = { equipment: 'DEVICE', material: 'MATERIAL' };
        // Assign to parent node (przedmiot projektu), fallback to own node
        const assignToNodeId = parentId || wbsNodeId;
        try {
            // Find the active list for this node
            const listsRes = await fetch(`${API_URL}/material-requirements/lists/node/${nodeId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const lists = listsRes.ok ? await listsRes.json() : [];
            const listId = lists.length > 0 ? lists[lists.length - 1].id : null;

            await fetch(`${API_URL}/material-requirements`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nodeId,
                    versionId,
                    listId,
                    name,
                    type: typeMap[type] || 'DEVICE',
                    quantity: 1,
                    unit: 'szt',
                    wbsNodeId: assignToNodeId,
                    wbsNodeIds: JSON.stringify([assignToNodeId]),
                    wbsNodeAllocations: JSON.stringify({ [assignToNodeId]: 1 }),
                }),
            });
            setMatRefreshKey(k => k + 1);
        } catch (e) {
            console.error('Failed to create material requirement from WBS:', e);
        }
    };

    const fetchUnassignedRequirements = useCallback(async () => {
        if (!nodeId) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/material-requirements/node/${nodeId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                const unassigned = data.filter(r => {
                    try {
                        const allocRaw = r.wbsNodeAllocations;
                        const alloc = typeof allocRaw === 'string'
                            ? (JSON.parse(allocRaw || '{}') || {})
                            : (allocRaw || {});
                        return Object.keys(alloc).length === 0;
                    } catch {
                        return true;
                    }
                });
                setUnassignedRequirements(unassigned);
            }
        } catch {
            setUnassignedRequirements([]);
        }
    }, [nodeId]);

    const handleWbsExtract = async () => {
        setExtractingForWbs(true);
        try {
            const token = sessionStorage.getItem('token');
            const params = new URLSearchParams();
            if (versionId) params.append('versionId', versionId);
            const res = await fetch(`${API_URL}/material-requirements/extract/${nodeId}?${params}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                if (data.extracted === 0 && (!data.items || data.items.length === 0)) {
                    alert('Zaimportuj najpierw pliki wsadowe');
                }
                await fetchUnassignedRequirements();
                setMatRefreshKey(k => k + 1);
            }
        } catch (e) {
            console.error('WBS extract error:', e);
        } finally {
            setExtractingForWbs(false);
        }
    };

    const handleRequirementAssignToWbs = async (wbsNodeId, reqId) => {
        if (!isManager) return;
        const req = unassignedRequirements.find(r => r.id === reqId);
        if (!req) return;
        const token = sessionStorage.getItem('token');
        const qty = Number(req.quantity) > 0 ? Number(req.quantity) : 1;
        try {
            await fetch(`${API_URL}/material-requirements/${reqId}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wbsNodeId,
                    wbsNodeIds: JSON.stringify([wbsNodeId]),
                    wbsNodeAllocations: JSON.stringify({ [wbsNodeId]: qty }),
                }),
            });
            setUnassignedRequirements(prev => prev.filter(r => r.id !== reqId));
            setMatRefreshKey(k => k + 1);
        } catch (e) {
            console.error('Failed to assign requirement:', e);
        }
    };

    const handleWbsRefresh = () => {
        // Przeładuj WBS tree gdy materiały zostaną zmienione (bez spinnera — nie odmontowuje paneli)
        fetchData(false);
        onWbsUpdate?.();
        fetchUnassignedRequirements();
    };

    useEffect(() => {
        if (showWBSTable && nodeId) {
            fetchUnassignedRequirements();
        }
    }, [showWBSTable, nodeId, fetchUnassignedRequirements]);

    const handleExportStrategyPDF = () => {
        const md = wbsDescription || '';
        const toHtml = (text) => {
            const lines = text.split('\n');
            const out = [];
            let inList = false, listType = null;
            for (const raw of lines) {
                const line = raw;
                if (/^## (.+)/.test(line)) {
                    if (inList) { out.push(`</${listType}>`); inList = false; }
                    out.push(`<h2>${line.replace(/^## /, '')}</h2>`);
                } else if (/^# (.+)/.test(line)) {
                    if (inList) { out.push(`</${listType}>`); inList = false; }
                    out.push(`<h1>${line.replace(/^# /, '')}</h1>`);
                } else if (/^> (.+)/.test(line)) {
                    if (inList) { out.push(`</${listType}>`); inList = false; }
                    out.push(`<blockquote>${line.replace(/^> /, '')}</blockquote>`);
                } else if (/^\d+\. (.+)/.test(line)) {
                    if (!inList || listType !== 'ol') { if (inList) out.push(`</${listType}>`); out.push('<ol>'); inList = true; listType = 'ol'; }
                    out.push(`<li>${line.replace(/^\d+\. /, '')}</li>`);
                } else if (/^- (.+)/.test(line)) {
                    if (!inList || listType !== 'ul') { if (inList) out.push(`</${listType}>`); out.push('<ul>'); inList = true; listType = 'ul'; }
                    out.push(`<li>${line.replace(/^- /, '')}</li>`);
                } else {
                    if (inList) { out.push(`</${listType}>`); inList = false; }
                    const p = line
                        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.+?)\*/g, '<em>$1</em>');
                    out.push(line.trim() === '' ? '<br>' : `<p>${p}</p>`);
                }
            }
            if (inList) out.push(`</${listType}>`);
            return out.join('\n');
        };

        const title = nodeName || reqData?.name || 'Projekt';
        const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8">
<title>Strategia – ${title}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;color:#1a1a1a;line-height:1.7;font-size:14px}
  h1{font-size:22px;border-bottom:2px solid #2563eb;padding-bottom:8px;color:#1e3a5f}
  h2{font-size:17px;color:#2c3e50;margin-top:24px}
  blockquote{border-left:4px solid #93c5fd;margin:12px 0;padding:4px 16px;color:#374151;background:#eff6ff}
  ul,ol{padding-left:24px}li{margin:4px 0}
  strong{color:#111}em{color:#374151}
  p{margin:6px 0}
  @media print{body{margin:20px}@page{margin:1.5cm}}
</style></head><body>
<h1>Strategia: ${title}</h1>
${toHtml(md)}
</body></html>`;

        const w = window.open('', '_blank', 'width=900,height=700');
        w.document.write(html);
        w.document.close();
        w.onload = () => w.print();
    };

    const handleExportWbsPDF = () => {
        const title = nodeName || reqData?.name || 'Projekt';
        const renderNodes = (nodes, depth = 0) => nodes.map(n => {
            const indent = '&nbsp;'.repeat(depth * 4);
            const children = (n.children || []).length > 0 ? renderNodes(n.children, depth + 1) : '';
            return `<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${indent}${depth === 0 ? `<strong>${n.name || '—'}</strong>` : (n.name || '—')}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${n.type || '—'}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${n.status || '—'}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${n.owner || '—'}</td></tr>${children}`;
        }).join('');
        const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>WBS – ${title}</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;color:#1a1a1a;font-size:13px}h1{font-size:20px;border-bottom:2px solid #2563eb;padding-bottom:8px;color:#1e3a5f}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#374151}@media print{@page{margin:1.5cm}}</style>
</head><body><h1>Struktura zadań: ${title}</h1>
<table><thead><tr><th>Nazwa</th><th>Typ</th><th>Status</th><th>Właściciel</th></tr></thead><tbody>
${renderNodes(wbsTree?.items || [])}
</tbody></table></body></html>`;
        const w = window.open('', '_blank', 'width=900,height=700');
        w.document.write(html); w.document.close(); w.onload = () => w.print();
    };

    const handleExportAllPDF = async () => {
        const title = nodeName || reqData?.name || 'Projekt';
        const md = wbsDescription || '';

        // Pobierz wymagania materiałowe
        let matReqs = [];
        try {
            const token = localStorage.getItem('token');
            // Pobierz domyślną listę
            const listsRes = await fetch(`${API_URL}/material-requirements/lists/node/${nodeId}`, { headers: { Authorization: `Bearer ${token}` } });
            const lists = listsRes.ok ? await listsRes.json() : [];
            const listId = lists[0]?.id || '';
            const matUrl = `${API_URL}/material-requirements/node/${nodeId}?${listId ? `listId=${listId}&` : ''}${versionId ? `versionId=${versionId}` : ''}`;
            const matRes = await fetch(matUrl, { headers: { Authorization: `Bearer ${token}` } });
            matReqs = matRes.ok ? await matRes.json() : [];
        } catch (_) { /* brak materiałów — eksportuj bez */ }

        const toHtml = (text) => {
            const lines = text.split('\n');
            const out = [];
            let inList = false, listType = null;
            for (const raw of lines) {
                const line = raw;
                if (/^## (.+)/.test(line)) { if (inList) { out.push(`</${listType}>`); inList = false; } out.push(`<h3>${line.replace(/^## /, '')}</h3>`); }
                else if (/^# (.+)/.test(line)) { if (inList) { out.push(`</${listType}>`); inList = false; } out.push(`<h2>${line.replace(/^# /, '')}</h2>`); }
                else if (/^> (.+)/.test(line)) { if (inList) { out.push(`</${listType}>`); inList = false; } out.push(`<blockquote>${line.replace(/^> /, '')}</blockquote>`); }
                else if (/^\d+\. (.+)/.test(line)) { if (!inList || listType !== 'ol') { if (inList) out.push(`</${listType}>`); out.push('<ol>'); inList = true; listType = 'ol'; } out.push(`<li>${line.replace(/^\d+\. /, '')}</li>`); }
                else if (/^- (.+)/.test(line)) { if (!inList || listType !== 'ul') { if (inList) out.push(`</${listType}>`); out.push('<ul>'); inList = true; listType = 'ul'; } out.push(`<li>${line.replace(/^- /, '')}</li>`); }
                else { if (inList) { out.push(`</${listType}>`); inList = false; } const p = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>'); out.push(line.trim() === '' ? '<br>' : `<p>${p}</p>`); }
            }
            if (inList) out.push(`</${listType}>`);
            return out.join('\n');
        };
        const renderNodes = (nodes, depth = 0) => nodes.map(n => {
            const indent = '&nbsp;'.repeat(depth * 4);
            const children = (n.children || []).length > 0 ? renderNodes(n.children, depth + 1) : '';
            return `<tr><td style="padding:3px 8px;border-bottom:1px solid #e5e7eb">${indent}${depth === 0 ? `<strong>${n.name || '—'}</strong>` : (n.name || '—')}</td><td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${n.type || '—'}</td><td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${n.status || '—'}</td><td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${n.owner || '—'}</td></tr>${children}`;
        }).join('');
        const planRows = subtasks.map(s => `<tr>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb">${s.name || '—'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.category || '—'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.startDate ? new Date(s.startDate).toLocaleDateString('pl-PL') : '—'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.endDate ? new Date(s.endDate).toLocaleDateString('pl-PL') : '—'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.assignedTo || '—'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.status || '—'}</td>
        </tr>`).join('');
        const matRows = matReqs.map(r => {
            const mat = r.material;
            const prodName = mat?.productName || r.productName || '—';
            const mfr = mat?.manufacturer || r.manufacturer || '—';
            const mdl = mat?.model || r.model || '—';
            return `<tr>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb"><strong>${r.name || '—'}</strong></td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb">${prodName}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${mfr}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${mdl}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${r.quantity} ${r.unit}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${r.type || '—'}</td>
            <td style="padding:3px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${r.status || '—'}</td>
        </tr>`;
        }).join('');
        const matSection = matReqs.length > 0 ? `<div class="section"><h2>Wymagania materiałowe</h2><table><thead><tr><th>Nazwa wymagania</th><th>Nazwa handlowa</th><th>Producent</th><th>Model</th><th>Ilość</th><th>Typ</th><th>Status</th></tr></thead><tbody>${matRows}</tbody></table></div>` : '';
        const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8">
<title>Planowanie – ${title}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:960px;margin:40px auto;color:#1a1a1a;font-size:13px;line-height:1.6}
  h1{font-size:22px;color:#1e3a5f;border-bottom:3px solid #2563eb;padding-bottom:10px;margin-top:0}
  h2{font-size:16px;color:#1e3a5f;border-bottom:2px solid #93c5fd;padding-bottom:6px;margin-top:32px;page-break-after:avoid}
  h3{font-size:14px;color:#374151;margin-top:16px}
  blockquote{border-left:4px solid #93c5fd;margin:12px 0;padding:4px 16px;color:#374151;background:#eff6ff}
  ul,ol{padding-left:24px}li{margin:3px 0}
  p{margin:5px 0}strong{color:#111}em{color:#374151}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th{background:#f3f4f6;padding:5px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#374151;border-bottom:2px solid #d1d5db}
  .section{page-break-inside:avoid}
  @media print{@page{margin:1.5cm}body{margin:0}}
</style></head><body>
<h1>Planowanie: ${title}</h1>
<div class="section">
<h2>Strategia realizacji</h2>
${toHtml(md)}
</div>
<div class="section">
<h2>Struktura zadań (WBS)</h2>
<table><thead><tr><th>Nazwa</th><th>Typ</th><th>Status</th><th>Właściciel</th></tr></thead><tbody>
${renderNodes(wbsTree?.items || [])}
</tbody></table>
</div>
<div class="section">
<h2>Plan i harmonogram zadań</h2>
<table><thead><tr><th>Zadanie</th><th>Kategoria</th><th>Start</th><th>Koniec</th><th>Odpowiedzialny</th><th>Status</th></tr></thead><tbody>
${planRows}
</tbody></table>
</div>
${matSection}
</body></html>`;
        const w = window.open('', '_blank', 'width=1000,height=800');
        w.document.write(html); w.document.close(); w.onload = () => w.print();
    };

    const handleExportPlanPDF = () => {
        const title = nodeName || reqData?.name || 'Projekt';
        const rows = subtasks.map(s => `<tr>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${s.name || '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.category || '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.startDate ? new Date(s.startDate).toLocaleDateString('pl-PL') : '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.endDate ? new Date(s.endDate).toLocaleDateString('pl-PL') : '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.assignedTo || '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.status || '—'}</td>
        </tr>`).join('');
        const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Harmonogram – ${title}</title>
<style>body{font-family:Arial,sans-serif;max-width:1000px;margin:40px auto;color:#1a1a1a;font-size:13px}h1{font-size:20px;border-bottom:2px solid #7c3aed;padding-bottom:8px;color:#1e3a5f}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#374151}@media print{@page{margin:1.5cm}}</style>
</head><body><h1>Plan i harmonogram: ${title}</h1>
<table><thead><tr><th>Zadanie</th><th>Kategoria</th><th>Start</th><th>Koniec</th><th>Odpowiedzialny</th><th>Status</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>`;
        const w = window.open('', '_blank', 'width=1000,height=700');
        w.document.write(html); w.document.close(); w.onload = () => w.print();
    };

    const syncNodeToBudget = async () => {
        // Legacy callback po dodaniu top-level node; odświeżamy tylko dane Unified.
        handleWbsRefresh();
    };

    const handleDrop = (e, date) => {
        e.preventDefault();
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            
            // Build local YYYY-MM-DD string to avoid timezone shifts
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}T12:00:00`; 

            setSubtasks(prev => {
                let next;
                if (data.isMove && data.id) {
                    // MOVE: Treat as independent 1-day unit (allowing gaps)
                    const endStr = `${y}-${m}-${d}T23:59:59`;
                    next = prev.map(s => String(s.id) === String(data.id) ? { 
                        ...s, 
                        plannedStart: dateStr, 
                        plannedEnd: endStr 
                    } : s);
                    
                    latestSubtasksRef.current = next;
                    handleSaveWBS(next, null, true);
                } else {
                    // CREATE: New segment for this project item
                    const logistykId = logistykUsers[0]?.id || null;
                    const newTask = {
                        id: `temp_${Date.now()}`,
                        requirementItemId: data.id,
                        name: data.name,
                        category: data.catLabel,
                        phase: 'INSTAL',
                        status: 'NEW',
                        plannedStart: dateStr,
                        plannedEnd: dateStr,
                        isAiGenerated: false,
                        isApproved: true,
                    };
                    next = [...prev, newTask];
                    latestSubtasksRef.current = next;

                    // Auto-dodaj węzły logistyczne do WBS tree zamiast kalendarza
                    if (data.catKey === 'instalacyjne') {
                        const currentTree = latestWbsTreeRef.current;
                        const items = Array.isArray(currentTree?.items) ? currentTree.items : [];
                        const parentNode = {
                            id: crypto.randomUUID(),
                            name: data.name,
                            status: 'Not Started',
                            owner: '',
                            resources: '',
                            cost: '',
                            children: [
                                { id: crypto.randomUUID(), name: 'Wycena materiałów', status: 'Not Started', owner: '', resources: '', cost: '', children: [] },
                                { id: crypto.randomUUID(), name: 'Zamówienie materiałów', status: 'Not Started', owner: '', resources: '', cost: '', children: [] },
                            ],
                        };
                        const newTree = { ...currentTree, items: [...items, parentNode] };
                        setWbsTree(newTree);
                        latestWbsTreeRef.current = newTree;
                        handleSaveWBS(next, null, false);
                    } else {
                        handleSaveWBS(next);
                    }
                }
                return next;
            });
        } catch (err) {
            console.error('Drop error:', err);
        }
    };

    const removeTask = (requirementItemId, phaseId, subtaskId = null) => {
        setSubtasks(prev => {
            const next = prev.filter(s => {
                // Resilient comparison (handling potential string/number mismatch)
                if (subtaskId && String(s.id) === String(subtaskId)) return false;
                if (!subtaskId && s.requirementItemId === requirementItemId && s.phase === phaseId) return false;
                return true;
            });
            // Critical: Update ref synchronously before async save
            latestSubtasksRef.current = next;
            handleSaveWBS(next, null, true); 
            return next;
        });
    };
    const handleSaveWBS = async (overrideSubtasks = null, overrideWbsDesc = null, immediate = false, overrideItems = null) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        
        const performSave = async () => {
            if (isSavingRef.current) {
                saveTimeoutRef.current = setTimeout(performSave, 250);
                return;
            }
            
            isSavingRef.current = true;
            setSaving(true);
            try {
                const token = sessionStorage.getItem('token');
                const currentTasks = Array.isArray(overrideSubtasks) ? overrideSubtasks : latestSubtasksRef.current;
                const currentDesc = overrideWbsDesc !== null ? overrideWbsDesc : latestWbsDescRef.current;
                const currentItems = overrideItems !== null ? overrideItems : latestItemsRef.current;
                const currentWbsTree = latestWbsTreeRef.current;

                // 1. Sync Base Data
                await fetch(`${API_URL}/order-requirements`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nodeId,
                        versionId,
                        projectItems: JSON.stringify(currentItems),
                        wbsDescription: currentDesc,
                        wbsTree: JSON.stringify(currentWbsTree)
                    })
                });

                // 2. Sync Schedule
                const res = await fetch(`${API_URL}/subtasks/batch/${nodeId}?versionId=${versionId || ''}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentTasks.map(s => ({ 
                        ...s, 
                        id: (typeof s.id === 'string' && s.id.startsWith('temp_')) ? null : s.id,
                        isApproved: true
                    })))
                });

                if (res.ok) {
                    setSaved(true);
                    const savedTasks = await res.json();
                    setSubtasks(savedTasks || []);
                    latestSubtasksRef.current = savedTasks || [];
                    onWbsUpdate?.();
                    setTimeout(() => setSaved(false), 2000);
                }
            } catch (err) {
                console.error('WBS Persistence Error:', err);
            } finally {
                isSavingRef.current = false;
                setSaving(false);
            }
        };

        if (immediate) performSave();
        else saveTimeoutRef.current = setTimeout(performSave, 400);
    };

    const assignedUsers = useMemo(() => {
        if (!projectUsers.length) return [];
        // public lub brak visibility → wszyscy
        if (!nodeVisibility || nodeVisibility === 'public') return projectUsers;
        // custom: pokaż użytkowników z uprawnieniami zespołowymi + właściciela
        if (nodeVisibility === 'custom') {
            if (!nodeTeamIds.length) return projectUsers;
            return projectUsers.filter(u =>
                u.id === nodeOwnerId ||
                u.teams?.some(t => nodeTeamIds.includes(t.id))
            );
        }
        // team / private: użytkownicy z tego samego zespołu co właściciel
        if (!nodeOwnerId) return projectUsers;
        const owner = projectUsers.find(u => u.id === nodeOwnerId);
        if (!owner?.teams?.length) return projectUsers;
        const ownerTeamIds = new Set(owner.teams.map(t => t.id));
        return projectUsers.filter(u => u.teams?.some(t => ownerTeamIds.has(t.id)));
    }, [projectUsers, nodeOwnerId, nodeVisibility, nodeTeamIds]);

    if (loading) return <div className="p-20 flex justify-center"><div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" /></div>;

    const visibleTypes = workerView
        ? workerRoles.includes('LOGISTYK')
            ? ['ALL', 'LOGISTYK_ONLY', 'MANAGER_LOGISTYK']
            : ['ALL']
        : null;

    const displayedSubtasks = subtasks
        .filter(s => !filterUserId || s.assignedUserId === filterUserId)
        .filter(s => !visibleTypes || visibleTypes.includes(s.visibilityType || 'ALL'));

    // Worker view: tylko kalendarz z własnymi zadaniami
    if (workerView) {
        return (
            <div className="flex flex-col gap-4 animate-fade-in pb-16">
                <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Moje zadania</span>
                    <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] rounded-full font-mono">{displayedSubtasks.length}</span>
                </div>
                <div className="h-[700px]">
                    <CalendarView
                        subtasks={displayedSubtasks}
                        categories={CATEGORIES}
                        onDrop={() => {}}
                        onDateClick={() => {}}
                        onTaskClick={(task) => {
                            if (onNavigateToMaterials) {
                                onNavigateToMaterials(task.nodeId || null);
                            } else {
                                setSelectedTask(task);
                                setIsModalOpen(true);
                            }
                        }}
                        onRemoveTask={() => {}}
                        onUpdateTask={() => {}}
                    />
                </div>
                {isModalOpen && (
                    <SubtaskModal
                        nodeId={nodeId}
                        versionId={versionId}
                        subtask={selectedTask}
                        onClose={() => setIsModalOpen(false)}
                        onSuccess={() => { setIsModalOpen(false); fetchData(); }}
                    />
                )}
            </div>
        );
    }

    const toggleSection = (key, setShow) => {
        if (expandedSection === key) {
            setExpandedSection(null);
            setShow(false);
        } else {
            setExpandedSection(key);
            setShow(true);
        }
    };

    return (
        <div className={`flex flex-col animate-fade-in ${expandedSection ? 'gap-0' : 'gap-6 pb-32'}`}>
            {!expandedSection && (
                <div className="flex justify-end">
                    <div role="button" tabIndex={0} onClick={handleExportAllPDF} onKeyDown={e => e.key === 'Enter' && handleExportAllPDF()} className="flex items-center gap-1.5 px-4 py-1.5 bg-red-700/60 hover:bg-red-600/80 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer">
                        <FileDown size={13} />
                        <span>Eksport całości PDF</span>
                    </div>
                </div>
            )}



            <section className={`glass-panel rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col overflow-hidden ${expandedSection === 'wbs' ? 'h-[calc(100vh-160px)]' : ''} ${expandedSection !== null && expandedSection !== 'wbs' ? 'hidden' : ''}`}>
                <button
                    className={`w-full flex items-center gap-2 p-5 transition-colors text-left flex-shrink-0 border-b border-white/10 bg-white/[0.04] ${expandedSection === 'wbs' ? 'bg-white/[0.07]' : 'hover:bg-white/[0.06]'}`}
                    onClick={() => toggleSection('wbs', setShowWBSTable)}
                >
                    <LayoutList size={16} className="text-blue-400 flex-shrink-0" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-300 flex-1">Struktura zadań projektu</h3>
                    <span className="text-[10px] text-gray-600 font-mono mr-2">
                        {(wbsTree?.items || []).length} elementów
                    </span>
                    <div className="flex items-center gap-2 mr-3 flex-shrink-0">
                        {expandedSection === 'wbs' && (<>
                            <div role="button" tabIndex={0} onClick={e => { e.stopPropagation(); handleExportWbsPDF(); }} onKeyDown={e => e.key === 'Enter' && handleExportWbsPDF()} className="flex items-center gap-1.5 px-3 py-1 bg-red-700/60 hover:bg-red-600/80 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer">
                                <FileDown size={12} /><span>PDF</span>
                            </div>
                            <div role="button" tabIndex={0} onClick={e => { e.stopPropagation(); handleSaveWBS(); }} onKeyDown={e => e.key === 'Enter' && handleSaveWBS()} aria-disabled={saving} className={`flex items-center gap-1.5 px-3 py-1 bg-blue-600/80 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition-colors flex-shrink-0 cursor-pointer ${saving ? 'opacity-50 pointer-events-none' : ''}`}>
                                {saving ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <CheckCircle size={12} /> : <Save size={12} />}
                                <span>{saved ? 'Zapisano' : 'Zapisz'}</span>
                            </div>
                        </>)}
                        {isManager && (
                            <div role="button" tabIndex={0}
                                onClick={e => { e.stopPropagation(); handleWbsExtract(); }}
                                onKeyDown={e => e.key === 'Enter' && handleWbsExtract()}
                                className={`flex items-center gap-1.5 px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${extractingForWbs ? 'opacity-50 pointer-events-none' : ''}`}>
                                {extractingForWbs ? <div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> : <Sparkles size={12} />}
                                <span>Wyciągnij z dokumentów</span>
                            </div>
                        )}
                    </div>
                    <ChevronRight size={14} className={`text-gray-500 transition-transform flex-shrink-0 ${showWBSTable ? 'rotate-90' : ''}`} />
                </button>
                {showWBSTable && (
                    <div className={`pb-5 ${expandedSection === 'wbs' ? 'flex-1 overflow-y-auto' : 'px-5'}`}>
                        <WBSHybridTable
                            wbsTree={wbsTree}
                            setWbsTree={setWbsTree}
                            nodeName={nodeName || reqData?.name || reqData?.projectGoal?.slice(0, 60) || 'Projekt'}
                            processNodeId={nodeId}
                            onSave={() => handleSaveWBS()}
                            onTopLevelAdded={syncNodeToBudget}
                            users={assignedUsers}
                            onNodesDeleted={handleWbsNodesDeleted}
                            onMaterialNodeCreated={handleMaterialNodeCreated}
                            onRequirementDrop={isManager ? handleRequirementAssignToWbs : null}
                            isManager={isManager}
                        />
                        {isManager && unassignedRequirements.length > 0 && (
                            <div className="px-5 py-3 border-t border-white/5">
                                <p className="text-[10px] uppercase tracking-widest text-amber-500/70 font-bold mb-2 flex items-center gap-1.5">
                                    <Package size={10} />
                                    Koszyk - nieprzypisane ({unassignedRequirements.length})
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {unassignedRequirements.map(req => (
                                        <div
                                            key={req.id}
                                            draggable
                                            onDragStart={e => {
                                                e.dataTransfer.setData('application/requirement-id', req.id);
                                                e.dataTransfer.effectAllowed = 'copy';
                                            }}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs cursor-grab select-none hover:bg-emerald-500/20 transition-all"
                                        >
                                            <GripVertical size={10} className="text-emerald-500/60" />
                                            <span>{req.name || req.productName || '-'}</span>
                                            {req.quantity && <span className="text-[9px] text-emerald-500/70 ml-1">{req.quantity} {req.unit || ''}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </section>

            <section className={`glass-panel rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col overflow-hidden ${expandedSection === 'plan' ? 'h-[calc(100vh-160px)]' : ''} ${expandedSection !== null && expandedSection !== 'plan' ? 'hidden' : ''}`}>
                <button
                    className={`w-full flex items-center gap-2 p-5 transition-colors text-left flex-shrink-0 border-b border-white/10 bg-white/[0.04] ${expandedSection === 'plan' ? 'bg-white/[0.07]' : 'hover:bg-white/[0.06]'}`}
                    onClick={() => toggleSection('plan', setShowPlan)}
                >
                    <Layers size={16} className="text-purple-400 flex-shrink-0" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-300 flex-1">Plan i Harmonogram Zadań</h3>
                    {expandedSection === 'plan' && (
                        <div className="flex items-center gap-2 mr-3 flex-shrink-0">
                            <div role="button" tabIndex={0} onClick={e => { e.stopPropagation(); handleExportPlanPDF(); }} onKeyDown={e => e.key === 'Enter' && handleExportPlanPDF()} className="flex items-center gap-1.5 px-3 py-1 bg-red-700/60 hover:bg-red-600/80 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer">
                                <FileDown size={12} /><span>PDF</span>
                            </div>
                            <div role="button" tabIndex={0} onClick={e => { e.stopPropagation(); handleSaveWBS(); }} onKeyDown={e => e.key === 'Enter' && handleSaveWBS()} aria-disabled={saving} className={`flex items-center gap-1.5 px-3 py-1 bg-blue-600/80 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition-colors flex-shrink-0 cursor-pointer ${saving ? 'opacity-50 pointer-events-none' : ''}`}>
                                {saving ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <CheckCircle size={12} /> : <Save size={12} />}
                                <span>{saved ? 'Zapisano' : 'Zapisz'}</span>
                            </div>
                        </div>
                    )}
                    <ChevronRight size={14} className={`text-gray-500 transition-transform flex-shrink-0 ${showPlan ? 'rotate-90' : ''}`} />
                </button>
                {showPlan && (
                    <div className={`flex gap-6 px-5 pb-5 ${expandedSection === 'plan' ? 'flex-1 overflow-y-auto' : 'h-[800px]'}`}>
                        <div className="flex-1 flex flex-col">
                            <CalendarView
                                subtasks={subtasks}
                                categories={CATEGORIES}
                                onDrop={handleDrop}
                                onDateClick={(date) => {
                                    setSelectedTask({
                                        name: '',
                                        plannedStart: date.toISOString(),
                                        plannedEnd: date.toISOString(),
                                        status: 'NEW'
                                    });
                                    setIsModalOpen(true);
                                }}
                                onTaskClick={(task) => {
                                    setSelectedTask(task);
                                    setIsModalOpen(true);
                                }}
                                onRemoveTask={removeTask}
                                onUpdateTask={(updatedTask) => {
                                    setSubtasks(prev => {
                                        const next = prev.map(s => s.id === updatedTask.id ? updatedTask : s);
                                        setTimeout(() => handleSaveWBS(next), 0);
                                        return next;
                                    });
                                }}
                            />
                        </div>
                    </div>
                )}
            </section>

            {isModalOpen && (
                <SubtaskModal
                    nodeId={nodeId}
                    versionId={versionId}
                    subtask={selectedTask}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => {
                        setIsModalOpen(false);
                        fetchData();
                    }}
                />
            )}

            <section className={`glass-panel rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col overflow-hidden ${expandedSection === 'materials' ? 'h-[calc(100vh-160px)]' : ''} ${expandedSection !== null && expandedSection !== 'materials' ? 'hidden' : ''}`}>
                <button
                    className={`w-full flex items-center gap-2 px-5 py-3 transition-colors text-left flex-shrink-0 border-b border-white/10 bg-white/[0.04] ${expandedSection === 'materials' ? 'bg-white/[0.07]' : 'hover:bg-white/[0.06]'}`}
                    onClick={() => toggleSection('materials', setShowMaterials)}
                >
                    <Zap size={16} className="text-yellow-400 flex-shrink-0" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-300 whitespace-nowrap">Wymagania Materiałowe</h3>
                    <div className="flex-1" />
                    <ChevronRight size={14} className={`text-gray-500 transition-transform flex-shrink-0 ${showMaterials ? 'rotate-90' : ''}`} />
                </button>
                {showMaterials && (
                    <div className={`${expandedSection === 'materials' ? 'flex-1 overflow-y-auto' : ''}`}>
                        <MaterialRequirementsPanel
                            nodeId={nodeId}
                            versionId={versionId}
                            searchQuery={parentSearchQuery}
                            refreshKey={matRefreshKey}
                            externalFilters={{ global: matGlobalFilter, type: matTypeFilter, status: matStatusFilter, setGlobal: setMatGlobalFilter, setType: setMatTypeFilter, setStatus: setMatStatusFilter }}
                            onWbsUpdate={() => {
                                // Przeładuj WBS tree gdy materiały zostaną dodane/usunięte z WBS
                                handleWbsRefresh?.();
                            }}
                        />
                    </div>
                )}
            </section>

        </div>
    );
}
