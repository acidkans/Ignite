import { useState, useEffect } from 'react';
import { Save, User, MapPin, Hash, Globe, CheckCircle2 } from 'lucide-react';
import { API_URL } from '../../config';

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
        type: ''
    });

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
                        type: node.type || ''
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
                    contactPerson: data.contactPerson
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

            {/* Actions */}
            <div className="flex items-center justify-end gap-4 pt-4">
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
