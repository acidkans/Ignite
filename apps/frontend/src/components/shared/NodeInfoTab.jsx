import { useState, useEffect, useRef } from 'react';
import { Save, User, MapPin, Hash, Globe, CheckCircle2, Link } from 'lucide-react';
import { API_URL } from '../../config';

// @anchor node-info-slugify
function slugify(str) {
    return str.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

export default function NodeInfoTab({ nodeId }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [data, setData] = useState({
        name: '',
        customTypeLabel: '',
        address: '',
        nip: '',
        region: '',
        contactPerson: '',
        type: '',
        taskListSlug: '',
    });
    // @anchor node-info-slug-status
    const [slugStatus, setSlugStatus] = useState(null); // null | 'checking' | 'available' | 'taken'
    const slugTimerRef = useRef(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!nodeId) return;
            setLoading(true);
            try {
                const token = sessionStorage.getItem('token');
                const res = await fetch(`${API_URL}/process-tree/${nodeId}/info`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const node = await res.json();
                    setData({
                        name: node.name || '',
                        customTypeLabel: node.customTypeLabel || '',
                        address: node.address || '',
                        nip: node.nip || '',
                        region: node.region || '',
                        contactPerson: node.contactPerson || '',
                        type: node.type || '',
                        taskListSlug: node.taskListSlug || '',
                    });
                }
            } catch (err) {
                console.error('Failed to fetch node data:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [nodeId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/process-tree/${nodeId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: data.name,
                    customTypeLabel: data.customTypeLabel,
                    address: data.address,
                    nip: data.nip,
                    region: data.region,
                    contactPerson: data.contactPerson,
                    taskListSlug: data.taskListSlug || null,
                })
            });

            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
                window.dispatchEvent(new CustomEvent('node-updated', { detail: { nodeId, name: data.name } }));
            }
        } catch (err) {
            console.error('Failed to save node data:', err);
        } finally {
            setSaving(false);
        }
    };

    // @anchor node-info-slug-change
    const handleSlugChange = (raw) => {
        const slug = slugify(raw);
        setData(d => ({ ...d, taskListSlug: slug }));
        setSlugStatus(slug ? 'checking' : null);
        clearTimeout(slugTimerRef.current);
        if (!slug) return;
        slugTimerRef.current = setTimeout(async () => {
            try {
                const token = sessionStorage.getItem('token');
                const res = await fetch(
                    `${API_URL}/process-tree/slug-check?slug=${encodeURIComponent(slug)}&excludeNodeId=${nodeId}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (res.ok) {
                    const { available } = await res.json();
                    setSlugStatus(available ? 'available' : 'taken');
                }
            } catch { setSlugStatus(null); }
        }, 400);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    const currentLabel = data.customTypeLabel || data.type;

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">

            {/* Basic Information */}
            <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-6 shadow-2xl">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Hash size={14} className="text-purple-400" />
                    Dane Podstawowe
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column */}
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <MapPin size={12} className="text-gray-500" /> Adres
                            </label>
                            <textarea
                                value={data.address}
                                onChange={(e) => setData({ ...data, address: e.target.value })}
                                rows={3}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all resize-none"
                                placeholder="Ulica, Numer, Kod pocztowy, Miasto"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Hash size={12} className="text-gray-500" /> Numer NIP
                            </label>
                            <input
                                type="text"
                                value={data.nip}
                                onChange={(e) => setData({ ...data, nip: e.target.value })}
                                className="w-full h-11 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
                                placeholder="000-000-00-00"
                            />
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Globe size={12} className="text-gray-500" /> Region / Obszar operacyjny
                            </label>
                            <input
                                type="text"
                                value={data.region}
                                onChange={(e) => setData({ ...data, region: e.target.value })}
                                className="w-full h-11 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
                                placeholder="np. Wielkopolska, Zachód"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <User size={12} className="text-gray-500" /> Główna Osoba Kontaktowa
                            </label>
                            <input
                                type="text"
                                value={data.contactPerson}
                                onChange={(e) => setData({ ...data, contactPerson: e.target.value })}
                                className="w-full h-11 bg-white/[0.03] border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
                                placeholder="Imię i Nazwisko"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Integracja zadań MS To Do */}
            <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-6 shadow-2xl">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-5 flex items-center gap-2">
                    <Link size={14} className="text-blue-400" />
                    Integracja zadań (MS To Do)
                </h3>
                <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Hash size={11} className="text-gray-500" /> Slug listy zadań
                        <span className="text-gray-600 normal-case font-normal tracking-normal">
                            — wpisz lub użyj #slug w tytule zadania
                        </span>
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={data.taskListSlug}
                            onChange={(e) => handleSlugChange(e.target.value)}
                            className={`w-full h-11 bg-white/[0.03] border rounded-xl px-4 text-sm font-mono text-white focus:outline-none focus:bg-white/[0.06] transition-all ${
                                slugStatus === 'taken' ? 'border-red-500/50 focus:border-red-500/70' :
                                slugStatus === 'available' ? 'border-green-500/50 focus:border-green-500/70' :
                                'border-white/10 focus:border-blue-500/50'
                            }`}
                            placeholder="np. projekt-a, strefa-logistyki"
                        />
                        {slugStatus === 'checking' && (
                            <span className="absolute right-3 top-3 text-[10px] text-gray-500 animate-pulse">sprawdzam…</span>
                        )}
                        {slugStatus === 'available' && (
                            <span className="absolute right-3 top-3 text-[10px] text-green-400">✓ wolny</span>
                        )}
                        {slugStatus === 'taken' && (
                            <span className="absolute right-3 top-3 text-[10px] text-red-400">✗ zajęty</span>
                        )}
                    </div>
                    <p className="text-[10px] text-gray-600">
                        Automatycznie przypinaj zadania z tej listy MS To Do do węzła. Musi być globalnie unikalny.
                    </p>
                </div>
            </div>

            {/* Actions — przyklejone do dołu kontenera scrolla, nie gubią się między polami */}
            <div className="sticky bottom-0 -mx-1 px-1 flex items-center justify-end gap-4 pt-4 pb-3 mt-4 border-t border-white/10 bg-gray-900/85 backdrop-blur-md rounded-b-2xl z-10">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 active:scale-95"
                >
                    {saving ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : saved ? (
                        <CheckCircle2 size={18} />
                    ) : (
                        <Save size={18} />
                    )}
                    <span>{saving ? 'Zapisywanie…' : saved ? 'Zapisano!' : 'Zapisz informacje'}</span>
                </button>
            </div>
        </div>
    );
}
