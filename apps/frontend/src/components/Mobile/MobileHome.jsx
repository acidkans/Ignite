import { Briefcase, Network } from 'lucide-react';

// @anchor mobile-home
export default function MobileHome({ onNavigate }) {
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
            </main>
        </div>
    );
}
