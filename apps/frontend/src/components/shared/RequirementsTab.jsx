import { useState, useEffect, useCallback } from 'react';
import { Clock, Calendar, Target, Package, AlertTriangle, CheckCircle2, Plus, Trash2, GripVertical, Wrench, ClipboardList, ShieldCheck, User, Users, Mail, Phone, PhoneCall, FileDown, UserPlus } from 'lucide-react';
import { API_URL } from '../../config';
import { exportProjectPdf } from '../../utils/projectPdfExport';
import { exportRequirementsPdf } from '../../utils/requirementsPdfExport';
import MarkdownEditor from './MarkdownEditor';

function countWorkingDays(startStr, endStr) {
    if (!startStr || !endStr) return null;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (end < start) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

function useCountdown(deadlineStr) {
    const [countdown, setCountdown] = useState(null);
    useEffect(() => {
        if (!deadlineStr) { setCountdown(null); return; }
        const update = () => {
            const diff = new Date(deadlineStr) - new Date();
            if (diff <= 0) { setCountdown({ expired: true }); return; }
            setCountdown({
                days: Math.floor(diff / 86400000),
                hours: Math.floor((diff % 86400000) / 3600000),
                minutes: Math.floor((diff % 3600000) / 60000),
                expired: false,
            });
        };
        update();
        const timer = setInterval(update, 30000);
        return () => clearInterval(timer);
    }, [deadlineStr]);
    return countdown;
}

const CATEGORIES = [
    { key: 'terminowe', label: 'Terminowe', icon: Clock, iconColor: 'text-orange-400' },
    { key: 'instalacyjne', label: 'Instalacyjne', icon: Wrench, iconColor: 'text-blue-400' },
    { key: 'organizacyjne', label: 'Organizacyjne', icon: ClipboardList, iconColor: 'text-purple-400' },
    { key: 'jakosciowe', label: 'Jakościowe', icon: ShieldCheck, iconColor: 'text-green-400' },
    { key: 'techniczne', label: 'Techniczne', icon: Wrench, iconColor: 'text-cyan-400' },
    { key: 'finansowe', label: 'Finansowe', icon: Package, iconColor: 'text-yellow-400' },
    { key: 'sla', label: 'SLA', icon: ShieldCheck, iconColor: 'text-indigo-400' },
    { key: 'gwarancyjne', label: 'Gwarancyjne', icon: ShieldCheck, iconColor: 'text-rose-400' },
];

function newItem() {
    return { id: crypto.randomUUID(), name: '', description: '' };
}

function parseItems(raw) {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.length ? { terminowe: parsed } : {};
        }
        if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* ignore */ }
    return {};
}

export default function RequirementsTab({ nodeId, versionId, orderName = '' }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const [form, setForm] = useState({
        offerDeadlineDate: '',
        offerDeadlineTime: '',
        projectStart: '',
        projectEnd: '',
        projectGoal: '',
        pmName: '',
        pmCompany: '',
        clientProjectManagerPhone: '',
        clientProjectManagerEmail: '',
        clientContacts: [],
        offerStatus: '',
        offerStatusComment: '',
    });

    // Przedmioty wg kategorii
    const [items, setItems] = useState({});
    const [expandedCat, setExpandedCat] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const defaultLayout = {
        deadline: { x: 0, y: 0, w: 6, h: 4 },
        schedule: { x: 6, y: 0, w: 6, h: 4 },
        goal: { x: 0, y: 4, w: 12, h: 4 },
        contacts: { x: 0, y: 8, w: 12, h: 10 }
    };

    const [panelLayout, setPanelLayout] = useState(() => {
        try {
            const saved = localStorage.getItem('erp_requirements_grid_layout');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Migracja: jeśli goal lub contacts mają szerokość < 12, ustaw je na 12 (żądanie użytkownika)
                if (parsed.goal && parsed.goal.w < 12) {
                    parsed.goal.w = 12;
                    parsed.goal.x = 0;
                }
                if (parsed.contacts && parsed.contacts.w < 12) {
                    parsed.contacts.w = 12;
                    parsed.contacts.x = 0;
                }
                return parsed;
            }
        } catch { }
        return defaultLayout;
    });

    const [draggedPanel, setDraggedPanel] = useState(null);
    const [resizingPanel, setResizingPanel] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }); // Offset in pixels inside tile
    const [lastGridPos, setLastGridPos] = useState({ x: -1, y: -1 });

    const [allUsers, setAllUsers] = useState([]);
    const [contactSuggest, setContactSuggest] = useState({}); // { contactId: { query, results, open } }

    const GRID_COLS = 12;
    const ROW_HEIGHT = 40; // piksele per grid unit

    const resolveCollisions = (layout, movedId, newItem) => {
        let next = { ...layout, [movedId]: newItem };
        const ids = Object.keys(next);

        let changed = true;
        let attempts = 0;
        while (changed && attempts < 100) {
            changed = false;
            attempts++;
            for (let i = 0; i < ids.length; i++) {
                for (let j = 0; j < ids.length; j++) {
                    if (i === j) continue;
                    const idA = ids[i];
                    const idB = ids[j];
                    const a = next[idA];
                    const b = next[idB];

                    const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
                    const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;

                    if (overlapX && overlapY) {
                        // Przesuwamy tylko B, i tylko jeśli B nie jest elementem movedId
                        if (idB !== movedId && (idA === movedId || a.y < b.y || (a.y === b.y && idA < idB))) {
                            next[idB] = { ...b, y: a.y + a.h };
                            changed = true;
                        }
                    }
                }
            }
        }
        return next;
    };

    const handleMouseDown = (e, id) => {
        if (resizingPanel) return;
        const rect = e.currentTarget.closest('.glass-panel').getBoundingClientRect();
        setDraggedPanel(id);
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
        setLastGridPos({ x: panelLayout[id].x, y: panelLayout[id].y });
    };

    const handleResizeStart = (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingPanel(id);
    };

    const handleGlobalMouseMove = useCallback((e) => {
        if (!draggedPanel && !resizingPanel) return;

        const container = document.getElementById('grid-container');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const colWidth = rect.width / GRID_COLS;

        if (draggedPanel) {
            const mouseX = e.clientX - rect.left - dragOffset.x;
            const mouseY = e.clientY - rect.top - dragOffset.y;

            const gridX = Math.max(0, Math.min(GRID_COLS - panelLayout[draggedPanel].w, Math.round(mouseX / colWidth)));
            const gridY = Math.max(0, Math.round(mouseY / ROW_HEIGHT));

            if (gridX !== panelLayout[draggedPanel].x || gridY !== panelLayout[draggedPanel].y) {
                setPanelLayout(prev => resolveCollisions(prev, draggedPanel, { ...prev[draggedPanel], x: gridX, y: gridY }));
            }
        }

        if (resizingPanel) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Używamy Math.round dla bardziej naturalnego snappingu
            const gridW = Math.max(2, Math.min(GRID_COLS - panelLayout[resizingPanel].x, Math.round(mouseX / colWidth) - panelLayout[resizingPanel].x));
            const gridH = Math.max(2, Math.round(mouseY / ROW_HEIGHT) - panelLayout[resizingPanel].y);

            if (gridW !== panelLayout[resizingPanel].w || gridH !== panelLayout[resizingPanel].h) {
                setPanelLayout(prev => resolveCollisions(prev, resizingPanel, { ...prev[resizingPanel], w: gridW, h: gridH }));
            }
        }
    }, [draggedPanel, resizingPanel, panelLayout, dragOffset]);

    const handleGlobalMouseUp = useCallback(() => {
        if (draggedPanel || resizingPanel) {
            localStorage.setItem('erp_requirements_grid_layout', JSON.stringify(panelLayout));
            setDraggedPanel(null);
            setResizingPanel(null);
        }
    }, [draggedPanel, resizingPanel, panelLayout]);

    useEffect(() => {
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [handleGlobalMouseMove, handleGlobalMouseUp]);

    const handleDragOver = (e) => e.preventDefault();
    const handleDrop = (e) => e.preventDefault();


    const offerDeadlineIso = form.offerDeadlineDate
        ? new Date(`${form.offerDeadlineDate}T${form.offerDeadlineTime || '00:00'}:00`).toISOString()
        : '';

    const countdown = useCountdown(offerDeadlineIso || null);
    const workingDays = countWorkingDays(form.projectStart, form.projectEnd);

    const fetchData = useCallback(async () => {
        if (!nodeId) return;
        setLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const url = versionId
                ? `${API_URL}/order-requirements/${nodeId}?versionId=${versionId}`
                : `${API_URL}/order-requirements/${nodeId}`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const text = await res.text();
                if (text) {
                    const data = JSON.parse(text);
                    if (data) {
                        const dl = data.offerDeadline ? new Date(data.offerDeadline) : null;
                        // Daty wyświetlamy w lokalnej strefie czasowej przeglądarki
                        const toLocalDate = (iso) => {
                            if (!iso) return '';
                            const d = new Date(iso);
                            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        };
                        const pmName = data.clientProjectManager || '';

                        setForm({
                            offerDeadlineDate: data.offerDeadline ? data.offerDeadline.split('T')[0] : '',
                            offerDeadlineTime: data.offerDeadline ? data.offerDeadline.split('T')[1].substring(0, 5) : '',
                            projectStart: toLocalDate(data.projectStart),
                            projectEnd: toLocalDate(data.projectEnd),
                            projectGoal: data.projectGoal || '',
                            pmName,
                            pmCompany: data.clientProjectManagerCompany || '',
                            clientProjectManagerPhone: data.clientProjectManagerPhone || '',
                            clientProjectManagerEmail: data.clientProjectManagerEmail || '',
                            clientContacts: data.clientContacts ? JSON.parse(data.clientContacts).map(c => ({
                                ...c,
                                name: c.surname ? `${c.name || ''} ${c.surname}`.trim() : (c.name || ''),
                                surname: undefined,
                            })) : [],
                            offerStatus: data.offerStatus || '',
                            offerStatusComment: data.offerStatusComment || '',
                        });
                        setItems(parseItems(data.projectItems));
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching requirements:', err);
        } finally {
            setLoading(false);
        }
    }, [nodeId]);

    useEffect(() => { fetchData(); }, [fetchData, versionId]);

    useEffect(() => {
        const token = sessionStorage.getItem('token');
        if (!token) return;
        fetch(`${API_URL}/users/suggest`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then(data => setAllUsers(Array.isArray(data) ? data : []))
            .catch(() => {});
    }, []);

    const handleSave = async (overrideItems = null, overrideContacts = null) => {
        setSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const dataItems = overrideItems || items;
            const payload = {
                nodeId,
                versionId,
                offerDeadline: offerDeadlineIso || null,
                projectStart: form.projectStart || null,
                projectEnd: form.projectEnd || null,
                projectGoal: form.projectGoal || null,
                clientProjectManager: form.pmName || null,
                clientProjectManagerCompany: form.pmCompany || null,
                clientProjectManagerPhone: form.clientProjectManagerPhone || null,
                clientProjectManagerEmail: form.clientProjectManagerEmail || null,
                clientContacts: JSON.stringify(overrideContacts ?? form.clientContacts),
                projectItems: JSON.stringify(dataItems),
                offerStatus: form.offerStatus || null,
                offerStatusComment: form.offerStatusComment || null,
            };
            const res = await fetch(`${API_URL}/order-requirements`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            } else {
                const errBody = await res.json().catch(() => ({}));
                console.error('order-requirements 400:', JSON.stringify(errBody));
                alert('Błąd zapisu informacji o projekcie');
            }
        } catch {
            alert('Błąd połączenia');
        } finally {
            setSaving(false);
        }
    };

    const addContact = () => {
        setForm(prev => ({
            ...prev,
            clientContacts: [...prev.clientContacts, { id: crypto.randomUUID(), name: '', company: '', role: '', phone: '', email: '' }]
        }));
    };

    const updateContact = (id, field, value) => {
        setForm(prev => ({
            ...prev,
            clientContacts: prev.clientContacts.map(c => c.id === id ? { ...c, [field]: value } : c)
        }));
    };

    const removeContact = (id) => {
        setForm(prev => ({
            ...prev,
            clientContacts: prev.clientContacts.filter(c => c.id !== id)
        }));
        setContactSuggest(prev => { const n = { ...prev }; delete n[id]; return n; });
    };

    const [teamSaving, setTeamSaving] = useState({});
    const addToTeam = async (email, fullName, company, phone) => {
        if (!email && !fullName) return;
        const key = email || fullName;
        setTeamSaving(p => ({ ...p, [key]: 'saving' }));
        const parts = (fullName || '').trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        try {
            const token = sessionStorage.getItem('token');
            await fetch(`${API_URL}/process-tree/${nodeId}/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ email, firstName, lastName, phone: phone || null, company: company || null }),
            });
            setTeamSaving(p => ({ ...p, [key]: 'done' }));
            setTimeout(() => setTeamSaving(p => { const n = { ...p }; delete n[key]; return n; }), 2500);
        } catch {
            setTeamSaving(p => ({ ...p, [key]: 'error' }));
        }
    };

    const handleContactNameChange = (contactId, value) => {
        if (!value.trim()) {
            removeContact(contactId);
            setTimeout(handleSave, 50);
            return;
        }
        updateContact(contactId, 'name', value);
        if (value.length < 2) {
            setContactSuggest(prev => ({ ...prev, [contactId]: { open: false, results: [] } }));
            return;
        }
        const q = value.toLowerCase();
        const results = allUsers.filter(u => {
            const full = `${u.firstName || ''} ${u.lastName || ''} ${u.email}`.toLowerCase();
            return full.includes(q);
        }).slice(0, 8);
        setContactSuggest(prev => ({ ...prev, [contactId]: { open: results.length > 0, results } }));
    };

    const selectUserForContact = (contactId, user) => {
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
        const updatedContacts = form.clientContacts.map(c =>
            c.id === contactId
                ? {
                    ...c,
                    name: fullName,
                    email: user.email || c.email,
                    company: user.company ?? c.company,
                    phone: user.phone ?? c.phone,
                }
                : c
        );
        setForm(prev => ({ ...prev, clientContacts: updatedContacts }));
        setContactSuggest(prev => ({ ...prev, [contactId]: { open: false, results: [] } }));
        handleSave(null, updatedContacts);
    };

    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

    // Operacje na liście przedmiotów (wg kategorii)
    const totalItems = Object.values(items).reduce((sum, arr) => sum + arr.filter(i => i.name?.trim()).length, 0);
    const addItem = (catKey) => setItems(prev => {
        const next = { ...prev, [catKey]: [...(prev[catKey] || []), newItem()] };
        handleSave(next);
        return next;
    });
    const removeItem = (catKey, id) => setItems(prev => {
        const next = { ...prev, [catKey]: (prev[catKey] || []).filter(i => i.id !== id) };
        handleSave(next);
        return next;
    });
    const updateItem = (catKey, id, field, value) => setItems(prev => ({
        ...prev,
        [catKey]: (prev[catKey] || []).map(i => i.id === id ? { ...i, [field]: value } : i),
    }));
    const toggleCategory = (catKey) => {
        if (expandedCat === catKey) {
            setExpandedCat(null);
        } else {
            setExpandedCat(catKey);
        }
    };



    if (loading) return (
        <div className="flex items-center justify-center p-20">
            <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        </div>
    );

    const inputCls = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-all text-sm [color-scheme:dark]";
    const labelCls = "block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5";

    return (
        <div className="animate-fade-in flex flex-col gap-4 w-full h-full min-h-[800px]">
            {/* Top action bar */}
            <div className="flex justify-end items-center gap-3">
                <button
                    onClick={() => exportRequirementsPdf({ form, countdown, workingDays, orderName })}
                    className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 rounded-lg text-purple-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                    title="Eksportuj informacje o zamówieniu do PDF"
                >
                    <FileDown size={11} /> PDF tej zakładki
                </button>

                <button
                    onClick={() => {
                        localStorage.removeItem('erp_requirements_grid_layout');
                        setPanelLayout(defaultLayout);
                    }}
                    className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
                    title="Przywróć domyślny układ modułów"
                >
                    <GripVertical size={10} />
                    Resetuj układ
                </button>
            </div>
            <div
                id="grid-container"
                className="relative w-full flex-1 grid grid-cols-12 gap-4"
                style={{ gridAutoRows: `${ROW_HEIGHT}px` }}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {Object.entries(panelLayout).map(([panelId, pos]) => {
                    const isDragged = draggedPanel === panelId;
                    const isResizing = resizingPanel === panelId;

                    const panelProps = {
                        style: {
                            gridColumn: `${pos.x + 1} / span ${pos.w}`,
                            gridRow: panelId === 'contacts' ? `${pos.y + 1}` : `${pos.y + 1} / span ${pos.h}`,
                            zIndex: isDragged || isResizing ? 50 : 1,
                            transition: isDragged || isResizing ? 'none' : 'grid-column 0.3s ease, grid-row 0.3s ease, all 0.2s ease-out',
                            userSelect: isDragged || isResizing ? 'none' : 'auto'
                        },
                        className: `group glass-panel p-3 rounded-xl border border-white/5 bg-white/[0.02] flex flex-col ${panelId === 'contacts' ? '' : 'overflow-hidden'} ${isDragged ? 'opacity-60 shadow-2xl border-blue-500' : 'hover:border-white/10'}`
                    };

                    const resizeHandle = (
                        <div
                            onMouseDown={(e) => handleResizeStart(e, panelId)}
                            className="absolute bottom-1 right-1 w-4 h-4 cursor-nwse-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <svg width="8" height="8" viewBox="0 0 8 8" className="text-gray-500">
                                <path d="M7 0 L8 0 L8 8 L0 8 L0 7 L7 7 Z" fill="currentColor" />
                            </svg>
                        </div>
                    );

                    const panelHeader = (icon, title) => (
                        <div
                            onMouseDown={(e) => handleMouseDown(e, panelId)}
                            className="flex items-center gap-2 mb-2 shrink-0 cursor-grab active:cursor-grabbing group/header"
                        >
                            <GripVertical size={14} className="text-gray-600 group-hover/header:text-blue-400 transition-colors" />
                            {icon}
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 pointer-events-none">{title}</h4>
                        </div>
                    );

                    if (panelId === 'deadline') {
                        const hasStatus = !!form.offerStatus;
                        return (
                            <section key={panelId} {...panelProps}>
                                {panelHeader(<Clock size={15} className="text-orange-400" />, "Termin złożenia oferty")}
                                
                                {/* Date + Time + Status in one row */}
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Data</label>
                                        <input type="date" value={form.offerDeadlineDate} onChange={set('offerDeadlineDate')} onBlur={() => handleSave()} className={`${inputCls} py-1.5 px-2 text-[11px]`} />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Godzina</label>
                                        <select value={form.offerDeadlineTime} onChange={set('offerDeadlineTime')} onBlur={() => handleSave()} className={`${inputCls} py-1.5 px-2 text-[11px]`}>
                                            <option value="">--:--</option>
                                            {Array.from({ length: 24 }).map((_, i) => {
                                                const h = `${String(i).padStart(2, '0')}:00`;
                                                return <option key={h} value={h}>{h}</option>;
                                            })}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Status</label>
                                        <select
                                            value={form.offerStatus}
                                            onChange={set('offerStatus')}
                                            onBlur={() => handleSave()}
                                            className={`${inputCls} py-1.5 px-2 text-[11px] w-full ${
                                                form.offerStatus === 'accepted' ? 'border-green-500/40 text-green-400' :
                                                form.offerStatus === 'rejected' ? 'border-red-500/40 text-red-400' : ''
                                            }`}
                                        >
                                            <option value="">—</option>
                                            <option value="accepted">✅ Zaakceptowana</option>
                                            <option value="rejected">❌ Odrzucona</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Comment - shown when status is set */}
                                {hasStatus && (
                                    <div className="mb-2">
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Komentarz</label>
                                        <textarea
                                            value={form.offerStatusComment}
                                            onChange={set('offerStatusComment')}
                                            onBlur={() => handleSave()}
                                            rows={2}
                                            placeholder="Komentarz do statusu..."
                                            className={`${inputCls} py-1.5 px-2 text-[11px] w-full resize-none`}
                                        />
                                    </div>
                                )}

                                {/* Countdown - only when no status */}
                                {!hasStatus && countdown && (
                                    <div className={`mt-auto flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[10px] font-mono min-w-0 w-full ${
                                        countdown.expired ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                        : countdown.days < 2 ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                                        : 'bg-green-500/10 border-green-500/20 text-green-400'
                                    }`}>
                                        <Clock size={12} className="shrink-0" />
                                        {countdown.expired
                                            ? <span className="truncate">Termin minął!</span>
                                            : <span className="truncate whitespace-nowrap">Pozostało: <strong>{countdown.days}d {countdown.hours}h {countdown.minutes}m</strong></span>
                                        }
                                    </div>
                                )}

                                {resizeHandle}
                            </section>
                        );
                    }

                    if (panelId === 'schedule') {
                        return (
                            <section key={panelId} {...panelProps}>
                                {panelHeader(<Calendar size={15} className="text-blue-400" />, "Harmonogram projektu")}
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Początek</label>
                                        <input type="date" value={form.projectStart} onChange={set('projectStart')} onBlur={() => handleSave()} className={`${inputCls} py-1.5 px-2 text-[11px]`} />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Koniec</label>
                                        <input type="date" value={form.projectEnd} onChange={set('projectEnd')} onBlur={() => handleSave()} className={`${inputCls} py-1.5 px-2 text-[11px]`} />
                                    </div>
                                </div>
                                {workingDays !== null && (
                                    <div className={`mt-auto flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[10px] font-mono min-w-0 w-full ${workingDays === 0 ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                        : workingDays < 5 ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                                            : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                        }`}>
                                        <Calendar size={12} className="shrink-0" />
                                        <span className="truncate whitespace-nowrap">Czas: <strong>{workingDays} {workingDays === 1 ? 'dzień' : workingDays < 5 ? 'dni' : 'dni rob.'}</strong></span>
                                    </div>
                                )}
                                {resizeHandle}
                            </section>
                        );
                    }

                    if (panelId === 'goal') {
                        return (
                            <section key={panelId} {...panelProps}>
                                {panelHeader(<Target size={15} className="text-purple-400" />, "Cel projektu")}
                                <MarkdownEditor
                                    value={form.projectGoal || ''}
                                    onChange={(v) => setForm(prev => ({ ...prev, projectGoal: v }))}
                                    onSave={() => handleSave()}
                                    placeholder="Opisz cel i zakres zamówienia…"
                                    previewTitle="Cel projektu"
                                    containerClassName="flex-1 min-h-0"
                                    className={`${inputCls} flex-1 min-h-[60px] resize-none custom-scrollbar`}
                                />
                                {resizeHandle}
                            </section>
                        );
                    }

                    if (panelId === 'contacts') {
                        return (
                            <section key={panelId} {...panelProps}>
                                {panelHeader(<Users size={15} className="text-green-400" />, "Kontakty")}
                                <div className="mb-4 shrink-0 space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                                            <User size={12} className="text-green-400" />
                                        </div>
                                        <span className="text-[14px] font-bold uppercase tracking-wider text-gray-400">Project Manager</span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-3">
                                        <div>
                                            <label className="text-[13px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Imię i Nazwisko</label>
                                            <input type="text" value={form.pmName} onChange={e => {
                                            if (!e.target.value) {
                                                setForm(prev => ({ ...prev, pmName: '', pmCompany: '', clientProjectManagerPhone: '', clientProjectManagerEmail: '' }));
                                            } else {
                                                setForm(prev => ({ ...prev, pmName: e.target.value }));
                                            }
                                        }} onBlur={() => handleSave()} className="w-full bg-black/40 border border-white/5 rounded px-2 py-2 text-[16px] text-gray-200 focus:outline-none focus:border-blue-500/30" />
                                        </div>
                                        <div>
                                            <label className="text-[13px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Firma</label>
                                            <input type="text" value={form.pmCompany} onChange={set('pmCompany')} onBlur={() => handleSave()} className="w-full bg-black/40 border border-white/5 rounded px-2 py-2 text-[16px] text-gray-200 focus:outline-none focus:border-blue-500/30" />
                                        </div>
                                        <div>
                                            <label className="text-[13px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Telefon</label>
                                            <div className="relative">
                                                <Phone size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                                <input type="text" value={form.clientProjectManagerPhone} onChange={set('clientProjectManagerPhone')} onBlur={() => handleSave()} placeholder="+48 ..." className="w-full bg-black/40 border border-white/5 rounded pl-9 pr-2 py-2 text-[16px] text-gray-200 focus:outline-none focus:border-blue-500/30" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[13px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">E-mail</label>
                                            <div className="relative">
                                                <Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                                <input type="email" value={form.clientProjectManagerEmail} onChange={set('clientProjectManagerEmail')} onBlur={() => handleSave()} placeholder="example@..." className="w-full bg-black/40 border border-white/5 rounded pl-9 pr-2 py-2 text-[16px] text-gray-200 focus:outline-none focus:border-blue-500/30 truncate" />
                                            </div>
                                        </div>
                                    </div>
                                    {(() => { const k = form.clientProjectManagerEmail || form.pmName; const st = teamSaving[k]; return (
                                        <button onClick={() => addToTeam(form.clientProjectManagerEmail, form.pmName, form.pmCompany, form.clientProjectManagerPhone)}
                                            disabled={st === 'saving' || (!form.clientProjectManagerEmail && !form.pmName)}
                                            className="mt-2 self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-40 border border-green-500/30 text-green-300 hover:bg-green-500/10 bg-green-500/5">
                                            {st === 'saving' ? <div className="w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin"/> : st === 'done' ? <CheckCircle2 size={13}/> : <UserPlus size={13}/>}
                                            {st === 'done' ? 'Dodano do zespołu' : 'Zapisz do zespołu'}
                                        </button>
                                    ); })()}
                                </div>

                                <div className="flex-1 flex flex-col min-h-0">
                                    <div className="flex items-center justify-between mb-2 shrink-0">
                                        <label className={`${labelCls} mb-0`}>Dodatkowe Kontakty</label>
                                        <button onClick={addContact} className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 transition-colors">
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                    <div className="flex flex-col gap-2 pr-1">
                                        {form.clientContacts.length === 0 ? (
                                            <div className="text-center py-4 text-[10px] text-gray-500 italic">Brak kontaktów.</div>
                                        ) : (
                                            form.clientContacts.map((contact) => (
                                                <div key={contact.id} className="relative p-2 rounded-lg border border-white/5 bg-black/20 group animate-slide-in">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                                                                <User size={10} className="text-blue-400" />
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={contact.role}
                                                                onChange={e => updateContact(contact.id, 'role', e.target.value)}
                                                                onBlur={() => handleSave()}
                                                                placeholder="Rola (np. Inżynier)"
                                                                className="bg-transparent text-[13px] font-bold uppercase tracking-widest text-blue-400 focus:outline-none focus:text-blue-300 w-full"
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => { removeContact(contact.id); setTimeout(handleSave, 100); }}
                                                            className="p-1 text-red-400/50 hover:text-red-400 transition-all rounded hover:bg-red-400/10 shrink-0"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-3">
                                                        <div className="relative">
                                                            <label className="text-[13px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Imię i Nazwisko</label>
                                                            <input
                                                                type="text"
                                                                value={contact.name}
                                                                onChange={e => handleContactNameChange(contact.id, e.target.value)}
                                                                onBlur={() => {
                                                                    setTimeout(() => setContactSuggest(prev => ({ ...prev, [contact.id]: { ...prev[contact.id], open: false } })), 150);
                                                                    handleSave();
                                                                }}
                                                                onFocus={() => {
                                                                    if (contact.name.length >= 2) handleContactNameChange(contact.id, contact.name);
                                                                }}
                                                                className="w-full bg-black/40 border border-white/5 rounded px-2 py-2 text-[16px] text-gray-200 focus:outline-none focus:border-blue-500/30"
                                                            />
                                                            {contactSuggest[contact.id]?.open && (
                                                                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                                                                    {contactSuggest[contact.id].results.map(u => (
                                                                        <button
                                                                            key={u.id}
                                                                            type="button"
                                                                            onMouseDown={() => selectUserForContact(contact.id, u)}
                                                                            className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0"
                                                                        >
                                                                            <div className="text-[13px] text-gray-200">{[u.firstName, u.lastName].filter(Boolean).join(' ')}</div>
                                                                            <div className="text-[11px] text-gray-500">{u.email}</div>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <label className="text-[13px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Firma</label>
                                                            <input type="text" value={contact.company || ''} onChange={e => updateContact(contact.id, 'company', e.target.value)} onBlur={() => handleSave()} className="w-full bg-black/40 border border-white/5 rounded px-2 py-2 text-[16px] text-gray-200 focus:outline-none focus:border-blue-500/30" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[13px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">Telefon</label>
                                                            <div className="relative">
                                                                <Phone size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                                                <input type="text" value={contact.phone} onChange={e => updateContact(contact.id, 'phone', e.target.value)} onBlur={() => handleSave()} placeholder="+48..." className="w-full bg-black/40 border border-white/5 rounded pl-9 pr-2 py-2 text-[16px] text-gray-200 focus:outline-none focus:border-blue-500/30" />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[13px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1">E-mail</label>
                                                            <div className="relative">
                                                                <Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                                                <input type="email" value={contact.email} onChange={e => updateContact(contact.id, 'email', e.target.value)} onBlur={() => handleSave()} placeholder="example@..." className="w-full bg-black/40 border border-white/5 rounded pl-9 pr-2 py-2 text-[16px] text-gray-200 focus:outline-none focus:border-blue-500/30 truncate" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {(() => { const k = contact.email || contact.name; const st = teamSaving[k]; return (
                                                        <button onClick={() => addToTeam(contact.email, contact.name, contact.company, contact.phone)}
                                                            disabled={st === 'saving' || (!contact.email && !contact.name)}
                                                            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-40 border border-green-500/30 text-green-300 hover:bg-green-500/10 bg-green-500/5">
                                                            {st === 'saving' ? <div className="w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin"/> : st === 'done' ? <CheckCircle2 size={13}/> : <UserPlus size={13}/>}
                                                            {st === 'done' ? 'Dodano do zespołu' : 'Zapisz do zespołu'}
                                                        </button>
                                                    ); })()}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                                {resizeHandle}
                            </section>
                        );
                    }

                    return null;
                })}
            </div>
        </div>
    );
}
