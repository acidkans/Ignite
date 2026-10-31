import { useState, useEffect } from 'react';
import { X, Save, FileText, ChevronDown, MapPin, Info } from 'lucide-react';
import { API_URL } from '../../config';
import SchematicViewer from './SchematicViewer';
import TaskTimePicker, { DEFAULT_TASK_TIME, snapTaskTime } from './wbs/TaskTimePicker';

const SUBTASK_OPTION_STYLE = { backgroundColor: '#0f1520', color: '#e5e7eb' };
const pad2 = (n) => String(n).padStart(2, '0');

// @anchor subtask-split-date-time
// Termin podzadania → { date, time } w czasie lokalnym. Stare podzadania zapisywane jako sama data
// mają północ UTC, a klik w dzień kalendarza daje północ lokalną — obie traktujemy jako „bez godziny”
// i proponujemy domyślne 8:00.
const splitDateTime = (iso) => {
    if (!iso) return { date: '', time: DEFAULT_TASK_TIME };
    const d = new Date(iso);
    if (String(iso).length <= 10 || d.toISOString().endsWith('T00:00:00.000Z')) {
        return { date: new Date(iso).toISOString().slice(0, 10), time: DEFAULT_TASK_TIME };
    }
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    if (d.getHours() === 0 && d.getMinutes() === 0) return { date, time: DEFAULT_TASK_TIME };
    return { date, time: snapTaskTime(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`) };
};

// @anchor subtask-join-date-time — data + godzina → ISO; bez godziny zostaje sama data jak dotąd
const joinDateTime = (date, time) => (date ? (time ? new Date(`${date}T${time}:00`).toISOString() : date) : '');

// @anchor open-date-picker
// Klik w dowolne miejsce pola daty otwiera kalendarz (domyślnie tylko ikona go otwiera).
// showPicker rzuca wyjątek bez gestu użytkownika / w starszych przeglądarkach — wtedy zostaje zwykłe pole.
const openDatePicker = (e) => { try { e.currentTarget.showPicker?.(); } catch { /* brak wsparcia */ } };

export default function SubtaskModal({ nodeId, versionId, subtask, onClose, onSuccess }) {
    const [templates, setTemplates] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: subtask?.name || '',
        description: subtask?.description || '',
        status: subtask?.status || 'NEW',
        visibilityType: subtask?.visibilityType || 'ALL',
        assignedUserId: subtask?.assignedUserId || '',
        plannedStart: splitDateTime(subtask?.plannedStart).date,
        plannedEnd: splitDateTime(subtask?.plannedEnd).date,
        // @anchor subtask-start-time — godzina rozpoczęcia (domyślnie 8:00, co 30 min)
        startTime: splitDateTime(subtask?.plannedStart).time,
        // @anchor subtask-end-time
        endTime: splitDateTime(subtask?.plannedEnd).time,
        saveAsTemplate: false
    });

    const [activeTab, setActiveTab] = useState('info'); // 'info' or 'schemat'

    useEffect(() => {
        const fetchInitialData = async () => {
            const token = sessionStorage.getItem('token');
            try {
                // Fetch templates
                const tRes = await fetch(`${API_URL}/subtasks/templates`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (tRes.ok) setTemplates(await tRes.json());

                // Fetch users
                const uRes = await fetch(`${API_URL}/users`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (uRes.ok) setUsers(await uRes.json());
            } catch (err) {
                console.error('Error fetching modal data:', err);
            }
        };
        fetchInitialData();
    }, []);

    const handleTemplateSelect = (template) => {
        setFormData(prev => ({
            ...prev,
            name: template.name,
            description: template.description || prev.description
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const isEdit = subtask?.id;
            const url = isEdit ? `${API_URL}/subtasks/${subtask.id}` : `${API_URL}/subtasks`;
            const method = isEdit ? 'PATCH' : 'POST';

            const { startTime, endTime, ...rest } = formData;
            const payload = { ...rest, plannedStart: joinDateTime(rest.plannedStart, startTime), plannedEnd: joinDateTime(rest.plannedEnd, endTime), nodeId, versionId };
            if (!payload.assignedUserId) payload.assignedUserId = null;
            if (isEdit) {
                delete payload.saveAsTemplate;
                delete payload.versionId;
            }

            const res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json();
                alert(data.message || 'Wystąpił błąd');
            }
        } catch (err) {
            alert('Błąd połączenia z serwerem');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] block md:flex md:items-center md:justify-center md:p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="bg-gray-900 border-none md:border border-white/10 w-full min-h-[100dvh] md:min-h-0 md:h-auto md:max-w-2xl rounded-none md:rounded-2xl shadow-2xl flex flex-col md:max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                            <FileText size={20} />
                        </div>
                        <h3 className="text-xl font-bold text-white">
                            {subtask ? 'Edytuj zadanie' : 'Nowe zadanie'}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                {subtask && (
                    <div className="px-6 flex border-b border-white/5 bg-white/[0.01] shrink-0">
                        <button
                            onClick={() => setActiveTab('info')}
                            className={`px-6 py-3 text-[10px] font-bold uppercase tracking-widest transition-all relative ${activeTab === 'info' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <div className="flex items-center gap-2">
                                <Info size={14} /> Informacje
                            </div>
                            {activeTab === 'info' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('schemat')}
                            className={`px-6 py-3 text-[10px] font-bold uppercase tracking-widest transition-all relative ${activeTab === 'schemat' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <div className="flex items-center gap-2">
                                <MapPin size={14} /> Schemat i Znaczniki
                            </div>
                            {activeTab === 'schemat' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
                        </button>
                    </div>
                )}

                <div className="flex-1 flex flex-col min-h-0 relative">
                    {activeTab === 'info' ? (
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    {!subtask && templates.length > 0 && (
                        <div className="mb-8">
                            <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-2">Użyj szablonu</label>
                            <div className="grid grid-cols-2 gap-2">
                                {templates.map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => handleTemplateSelect(t)}
                                        className="text-left px-3 py-2 bg-white/5 border border-white/5 hover:border-blue-500/50 rounded-lg text-xs transition-all flex items-center justify-between group"
                                    >
                                        <span className="truncate pr-2">{t.name}</span>
                                        <ChevronDown size={12} className="text-gray-600 group-hover:text-blue-400" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-0">
                        <div className="px-4 py-4 bg-white/[0.02] border-b border-white/5">
                            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-tight">Nazwa zadania</label>
                            <input
                                required
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all font-medium"
                                placeholder="Wpisz nazwę zadania..."
                            />
                        </div>

                        <div className="px-4 py-4 bg-white/[0.05] border-b border-white/5">
                            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-tight">Komentarz (opcjonalnie)</label>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all min-h-[100px] resize-none"
                                placeholder="Np. lista: - punkt (Enter = nowa linia)"
                            />
                        </div>

                        <div className="px-4 py-4 bg-white/[0.02] border-b border-white/5 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-tight">Status</label>
                                <select
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all"
                                >
                                    <option value="NEW">Nowy</option>
                                    <option value="PLANNED">Zaplanowany</option>
                                    <option value="STARTED">W trakcie</option>
                                    <option value="FINISHED">Zakończony</option>
                                    <option value="ON_HOLD">Wstrzymany</option>
                                    <option value="CANCELLED">Anulowany</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-tight">Widoczność</label>
                                <select
                                    value={formData.visibilityType}
                                    onChange={e => setFormData({ ...formData, visibilityType: e.target.value })}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all"
                                >
                                    <option value="ALL">Wszyscy (Pracownik + Manager + Logistyk)</option>
                                    <option value="MANAGER_ONLY">Tylko Manager</option>
                                    <option value="LOGISTYK_ONLY">Tylko Logistyk</option>
                                    <option value="MANAGER_LOGISTYK">Manager + Logistyk</option>
                                </select>
                            </div>
                        </div>

                        <div className="px-4 py-4 bg-white/[0.05] border-b border-white/5 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-tight">Data rozpoczęcia</label>
                                <input
                                    type="date"
                                    value={formData.plannedStart}
                                    onChange={e => {
                                        const newStart = e.target.value;
                                        setFormData(prev => ({
                                            ...prev,
                                            plannedStart: newStart,
                                            plannedEnd: prev.plannedEnd && newStart > prev.plannedEnd ? newStart : prev.plannedEnd,
                                        }));
                                    }}
                                    onClick={openDatePicker}
                                    className="w-full cursor-pointer [color-scheme:dark] bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-sm"
                                />
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="text-[11px] text-gray-500 uppercase tracking-tight">Godzina</span>
                                    <TaskTimePicker value={formData.startTime} onChange={v => setFormData(prev => ({ ...prev, startTime: v }))} disabled={!formData.plannedStart} optionStyle={SUBTASK_OPTION_STYLE} className="flex-1 [color-scheme:dark] bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-tight">Data zakończenia</label>
                                <input
                                    type="date"
                                    value={formData.plannedEnd}
                                    onChange={e => setFormData({ ...formData, plannedEnd: e.target.value })}
                                    onClick={openDatePicker}
                                    className="w-full cursor-pointer [color-scheme:dark] bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-sm"
                                />
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="text-[11px] text-gray-500 uppercase tracking-tight">Godzina</span>
                                    <TaskTimePicker value={formData.endTime} onChange={v => setFormData(prev => ({ ...prev, endTime: v }))} disabled={!formData.plannedEnd} optionStyle={SUBTASK_OPTION_STYLE} className="flex-1 [color-scheme:dark] bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-sm" />
                                </div>
                            </div>
                        </div>

                        <div className="px-4 py-4 bg-white/[0.02] border-b border-white/5">
                            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-tight">Przypisz do użytkownika</label>
                            <select
                                value={formData.assignedUserId}
                                onChange={e => setFormData({ ...formData, assignedUserId: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all"
                            >
                                <option value="">--- Wybierz użytkownika ---</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
                                ))}
                            </select>
                        </div>

                        {!subtask && (
                            <label className="flex items-center gap-3 cursor-pointer group px-4 py-4 bg-white/[0.05]">
                                <input
                                    type="checkbox"
                                    checked={formData.saveAsTemplate}
                                    onChange={e => setFormData({ ...formData, saveAsTemplate: e.target.checked })}
                                    className="w-5 h-5 rounded border-white/10 bg-black/40 text-blue-600 focus:ring-blue-500 transition-all"
                                />
                                <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors">Zapisz jako stały szablon</span>
                            </label>
                        )}
                    </div>
                </form>
                    ) : (
                        <div className="flex-1 flex flex-col min-h-0 p-0 md:p-6 md:overflow-hidden">
                            <SchematicViewer nodeId={nodeId} subtaskId={subtask.id} />
                        </div>
                    )}
                </div>

                {/* Footer */}
                {/* Footer */}
                <div className={`p-4 md:p-6 border-t border-white/5 gap-3 justify-end bg-slate-900 z-50 shrink-0 ${activeTab === 'schemat' ? 'hidden md:flex' : 'flex'}`}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-colors"
                    >
                        {activeTab === 'info' ? 'Anuluj' : 'Zamknij'}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !formData.name}
                        className={`px-8 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl text-sm font-bold text-white flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transform transition-all active:scale-95 ${activeTab !== 'info' ? 'hidden md:flex' : ''}`}
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            <Save size={18} />
                        )}
                        <span>{subtask ? 'Zapisz zmiany' : 'Utwórz zadanie'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
