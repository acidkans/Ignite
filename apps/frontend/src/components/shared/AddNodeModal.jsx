import { useState } from 'react';
import { API_URL } from '../../config';

export default function AddNodeModal({ parent, onClose, onSuccess }) {
    const [name, setName] = useState('');
    const [type, setType] = useState(parent ? getNextType(parent.type) : 'area');
    const [loading, setLoading] = useState(false);

    function getNextType(parentType) {
        // Modified hierarchy to exclude subtask
        const hierarchy = { area: 'field', field: 'order', order: 'site' };
        return hierarchy[parentType] || 'site';
    }

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!name.trim()) return;

        setLoading(true);

        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/process-tree`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name.trim(),
                    type,
                    parentId: parent?.id || null
                })
            });

            if (!res.ok) throw new Error('Błąd tworzenia węzła');

            onSuccess();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
            <div className="glass-panel p-6 rounded-xl max-w-md w-full mx-4 border border-white/10 shadow-2xl">
                <h3 className="text-xl font-bold mb-4 text-white">
                    {parent ? `Nowy element w: ${parent.name}` : 'Nowy Obszar'}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                            Nazwa
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="np. Administracja"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
                            Typ
                        </label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="w-full bg-gray-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                        >
                            <option value="area" className="bg-gray-800 text-white">📁 Obszar</option>
                            <option value="field" className="bg-gray-800 text-white">📂 Dziedzina</option>
                            <option value="order" className="bg-gray-800 text-white">📋 Zamówienie</option>
                            <option value="site" className="bg-gray-800 text-white">📍 Lokalizacja</option>
                        </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors"
                            disabled={loading}
                        >
                            Anuluj
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg shadow-lg transform transition-all active:scale-95 disabled:opacity-50"
                            disabled={loading || !name.trim()}
                        >
                            {loading ? 'Tworzenie...' : 'Utwórz'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
