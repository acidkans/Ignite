import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import { API_URL } from '../../../config';
import { RefreshCw, Search, Plus, CheckCircle2, Trash2 } from 'lucide-react';

const normalizeType = (v) => String(v || '').trim().toLowerCase();
const REQUIREMENT_TYPE_OPTIONS = [
  { value: 'DEVICE', label: 'Urzadzenie' },
  { value: 'MATERIAL', label: 'Material' },
];

const typeValueToLabel = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  const found = REQUIREMENT_TYPE_OPTIONS.find((opt) => opt.value === normalized);
  return found?.label || REQUIREMENT_TYPE_OPTIONS[0].label;
};

const resolveRequirementType = (rawInput, fallback = 'DEVICE') => {
  const raw = String(rawInput || '').trim();
  if (!raw) return fallback;
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  const exact = REQUIREMENT_TYPE_OPTIONS.find(
    (opt) => opt.value === upper || opt.label.toLowerCase() === lower
  );
  if (exact) return exact.value;

  const prefixed = REQUIREMENT_TYPE_OPTIONS.find(
    (opt) => opt.value.toLowerCase().startsWith(lower) || opt.label.toLowerCase().startsWith(lower)
  );
  return prefixed?.value || fallback;
};

const parseJsonSafe = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const buildQuery = (listId, versionId) => {
  const params = new URLSearchParams();
  if (listId) params.set('listId', String(listId));
  if (versionId) params.set('versionId', String(versionId));
  const q = params.toString();
  return q ? `?${q}` : '';
};

export default function MaterialsMatrixPanel({ nodeId, versionId, readOnly = false, onWbsUpdate = null, wbsData = [] }) {
  const token = sessionStorage.getItem('token');
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [loading, setLoading] = useState(false);
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [selectedReqId, setSelectedReqId] = useState(null);

  const [searchingProducts, setSearchingProducts] = useState(false);
  const [showAddProposal, setShowAddProposal] = useState(false);
  const [editingNameById, setEditingNameById] = useState({});
  const [editingQtyById, setEditingQtyById] = useState({});
  const [editingTypeById, setEditingTypeById] = useState({});
  const [manualProposal, setManualProposal] = useState({
    productName: '',
    manufacturer: '',
    model: '',
    sourceUrl: '',
  });

  const wbsRequirements = useMemo(() => {
    const list = Array.isArray(wbsData) ? wbsData : [];
    return list
      .filter((item) => {
        const t = normalizeType(item?.type);
        const bt = String(item?.budgetType || '').trim().toUpperCase();
        return t === 'material' || t === 'equipment' || t === 'device' || bt === 'MATERIAL' || bt === 'DEVICE';
      })
      .map((item) => ({
        id: `wbs:${item.id}`,
        sourceWbsNodeId: item.id,
        isVirtual: true,
        name: item.name || 'Bez nazwy',
        quantity: Number(item.quantity) || 1,
        unit: item.unit || 'szt',
        type: normalizeType(item?.type) === 'material' || String(item?.budgetType || '').toUpperCase() === 'MATERIAL' ? 'MATERIAL' : 'DEVICE',
        status: item.status || 'PENDING',
        proposals: [],
        wbsNodeIds: JSON.stringify([String(item.id)]),
        wbsNodeId: String(item.id),
        wbsNodeAllocations: JSON.stringify({ [String(item.id)]: Number(item.quantity) || 1 }),
      }));
  }, [wbsData]);

  const projectItems = useMemo(() => {
    const list = Array.isArray(wbsData) ? wbsData : [];
    return list.filter((item) => {
      const t = normalizeType(item.type);
      const bt = String(item.budgetType || '').trim().toUpperCase();
      if (t === 'material' || t === 'equipment' || t === 'device') return false;
      if (bt === 'MATERIAL' || bt === 'DEVICE') return false;
      return Number(item.depth) === 1;
    });
  }, [wbsData]);

  const selectedRequirement = useMemo(
    () => requirements.find((r) => r.id === selectedReqId) || null,
    [requirements, selectedReqId]
  );

  const fetchLists = useCallback(async () => {
    const res = await fetch(`${API_URL}/material-requirements/lists/node/${nodeId}`, { headers: authHeaders });
    if (!res.ok) return [];
    const data = await res.json();
    setLists(Array.isArray(data) ? data : []);
    return Array.isArray(data) ? data : [];
  }, [nodeId, authHeaders]);

  const fetchRequirements = useCallback(async (listId) => {
    setLoading(true);
    try {
      const query = buildQuery(listId, versionId);
      const res = await fetch(`${API_URL}/material-requirements/node/${nodeId}${query}`, { headers: authHeaders });
      if (!res.ok) {
        const fallback = wbsRequirements;
        setRequirements(fallback);
        setSelectedReqId((prev) => (prev && fallback.some((r) => r.id === prev) ? prev : fallback[0]?.id || null));
        return;
      }
      const data = await res.json();
      const apiRows = Array.isArray(data) ? data : [];
      const merged = [...apiRows];

      // Jeśli w WBS są materiały bez rekordu API, pokaż je jako wiersze wirtualne.
      for (const wbsReq of wbsRequirements) {
        const wbsId = String(wbsReq.sourceWbsNodeId);
        const exists = apiRows.some((r) => {
          if (String(r?.wbsNodeId || '') === wbsId) return true;
          const ids = parseJsonSafe(r?.wbsNodeIds, []);
          return Array.isArray(ids) && ids.map(String).includes(wbsId);
        });
        if (!exists) merged.push(wbsReq);
      }

      setRequirements(merged);
      setSelectedReqId((prev) => (prev && merged.some((r) => r.id === prev) ? prev : merged[0]?.id || null));
    } finally {
      setLoading(false);
    }
  }, [nodeId, versionId, authHeaders, wbsRequirements]);

  useEffect(() => {
    if (!nodeId) return;
    (async () => {
      const loadedLists = await fetchLists();
      const firstId = loadedLists.find((l) => l?.isDefault)?.id || loadedLists[0]?.id || null;
      setActiveListId(firstId);
      await fetchRequirements(firstId);
    })();
  }, [nodeId, fetchLists, fetchRequirements]);

  const refreshAll = useCallback(async () => {
    await fetchRequirements(activeListId);
    onWbsUpdate?.(activeListId);
  }, [fetchRequirements, activeListId, onWbsUpdate]);

  const addToWbsTree = useCallback(async (parentNodeId, requirementName, requirementType) => {
    if (!parentNodeId || !requirementName) return;
    try {
      const res = await fetch(`${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: authHeaders });
      if (!res.ok) return;
      const data = await res.json();
      const currentNodes = data.items || [];
      const alreadyExists = currentNodes.some(
        (n) => n.parentId === parentNodeId && String(n.name || '').trim().toLowerCase() === requirementName.trim().toLowerCase()
      );
      if (alreadyExists) return;
      const typeMap = { DEVICE: 'equipment', MATERIAL: 'material' };
      const nodeType = typeMap[String(requirementType || '').toUpperCase()] || '';
      await fetch(`${API_URL}/wbs-nodes`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, versionId: versionId || undefined, parentId: parentNodeId, name: requirementName, type: nodeType }),
      });
    } catch {
      // no-op
    }
  }, [nodeId, versionId, authHeaders]);

  const removeFromWbsTree = useCallback(async (parentNodeId, requirementName) => {
    if (!parentNodeId || !requirementName) return;
    try {
      const res = await fetch(`${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: authHeaders });
      if (!res.ok) return;
      const data = await res.json();
      const target = (data.items || []).find(
        (n) => n.parentId === parentNodeId && String(n.name || '').trim().toLowerCase() === requirementName.trim().toLowerCase()
      );
      if (!target) return;
      await fetch(`${API_URL}/wbs-nodes/${target.id}`, { method: 'DELETE', headers: authHeaders });
    } catch {
      // no-op
    }
  }, [nodeId, versionId, authHeaders]);

  const patchRequirement = useCallback(async (reqId, patch) => {
    const res = await fetch(`${API_URL}/material-requirements/${reqId}`, {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await fetchRequirements(activeListId);
      onWbsUpdate?.(activeListId);
    }
  }, [authHeaders, fetchRequirements, activeListId, onWbsUpdate]);

  const ensureRequirementRecord = useCallback(async (req) => {
    if (!req) return null;
    if (!String(req.id || '').startsWith('wbs:')) return req;

    const payload = {
      nodeId,
      versionId: versionId || null,
      listId: activeListId || null,
      name: req.name || 'Bez nazwy',
      type: String(req.type || '').toUpperCase() === 'MATERIAL' ? 'MATERIAL' : 'DEVICE',
      quantity: Number(req.quantity) > 0 ? Number(req.quantity) : 1,
      unit: req.unit || 'szt',
      technicalSpec: '',
      wbsNodeId: req.sourceWbsNodeId || null,
      wbsNodeIds: JSON.stringify(req.sourceWbsNodeId ? [String(req.sourceWbsNodeId)] : []),
      wbsNodeAllocations: req.sourceWbsNodeId ? JSON.stringify({ [String(req.sourceWbsNodeId)]: Number(req.quantity) || 1 }) : null,
    };

    const res = await fetch(`${API_URL}/material-requirements`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return null;
    const created = await res.json();
    setSelectedReqId(created?.id || null);
    await fetchRequirements(activeListId);
    onWbsUpdate?.(activeListId);
    return created;
  }, [nodeId, versionId, activeListId, authHeaders, fetchRequirements, onWbsUpdate]);

  const updateAllocation = useCallback(async (req, projectItemId, nextRaw) => {
    const ensuredReq = await ensureRequirementRecord(req);
    const targetReq = ensuredReq || req;
    if (!targetReq || String(targetReq.id || '').startsWith('wbs:')) return;

    const nextValue = Number(nextRaw) || 0;
    const prevAlloc = parseJsonSafe(targetReq.wbsNodeAllocations, {});
    const nextAlloc = { ...prevAlloc };
    if (nextValue <= 0) delete nextAlloc[projectItemId];
    else nextAlloc[projectItemId] = nextValue;

    const prevIds = new Set(Object.keys(prevAlloc));
    const nextIds = Object.keys(nextAlloc);

    await patchRequirement(targetReq.id, {
      wbsNodeIds: JSON.stringify(nextIds),
      wbsNodeId: nextIds[0] || null,
      wbsNodeAllocations: nextIds.length ? JSON.stringify(nextAlloc) : null,
      isAiAssigned: false,
    });

    for (const id of nextIds) {
      if (!prevIds.has(id)) {
        await addToWbsTree(id, targetReq.productName || targetReq.name, targetReq.type);
      }
    }
    for (const id of prevIds) {
      if (!nextIds.includes(id)) {
        await removeFromWbsTree(id, targetReq.productName || targetReq.name);
      }
    }
  }, [ensureRequirementRecord, patchRequirement, addToWbsTree, removeFromWbsTree]);

  const handleSearchProducts = useCallback(async () => {
    if (!selectedRequirement) return;
    const ensuredReq = await ensureRequirementRecord(selectedRequirement);
    const targetReq = ensuredReq || selectedRequirement;
    if (!targetReq || String(targetReq.id || '').startsWith('wbs:')) return;

    setSearchingProducts(true);
    try {
      await fetch(`${API_URL}/material-requirements/${targetReq.id}/search-products`, {
        method: 'POST',
        headers: authHeaders,
      });
      await refreshAll();
    } finally {
      setSearchingProducts(false);
    }
  }, [selectedRequirement, ensureRequirementRecord, authHeaders, refreshAll]);

  const handleAddManualProposal = useCallback(async () => {
    if (!selectedRequirement) return;
    if (!manualProposal.productName || !manualProposal.manufacturer) return;
    const ensuredReq = await ensureRequirementRecord(selectedRequirement);
    const targetReq = ensuredReq || selectedRequirement;
    if (!targetReq || String(targetReq.id || '').startsWith('wbs:')) return;

    const res = await fetch(`${API_URL}/material-requirements/${targetReq.id}/proposals`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(manualProposal),
    });
    if (res.ok) {
      setShowAddProposal(false);
      setManualProposal({ productName: '', manufacturer: '', model: '', sourceUrl: '' });
      await refreshAll();
    }
  }, [selectedRequirement, manualProposal, ensureRequirementRecord, authHeaders, refreshAll]);

  const handleSelectProposal = useCallback(async (proposalId) => {
    await fetch(`${API_URL}/material-requirements/proposals/${proposalId}/select`, {
      method: 'PATCH',
      headers: authHeaders,
    });
    await refreshAll();
  }, [authHeaders, refreshAll]);

  const handleDeleteProposal = useCallback(async (proposalId) => {
    await fetch(`${API_URL}/material-requirements/proposals/${proposalId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    await refreshAll();
  }, [authHeaders, refreshAll]);

  const updateRequirementFields = useCallback(async (req, patch) => {
    const ensuredReq = await ensureRequirementRecord(req);
    const targetReq = ensuredReq || req;
    if (!targetReq || String(targetReq.id || '').startsWith('wbs:')) return;
    await patchRequirement(targetReq.id, patch);
  }, [ensureRequirementRecord, patchRequirement]);

  const commitNameEdit = useCallback(async (req) => {
    const value = (editingNameById[req.id] ?? req.name ?? '').trim();
    setEditingNameById((prev) => ({ ...prev, [req.id]: value }));
    if (!value || value === (req.name || '')) return;
    await updateRequirementFields(req, { name: value });
  }, [editingNameById, updateRequirementFields]);

  const commitQtyEdit = useCallback(async (req) => {
    const raw = editingQtyById[req.id] ?? req.quantity;
    const nextQty = Number(raw);
    if (!Number.isFinite(nextQty) || nextQty <= 0) return;
    if (Number(req.quantity) === nextQty) return;
    await updateRequirementFields(req, { quantity: nextQty });
  }, [editingQtyById, updateRequirementFields]);

  const commitTypeEdit = useCallback(async (req) => {
    const inputValue = editingTypeById[req.id] ?? typeValueToLabel(req.type);
    const currentType = String(req.type || 'DEVICE').toUpperCase();
    const nextType = resolveRequirementType(inputValue, currentType);
    setEditingTypeById((prev) => ({ ...prev, [req.id]: typeValueToLabel(nextType) }));
    if (nextType === currentType) return;
    await updateRequirementFields(req, { type: nextType });
  }, [editingTypeById, updateRequirementFields]);

  const columns = useMemo(() => {
    const base = [
      {
        id: 'req',
        header: 'Wymaganie',
        cell: ({ row }) => {
          const req = row.original;
          const value = editingNameById[req.id] ?? req.name ?? '';
          return (
            <input
              value={value}
              disabled={readOnly}
              onFocus={() => setSelectedReqId(req.id)}
              onChange={(e) => setEditingNameById((prev) => ({ ...prev, [req.id]: e.target.value }))}
              onBlur={() => commitNameEdit(req)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className={`w-full bg-transparent border border-transparent hover:border-white/10 focus:border-blue-500/40 rounded px-2 py-1 text-sm ${selectedReqId === req.id ? 'bg-blue-500/20 text-blue-200' : 'text-gray-200'} disabled:opacity-60`}
            />
          );
        },
      },
      {
        id: 'qty',
        header: 'Ilość',
        cell: ({ row }) => {
          const req = row.original;
          const value = editingQtyById[req.id] ?? req.quantity ?? 1;
          return (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={value}
                disabled={readOnly}
                onFocus={() => setSelectedReqId(req.id)}
                onChange={(e) => setEditingQtyById((prev) => ({ ...prev, [req.id]: e.target.value }))}
                onBlur={() => commitQtyEdit(req)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                className="w-20 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 disabled:opacity-50"
              />
              <span className="text-xs text-gray-400">{req.unit || 'szt'}</span>
            </div>
          );
        },
      },
      {
        id: 'type',
        header: 'Typ',
        cell: ({ row }) => {
          const req = row.original;
          const inputValue = editingTypeById[req.id] ?? typeValueToLabel(req.type);
          return (
            <>
            <input
              list={`req-type-options-${req.id}`}
              value={inputValue}
              disabled={readOnly}
              onFocus={() => setSelectedReqId(req.id)}
              onChange={(e) => {
                setEditingTypeById((prev) => ({ ...prev, [req.id]: e.target.value }));
              }}
              onBlur={() => commitTypeEdit(req)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 disabled:opacity-50"
            />
            <datalist id={`req-type-options-${req.id}`}>
              {REQUIREMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.label} />
              ))}
            </datalist>
            </>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => row.original.status || 'PENDING',
      },
      {
        id: 'products',
        header: 'Produkty',
        cell: ({ row }) => (row.original.proposals || []).length,
      },
    ];

    const dynamic = projectItems.map((item) => ({
      id: `alloc-${item.id}`,
      header: item.name,
      cell: ({ row }) => {
        const req = row.original;
        const alloc = parseJsonSafe(req.wbsNodeAllocations, {});
        const value = alloc[item.id] ?? '';
        return (
          <input
            type="number"
            min={0}
            value={value}
            disabled={readOnly}
            onChange={(e) => updateAllocation(req, item.id, e.target.value)}
            className="w-20 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 disabled:opacity-50"
          />
        );
      },
    }));

    return [...base, ...dynamic];
  }, [projectItems, readOnly, updateAllocation, selectedReqId, editingNameById, editingQtyById, editingTypeById, commitNameEdit, commitQtyEdit, commitTypeEdit]);

  const table = useReactTable({
    data: requirements,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={activeListId || ''}
            onChange={(e) => {
              const next = e.target.value || null;
              setActiveListId(next);
              fetchRequirements(next);
            }}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-gray-200"
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>{list.name || `Lista ${list.id}`}</option>
            ))}
          </select>
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-white/15 text-gray-300 hover:bg-white/5"
          >
            <RefreshCw size={12} /> Odśwież
          </button>
        </div>
        <div className="text-xs text-gray-400">
          Wymagania: {requirements.length} | Przedmioty projektu: {projectItems.length}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 overflow-auto bg-black/20">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-white/5 border-b border-white/10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-2 py-2 text-left text-xs text-gray-300 font-semibold whitespace-nowrap">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr><td className="px-3 py-4 text-xs text-gray-400" colSpan={columns.length}>Ładowanie...</td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr><td className="px-3 py-4 text-xs text-gray-400" colSpan={columns.length}>Brak wymagań materiałowych.</td></tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={selectedReqId === row.original.id ? 'bg-blue-500/5' : ''}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1.5 text-gray-200 whitespace-nowrap align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-200">Przypisanie produktów do wymagania</h3>
          {selectedRequirement && (
            <span className="text-xs text-blue-300">{selectedRequirement.name}</span>
          )}
        </div>

        {!selectedRequirement ? (
          <p className="text-xs text-gray-400">Wybierz wymaganie z tabeli, aby zarządzać propozycjami produktów.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={handleSearchProducts}
                disabled={readOnly || searchingProducts}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 disabled:opacity-50"
              >
                <Search size={12} /> {searchingProducts ? 'Szukam...' : 'Szukaj propozycji'}
              </button>
              <button
                onClick={() => setShowAddProposal((v) => !v)}
                disabled={readOnly}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-white/20 text-gray-200 hover:bg-white/5 disabled:opacity-50"
              >
                <Plus size={12} /> Dodaj ręcznie
              </button>
            </div>

            {showAddProposal && !readOnly && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                <input value={manualProposal.productName} onChange={(e) => setManualProposal((p) => ({ ...p, productName: e.target.value }))} placeholder="Nazwa produktu" className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
                <input value={manualProposal.manufacturer} onChange={(e) => setManualProposal((p) => ({ ...p, manufacturer: e.target.value }))} placeholder="Producent" className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
                <input value={manualProposal.model} onChange={(e) => setManualProposal((p) => ({ ...p, model: e.target.value }))} placeholder="Model" className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
                <input value={manualProposal.sourceUrl} onChange={(e) => setManualProposal((p) => ({ ...p, sourceUrl: e.target.value }))} placeholder="URL źródła" className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
                <div className="md:col-span-2">
                  <button onClick={handleAddManualProposal} className="px-3 py-1.5 text-xs rounded bg-green-500/15 border border-green-500/30 text-green-300 hover:bg-green-500/25">Zapisz propozycję</button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(selectedRequirement.proposals || []).length === 0 ? (
                <p className="text-xs text-gray-400">Brak propozycji dla wybranego wymagania.</p>
              ) : (
                (selectedRequirement.proposals || []).map((p) => (
                  <div key={p.id} className={`rounded border px-3 py-2 ${p.isSelected ? 'border-green-500/40 bg-green-500/10' : 'border-white/10 bg-white/[0.02]'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm text-gray-100">{p.manufacturer} {p.model || p.productName}</p>
                        <p className="text-xs text-gray-400">{p.sourceUrl || p.productUrl || 'Brak linku'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button disabled={readOnly} onClick={() => handleSelectProposal(p.id)} className="p-1.5 rounded border border-green-500/30 text-green-300 hover:bg-green-500/15 disabled:opacity-50" title="Wybierz">
                          <CheckCircle2 size={13} />
                        </button>
                        <button disabled={readOnly} onClick={() => handleDeleteProposal(p.id)} className="p-1.5 rounded border border-red-500/30 text-red-300 hover:bg-red-500/15 disabled:opacity-50" title="Usuń">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
