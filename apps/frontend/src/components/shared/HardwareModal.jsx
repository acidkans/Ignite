import { useState, useEffect } from 'react';
import { API_URL } from '../../config';

export default function HardwareModal({ site, onClose }) {
    const [hardware, setHardware] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isAdding, setIsAdding] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        serialNumber: '',
        name: '',
        model: '',
        manufacturer: '',
        productionYear: new Date().getFullYear()
    });

    useEffect(() => {
        if (site) {
            fetchHardware();
        }
    }, [site]);

    const fetchHardware = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/hardware/site/${site.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch hardware');
            const data = await res.json();
            setHardware(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/hardware`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...formData,
                    siteId: site.id,
                    productionYear: parseInt(formData.productionYear)
                })
            });

            if (!res.ok) throw new Error('Failed to create hardware');

            await fetchHardware();
            setIsAdding(false);
            setFormData({
                serialNumber: '',
                name: '',
                model: '',
                manufacturer: '',
                productionYear: new Date().getFullYear()
            });
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/hardware/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to delete hardware');
            await fetchHardware();
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
            <div className="bg-gray-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-white">
                        Hardware for {site.name}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg mb-4">
                            {error}
                        </div>
                    )}

                    <div className="mb-4 flex justify-between items-center">
                        <h3 className="text-lg font-medium text-gray-200">Hardware List</h3>
                        <button
                            onClick={() => setIsAdding(!isAdding)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                        >
                            {isAdding ? 'Cancel' : '+ Add Hardware'}
                        </button>
                    </div>

                    {isAdding && (
                        <form onSubmit={handleSubmit} className="bg-white/5 p-4 rounded-lg mb-6 border border-white/10">
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Serial Number</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.serialNumber}
                                        onChange={e => setFormData({ ...formData, serialNumber: e.target.value })}
                                        className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Model</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.model}
                                        onChange={e => setFormData({ ...formData, model: e.target.value })}
                                        className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Manufacturer</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.manufacturer}
                                        onChange={e => setFormData({ ...formData, manufacturer: e.target.value })}
                                        className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Production Year</label>
                                    <input
                                        type="number"
                                        required
                                        value={formData.productionYear}
                                        onChange={e => setFormData({ ...formData, productionYear: e.target.value })}
                                        className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-white"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg">
                                    Save
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="bg-white/5 uppercase text-xs font-semibold text-gray-400">
                                <tr>
                                    <th className="px-4 py-3">Name</th>
                                    <th className="px-4 py-3">Serial Number</th>
                                    <th className="px-4 py-3">Model</th>
                                    <th className="px-4 py-3">Manufacturer</th>
                                    <th className="px-4 py-3">Year</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {loading ? (
                                    <tr><td colSpan="6" className="text-center py-4">Loading...</td></tr>
                                ) : hardware.length === 0 ? (
                                    <tr><td colSpan="6" className="text-center py-4 text-gray-500">No hardware found</td></tr>
                                ) : (
                                    hardware.map(item => (
                                        <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3 font-medium text-white">{item.name}</td>
                                            <td className="px-4 py-3">{item.serialNumber}</td>
                                            <td className="px-4 py-3">{item.model}</td>
                                            <td className="px-4 py-3">{item.manufacturer}</td>
                                            <td className="px-4 py-3">{item.productionYear}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
