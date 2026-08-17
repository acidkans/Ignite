import React, { useState, useEffect } from 'react';
import { Briefcase, Network, AlertTriangle } from 'lucide-react';
import { getOrphanedAttachments } from '../../services/repos/outboxRepo';
import OrphanAttachmentsPanel from '../shared/OrphanAttachmentsPanel';

// @anchor mobile-home
export default function MobileHome({ onNavigate }) {
    // Zdjęcia bez rozwiązywalnego znacznika. Kafelek stoi TUTAJ, na ekranie
    // wejściowym, bo przypisywanie zdjęć nie należy do żadnego z dwóch widoków
    // niżej — a zaległości trzeba zobaczyć od razu, nie po wejściu w zadania.
    // @anchor home-orphan-count
    const [orphanCount, setOrphanCount] = useState(0);
    const [orphanPanelOpen, setOrphanPanelOpen] = useState(false);

    useEffect(() => {
        const refresh = async () => setOrphanCount((await getOrphanedAttachments()).length);
        refresh();
        const interval = setInterval(refresh, 10000);
        window.addEventListener('attachment-orphaned', refresh);
        window.addEventListener('attachment-synced', refresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener('attachment-orphaned', refresh);
            window.removeEventListener('attachment-synced', refresh);
        };
    }, []);

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white">
            <header className="px-4 py-4 border-b border-white/5 bg-gray-900/50 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-black shadow-lg shadow-blue-500/20">
                        <span className="text-[10px]">ERP</span>
                    </div>
                    <div>
                        <h1 className="font-bold text-sm">Gigatel ERP</h1>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Wybierz widok</p>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-5 flex flex-col gap-4 justify-center">
                {/* @anchor mobile-home-tile-tasks */}
                <button
                    onClick={() => onNavigate('tasks')}
                    className="bg-gray-900/60 border border-white/5 rounded-3xl p-6 active:scale-[0.97] transition-all shadow-xl hover:bg-gray-900/80 active:bg-blue-600/5 text-left relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex-shrink-0">
                            <Briefcase size={26} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="font-bold text-base text-gray-100 group-active:text-blue-400 transition-colors">Moje Zadania</h2>
                            <p className="text-[11px] text-gray-500 mt-0.5">Lista przypisanych zadań</p>
                        </div>
                    </div>
                </button>

                {/* @anchor mobile-home-tile-tree */}
                <button
                    onClick={() => onNavigate('tree')}
                    className="bg-gray-900/60 border border-white/5 rounded-3xl p-6 active:scale-[0.97] transition-all shadow-xl hover:bg-gray-900/80 active:bg-teal-600/5 text-left relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 w-40 h-40 bg-teal-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex-shrink-0">
                            <Network size={26} className="text-teal-400" />
                        </div>
                        <div>
                            <h2 className="font-bold text-base text-gray-100 group-active:text-teal-400 transition-colors">Drzewo Zamówień</h2>
                            <p className="text-[11px] text-gray-500 mt-0.5">Przeglądaj schematy zamówień</p>
                        </div>
                    </div>
                </button>

                {/* Kafelek widoczny tylko gdy jest co przypisać. */}
                {/* @anchor mobile-home-tile-orphans */}
                {orphanCount > 0 && (
                    <button
                        onClick={() => setOrphanPanelOpen(true)}
                        className="bg-red-950/40 border border-red-500/30 rounded-3xl p-6 active:scale-[0.97] transition-all shadow-xl active:bg-red-600/10 text-left relative overflow-hidden group"
                    >
                        <div className="absolute top-0 right-0 w-40 h-40 bg-red-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 flex-shrink-0 relative">
                                <AlertTriangle size={26} className="text-red-400" />
                                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                                    {orphanCount}
                                </span>
                            </div>
                            <div>
                                <h2 className="font-bold text-base text-gray-100 group-active:text-red-400 transition-colors">Niewysłane zdjęcia</h2>
                                <p className="text-[11px] text-gray-500 mt-0.5">Przypisz do znaczników, żeby poszły na serwer</p>
                            </div>
                        </div>
                    </button>
                )}
            </main>

            {orphanPanelOpen && (
                <OrphanAttachmentsPanel
                    onClose={() => setOrphanPanelOpen(false)}
                    onAssigned={async () => setOrphanCount((await getOrphanedAttachments()).length)}
                />
            )}
        </div>
    );
}
