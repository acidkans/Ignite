import { useState, useEffect } from 'react';
import { API_URL } from '../../config';

// Standard fields definition for mapping
const STANDARD_FIELDS = [
    { key: 'number', label: 'Number', type: 'text' },
    { key: 'structureType', label: 'Structure Type', type: 'text' },
    { key: 'accessDesc', label: 'Access Description', type: 'textarea' },
    { key: 'additionalDesc', label: 'Additional Description', type: 'textarea' },
    { key: 'drivingDesc', label: 'Driving Description', type: 'textarea' },
    { key: 'shelterType', label: 'Shelter Type', type: 'text' },
    { key: 'greenfield', label: 'Greenfield', type: 'boolean' },
    { key: 'addressStreet', label: 'Street', type: 'text' },
    { key: 'addressCity', label: 'City', type: 'text' },
    { key: 'addressZipCode', label: 'Zip Code', type: 'text' },
    { key: 'addressCountry', label: 'Country', type: 'text' },
    { key: 'addressLatitude', label: 'Latitude', type: 'number' },
    { key: 'addressLongitude', label: 'Longitude', type: 'number' },
];

export default function SiteDetailsPanel({ siteId, onClose }) {
    const [site, setSite] = useState(null);
    const [config, setConfig] = useState({ labels: {}, customFields: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isConfigMode, setIsConfigMode] = useState(false);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (siteId) {
            fetchData();
        }
    }, [siteId]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = sessionStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` };

            const [siteRes, configRes] = await Promise.all([
                fetch(`${API_URL}/sites/${siteId}`, { headers }),
                fetch(`${API_URL}/sites/config`, { headers })
            ]);

            if (!siteRes.ok) throw new Error('Failed to fetch site details');

            const safeJson = async (res) => {
                try {
                    const text = await res.text();
                    return text ? JSON.parse(text) : null;
                } catch (e) {
                    console.warn('JSON parse warning:', e);
                    return null;
                }
            };

            const siteData = await safeJson(siteRes);
            const configData = await safeJson(configRes);

            if (!siteData) throw new Error('Empty site data received');

            setSite(siteData);
            setFormData({ ...siteData, ...siteData.customData });

            if (configData && configData.config) {
                setConfig(configData.config);
            }
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            const token = sessionStorage.getItem('token');
            // Separate standard fields from custom data
            const standardData = {};
            const customData = {};

            // Helper to check if key is standard
            const isStandard = (key) => STANDARD_FIELDS.find(f => f.key === key) || key === 'id' || key === 'processNode';

            Object.keys(formData).forEach(key => {
                if (isStandard(key)) {
                    standardData[key] = formData[key];
                } else if (key !== 'customData') {
                    customData[key] = formData[key];
                }
            });

            const payload = {
                ...standardData,
                customData
            };

            const res = await fetch(`${API_URL}/sites/${siteId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to save details');

            alert('Saved successfully!');
            fetchData(); // Refresh
        } catch (err) {
            alert(err.message);
        }
    };

    const handleSaveConfig = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/sites/config`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            if (!res.ok) throw new Error('Failed to save configuration');

            setIsConfigMode(false);
            alert('Configuration saved!');
        } catch (err) {
            alert(err.message);
        }
    };

    const handleFieldChange = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleLabelChange = (key, newLabel) => {
        setConfig(prev => ({
            ...prev,
            labels: { ...prev.labels, [key]: newLabel }
        }));
    };

    const addCustomField = () => {
        const name = prompt("Enter field name (system key, e.g., 'gateCode'):");
        if (!name) return;
        const label = prompt("Enter display label:", name);
        const type = prompt("Enter type (text, number, date, boolean):", "text");

        // Check if exists
        if (config.customFields.find(f => f.key === name)) {
            alert('Field already exists');
            return;
        }

        setConfig(prev => ({
            ...prev,
            customFields: [...prev.customFields, { key: name, label, type }]
        }));
    };

    if (loading) return <div className="p-4 text-white">Loading details...</div>;
    if (error) return <div className="p-4 text-red-400">Error: {error}</div>;
    if (!site) return null;

    const getLabel = (field) => {
        return config.labels[field.key] || field.label;
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-t-xl">
                    <h2 className="text-xl font-bold text-white">
                        {site.processNode?.name} <span className="text-gray-400 text-sm font-normal">({site.number || 'No Number'})</span>
                    </h2>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsConfigMode(!isConfigMode)}
                            className={`px-3 py-1 rounded text-sm transition-colors ${isConfigMode ? 'bg-yellow-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                        >
                            {isConfigMode ? 'Done Configuring' : '⚙️ Configure View'}
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Standard Fields Group */}
                    <div className="mb-6">
                        <h3 className="text-blue-400 text-sm font-bold uppercase tracking-wider mb-4 border-b border-blue-500/30 pb-2">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {STANDARD_FIELDS.map(field => (
                                <div key={field.key} className="flex flex-col gap-1">
                                    <label className="text-xs text-gray-400 uppercase font-semibold flex justify-between">
                                        {isConfigMode ? (
                                            <input
                                                type="text"
                                                value={config.labels[field.key] || field.label}
                                                onChange={(e) => handleLabelChange(field.key, e.target.value)}
                                                className="bg-black/40 border border-yellow-500/50 text-yellow-400 px-1 rounded w-full"
                                            />
                                        ) : (
                                            getLabel(field)
                                        )}
                                    </label>
                                    {field.type === 'textarea' ? (
                                        <textarea
                                            value={formData[field.key] || ''}
                                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                            className="bg-white/5 border border-white/10 rounded p-2 text-white focus:border-blue-500 focus:outline-none min-h-[80px]"
                                            disabled={isConfigMode}
                                        />
                                    ) : field.type === 'boolean' ? (
                                        <input
                                            type="checkbox"
                                            checked={!!formData[field.key]}
                                            onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                                            className="w-5 h-5 accent-blue-500"
                                            disabled={isConfigMode}
                                        />
                                    ) : (
                                        <input
                                            type={field.type === 'number' ? 'number' : 'text'}
                                            value={formData[field.key] || ''}
                                            onChange={(e) => handleFieldChange(field.key, field.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                                            className="bg-white/5 border border-white/10 rounded p-2 text-white focus:border-blue-500 focus:outline-none"
                                            disabled={isConfigMode}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Custom Fields Group */}
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-4 border-b border-purple-500/30 pb-2">
                            <h3 className="text-purple-400 text-sm font-bold uppercase tracking-wider">Custom Fields</h3>
                            {isConfigMode && (
                                <button
                                    onClick={addCustomField}
                                    className="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded"
                                >
                                    + Add Field
                                </button>
                            )}
                        </div>

                        {config.customFields && config.customFields.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {config.customFields.map(field => (
                                    <div key={field.key} className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-400 uppercase font-semibold">
                                            {isConfigMode ? (
                                                <div className="flex gap-1">
                                                    <input
                                                        type="text"
                                                        value={field.label}
                                                        onChange={(e) => {
                                                            const newFields = config.customFields.map(f => f.key === field.key ? { ...f, label: e.target.value } : f);
                                                            setConfig({ ...config, customFields: newFields });
                                                        }}
                                                        className="bg-black/40 border border-yellow-500/50 text-yellow-400 px-1 rounded w-full"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const newFields = config.customFields.filter(f => f.key !== field.key);
                                                            setConfig({ ...config, customFields: newFields });
                                                        }}
                                                        className="text-red-400 hover:text-red-300 px-1"
                                                    >
                                                        x
                                                    </button>
                                                </div>
                                            ) : (
                                                field.label
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData[field.key] || ''}
                                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                            className="bg-white/5 border border-white/10 rounded p-2 text-white focus:border-blue-500 focus:outline-none"
                                            disabled={isConfigMode}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm italic">No custom fields defined. Click "Configure View" to add some.</p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-white/5 rounded-b-xl">
                    {isConfigMode ? (
                        <button
                            onClick={handleSaveConfig}
                            className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded shadow-lg transition-colors"
                        >
                            Save Configuration
                        </button>
                    ) : (
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-lg transition-colors"
                        >
                            Save Details
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
