import { useState, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { API_URL } from '../../config';

const CATEGORIES = [
    { key: 'terminowe',     label: 'Terminowe' },
    { key: 'instalacyjne',  label: 'Instalacyjne' },
    { key: 'organizacyjne', label: 'Organizacyjne' },
    { key: 'jakosciowe',    label: 'Jakościowe' },
    { key: 'techniczne',    label: 'Techniczne' },
    { key: 'finansowe',     label: 'Finansowe' },
    { key: 'sla',           label: 'SLA' },
    { key: 'gwarancyjne',   label: 'Gwarancyjne' },
];

const ROLES = [
    { value: '',         label: '— brak —' },
    { value: 'ADMIN',    label: 'Administrator' },
    { value: 'MANAGER',  label: 'Menadżer' },
    { value: 'LOGISTYK', label: 'Logistyk' },
    { value: 'USER',     label: 'Pracownik' },
];

const ROLE_BADGE = {
    ADMIN:    'bg-red-500/20 text-red-300 border-red-500/30',
    MANAGER:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
    LOGISTYK: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    USER:     'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

export default function DefaultProjectItemsPanel() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedCat, setExpandedCat] = useState(null);
    const token = sessionStorage.getItem('token');

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/default-project-items`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setItems(await res.json());
        } finally {
            setLoading(false);
        }
    };

    const addItem = async (category) => {
        const res = await fetch(`${API_URL}/default-project-items`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, name: '', description: '', assignedRole: null }),
        });
        if (res.ok) {
            const created = await res.json();
            setItems(prev => [...prev, created]);
        }
    };

    const updateLocal = (id, field, value) => {
        setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    };

    const saveItem = async (item) => {
        await fetch(`${API_URL}/default-project-items/${item.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: item.name,
                description: item.description || null,
                assignedRole: item.assignedRole || null,
            }),
        });
    };

    const removeItem = async (id) => {
        setItems(prev => prev.filter(i => i.id !== id));
        await fetch(`${API_URL}/default-project-items/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
    };

    if (loading) return (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
            <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mr-2" />
            Ładowanie...
        </div>
    );

    const grouped = CATEGORIES.map(cat => ({
        ...cat,
        rows: items.filter(i => i.category === cat.key),
    }));

    return (
        <div className="p-6 max-w-4xl mx-auto overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                    Domyślne przedmioty projektu
                </h2>
                <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] rounded-full font-mono">
                    {items.length}
                </span>
            </div>

            <div className="mb-4 flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                    Szablony kopiowane do nowych projektów. Usunięcie stąd <strong>nie wpływa</strong> na istniejące projekty.
                </span>
            </div>

            <div className="space-y-2">
                {grouped.map(cat => {
                    const isOpen = expandedCat === cat.key;
                    return (
                        <div key={cat.key} className="glass-panel rounded-xl overflow-hidden">
                            <button
                                onClick={() => setExpandedCat(isOpen ? null : cat.key)}
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-gray-200">{cat.label}</span>
                                    {cat.rows.length > 0 && (
                                        <span className="px-1.5 py-0.5 bg-white/10 text-[9px] rounded-full text-gray-400 font-mono">
                                            {cat.rows.length}
                                        </span>
                                    )}
                                </div>
                                <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                            </button>

                            {isOpen && (
                                <div className="border-t border-white/5">
                                    {cat.rows.length > 0 && (
                                        <div className="px-4 pt-3">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="text-gray-500 border-b border-white/5">
                                                        <th className="text-left pb-2 font-medium w-[38%]">Nazwa</th>
                                                        <th className="text-left pb-2 font-medium pl-2 w-[35%]">Opis</th>
                                                        <th className="text-left pb-2 font-medium pl-2 w-[20%]">Przypisz do</th>
                                                        <th className="w-7"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {cat.rows.map(item => (
                                                        <tr key={item.id} className="group border-b border-white/[0.03] last:border-0">
                                                            <td className="py-1.5 pr-2">
                                                                <input
                                                                    type="text"
                                                                    value={item.name}
                                                                    onChange={e => updateLocal(item.id, 'name', e.target.value)}
                                                                    onBlur={() => saveItem(item)}
                                                                    placeholder="Nazwa przedmiotu..."
                                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
                                                                />
                                                            </td>
                                                            <td className="py-1.5 pl-0 pr-2">
                                                                <input
                                                                    type="text"
                                                                    value={item.description || ''}
                                                                    onChange={e => updateLocal(item.id, 'description', e.target.value)}
                                                                    onBlur={() => saveItem(item)}
                                                                    placeholder="Opis..."
                                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
                                                                />
                                                            </td>
                                                            <td className="py-1.5 pl-0 pr-2">
                                                                <select
                                                                    value={item.assignedRole || ''}
                                                                    onChange={e => {
                                                                        const updated = { ...item, assignedRole: e.target.value || null };
                                                                        updateLocal(item.id, 'assignedRole', e.target.value || null);
                                                                        saveItem(updated);
                                                                    }}
                                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-gray-300 focus:outline-none focus:border-blue-500 transition-all"
                                                                >
                                                                    {ROLES.map(r => (
                                                                        <option key={r.value} value={r.value}>{r.label}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="py-1.5 text-right">
                                                                <button
                                                                    onClick={() => removeItem(item.id)}
                                                                    className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:bg-red-500/10 rounded transition-all"
                                                                    title="Usuń"
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    <div className="px-4 py-2">
                                        <button
                                            onClick={() => addItem(cat.key)}
                                            className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-blue-400 transition-colors py-1"
                                        >
                                            <Plus size={12} />
                                            Dodaj w kategorii {cat.label}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
