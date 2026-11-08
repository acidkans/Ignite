import { ArrowLeft, ChevronRight, GraduationCap, Shirt, Users } from 'lucide-react';

// @anchor mobile-subpage — ekran mobilny: pasek z tytułem i strzałką powrotu zamiast menu bocznego.
export function MobileSubpage({ title, onBack, children }) {
    return (
        <div className="flex h-full flex-col bg-gray-950 text-white">
            <div className="flex items-center gap-3 border-b border-white/5 bg-gray-900/50 px-4 py-3">
                <button onClick={onBack} className="p-2 rounded-xl bg-white/5 active:scale-90 transition-transform flex-shrink-0">
                    <ArrowLeft size={18} className="text-gray-400" />
                </button>
                <span className="font-bold text-sm">{title}</span>
            </div>
            <div className="min-h-0 flex-1">{children}</div>
        </div>
    );
}

const ITEMS = [
    { view: 'users-list', label: 'Lista użytkowników', hint: 'Pracownicy i zespoły', icon: Users, color: 'text-blue-400' },
    { view: 'trainings', label: 'Szkolenia', hint: 'Ważność szkoleń pracowników i alerty', icon: GraduationCap, color: 'text-amber-400' },
    { view: 'workwear', label: 'Ubrania robocze', hint: 'Rozmiary ubrań pracowników', icon: Shirt, color: 'text-teal-400' },
];

// @anchor mobile-users-menu — odpowiednik szuflady „Użytkownicy" z paska bocznego (tylko ADMIN).
export default function MobileUsersMenu({ onNavigate, onBack }) {
    return (
        <MobileSubpage title="Użytkownicy" onBack={onBack}>
            <div className="flex flex-col gap-3 p-4">
                {ITEMS.map(({ view, label, hint, icon: Icon, color }) => (
                    <button
                        key={view}
                        onClick={() => onNavigate(view)}
                        className="flex items-center gap-4 rounded-2xl border border-white/5 bg-gray-900/60 p-4 text-left transition-all active:scale-[0.98] active:bg-white/5"
                    >
                        <Icon size={24} className={`flex-shrink-0 ${color}`} />
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-gray-100">{label}</div>
                            <div className="mt-0.5 text-[11px] text-gray-500">{hint}</div>
                        </div>
                        <ChevronRight size={18} className="flex-shrink-0 text-gray-600" />
                    </button>
                ))}
            </div>
        </MobileSubpage>
    );
}
