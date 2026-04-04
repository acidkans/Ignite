import React, { useState, useEffect } from 'react';
import {
    Clock, CheckCircle, AlertCircle, ChevronRight,
    LogOut, Briefcase, ChevronLeft, Info, Map as MapIcon,
    Calendar, User, FileText, ExternalLink, MapPin
} from 'lucide-react';
import { API_URL } from '../../config';
import SchematicViewer from '../shared/SchematicViewer';

export default function MobileDashboard({ onLogout }) {
    const [subtasks, setSubtasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSubtask, setSelectedSubtask] = useState(null);
    const [activeTab, setActiveTab] = useState('details'); // 'details' | 'schematics'

    useEffect(() => {
        const fetchSubtasks = async () => {
            try {
                const token = sessionStorage.getItem('token');
                const res = await fetch(`${API_URL}/subtasks/assigned/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setSubtasks(data);
                }
            } catch (err) {
                console.error('Failed to fetch assigned subtasks:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchSubtasks();
    }, []);

    const getStatusIcon = (status) => {
        switch (status) {
            case 'DONE': return <CheckCircle size={18} className="text-emerald-400" />;
            case 'IN_PROGRESS': return <Clock size={18} className="text-blue-400" />;
            default: return <AlertCircle size={18} className="text-gray-400" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'DONE': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'IN_PROGRESS': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-950">
                <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    // --- Detail View Rendering ---
    if (selectedSubtask) {
        return (
            <div className="flex flex-col h-screen bg-gray-950 text-white animate-in fade-in slide-in-from-right-4 duration-300">
                {/* Header with Back Button */}
                <header className="px-4 py-3 flex items-center gap-3 border-b border-white/5 bg-gray-900/80 backdrop-blur-xl sticky top-0 z-30">
                    <button
                        onClick={() => {
                            setSelectedSubtask(null);
                            setActiveTab('details');
                        }}
                        className="p-2 -ml-2 rounded-full hover:bg-white/5 text-gray-400 active:scale-90 transition-transform"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="font-bold text-sm truncate text-gray-100">{selectedSubtask.name}</h1>
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-bold">Szczegóły Zadania</span>
                    </div>
                </header>

                {/* Tab Switcher */}
                <div className="flex p-1 bg-white/5 mx-4 mt-4 rounded-xl border border-white/5 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold transition-all ${activeTab === 'details' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-500'}`}
                    >
                        <Info size={12} /> Szczegóły
                    </button>
                    <button
                        onClick={() => setActiveTab('schematics')}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold transition-all ${activeTab === 'schematics' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-500'}`}
                    >
                        <MapIcon size={12} /> Schemat
                    </button>
                </div>

                {/* Content Area */}
                <main className="flex-1 overflow-hidden p-4 min-h-0 flex flex-col">
                    {activeTab === 'details' ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 overflow-y-auto flex-1 min-h-0">
                            {/* Status Card */}
                            <div className="bg-gray-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between shadow-xl">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-xl ${getStatusColor(selectedSubtask.status)} font-bold`}>
                                        {getStatusIcon(selectedSubtask.status)}
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Status</div>
                                        <div className="text-sm font-bold">{selectedSubtask.status}</div>
                                    </div>
                                </div>
                                {selectedSubtask.geoCoords && (
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${selectedSubtask.geoCoords.lat},${selectedSubtask.geoCoords.lng}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 active:scale-95 transition-transform"
                                    >
                                        <MapPin size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-wide">Nawiguj</span>
                                    </a>
                                )}
                            </div>

                            {/* Description Section */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-gray-500 px-1">
                                    <FileText size={14} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Opis Zadania</span>
                                </div>
                                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-xs text-gray-300 leading-relaxed shadow-inner">
                                    {selectedSubtask.description || 'Brak opisu dla tego zadania.'}
                                </div>
                            </div>

                            {/* Node/Project Info */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-gray-500 px-1">
                                    <Briefcase size={14} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Projekt / Zlecenie</span>
                                </div>
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between active:bg-white/10 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-blue-400">{selectedSubtask.node?.name || '---'}</span>
                                        <span className="text-[10px] text-gray-500">{selectedSubtask.node?.customTypeLabel || selectedSubtask.node?.type}</span>
                                    </div>
                                    <ExternalLink size={14} className="text-gray-600" />
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="bg-white/2 p-3 rounded-2xl border border-white/5">
                                    <Calendar size={14} className="text-gray-600 mb-1" />
                                    <div className="text-[9px] text-gray-500 uppercase font-bold pr-1">Utworzono</div>
                                    <div className="text-[11px] font-medium truncate">
                                        {new Date(selectedSubtask.createdAt).toLocaleDateString('pl-PL')}
                                    </div>
                                </div>
                                <div className="bg-white/2 p-3 rounded-2xl border border-white/5">
                                    <User size={14} className="text-gray-600 mb-1" />
                                    <div className="text-[9px] text-gray-500 uppercase font-bold truncate">Opiekun</div>
                                    <div className="text-[11px] font-medium truncate">Zalogowany</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 w-full bg-gray-900 rounded-3xl overflow-hidden animate-in zoom-in-95 duration-300 shadow-2xl border border-white/5">
                            <SchematicViewer
                                subtaskId={selectedSubtask.id}
                                nodeId={selectedSubtask.nodeId}
                            />
                        </div>
                    )}
                </main>
            </div>
        );
    }

    // --- List View Rendering ---
    return (
        <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
            {/* Header */}
            <header className="px-6 py-4 flex items-center gap-3 border-b border-white/5 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-10 shadow-lg">
                <button
                    onClick={onLogout}
                    className="p-2.5 rounded-full bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-all active:scale-90 flex-shrink-0"
                    title="Wyloguj"
                >
                    <LogOut size={20} className="scale-x-[-1]" />
                </button>
                <div className="flex items-center gap-3 flex-1">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-black shadow-lg shadow-blue-500/20">
                        <span className="text-xs">ERP</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-base leading-none">Moje Zadania</span>
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1 animate-pulse">Na żywo</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {subtasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500 space-y-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                            <Briefcase size={32} className="opacity-20 text-blue-400" />
                        </div>
                        <p className="font-medium text-sm">Brak przypisanych zadań</p>
                    </div>
                ) : (
                    subtasks.map((task, idx) => (
                        <div
                            key={task.id}
                            style={{ animationDelay: `${idx * 50}ms` }}
                            onClick={() => setSelectedSubtask(task)}
                            className="bg-gray-900/60 border border-white/5 rounded-3xl p-5 active:scale-[0.97] transition-all shadow-xl hover:bg-gray-900/80 active:bg-blue-600/5 cursor-pointer relative overflow-hidden group animate-in slide-in-from-bottom-4 duration-500"
                        >
                            {/* Decorative gradient overlay */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10" />

                            <div className="flex justify-between items-start mb-3 relative z-10">
                                <div className="flex items-center gap-3 pr-2">
                                    <div className={`p-2 rounded-xl ${getStatusColor(task.status)}`}>
                                        {getStatusIcon(task.status)}
                                    </div>
                                    <span className="font-bold text-sm text-gray-100 group-active:text-blue-400 transition-colors leading-tight">{task.name}</span>
                                </div>
                                <ChevronRight size={18} className="text-gray-700 group-active:translate-x-1 transition-transform" />
                            </div>

                            <p className="text-xs text-gray-500 line-clamp-2 mb-4 px-1 leading-relaxed">
                                {task.description || 'Brak opisu dla tego zadania. Rozpocznij pracę, aby zobaczyć szczegóły.'}
                            </p>

                            <div className="flex items-center justify-between pt-4 border-t border-white/5 relative z-10">
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-gray-600 uppercase font-black tracking-widest mb-0.5">Projekt</span>
                                    <span className="text-xs text-blue-400/80 font-bold">{task.node?.name || '---'}</span>
                                </div>
                                <div className={`text-[9px] px-2.5 py-1 rounded-lg border font-black tracking-tighter ${getStatusColor(task.status)}`}>
                                    {task.status}
                                </div>
                            </div>
                            {task.geoCoords && (
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${task.geoCoords.lat},${task.geoCoords.lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 active:scale-95 transition-transform relative z-10"
                                >
                                    <MapPin size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Nawiguj do lokalizacji</span>
                                </a>
                            )}
                        </div>
                    ))
                )}
            </main>

            {/* Bottom Nav Placeholder */}
            <nav className="h-20 pb-4 border-t border-white/5 bg-gray-950/80 backdrop-blur-2xl flex items-center justify-around px-8 flex-shrink-0 z-10">
                <div className="flex flex-col items-center gap-1.5 text-blue-500 relative">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full absolute -top-3 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                    <Briefcase size={22} className="drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Zadania</span>
                </div>
            </nav>
        </div>
    );
}
