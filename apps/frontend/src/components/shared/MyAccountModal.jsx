import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserCircle } from 'lucide-react';
import MsAccountPanel from './MsAccountPanel';

// @anchor my-account-modal
// „Moje konto" — otwierane kliknięciem w „Zalogowany jako" w stopce paska bocznego.
// Na razie: kto jest zalogowany + połączenie z kontem Microsoft. Portal do body — pasek boczny
// tworzy własny kontekst pozycjonowania, w którym `fixed inset-0` ściskał okno do jego szerokości.
export default function MyAccountModal({ userLabel, oauthResult, onClose }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1119] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-white/10">
                    <div className="flex items-center gap-2 min-w-0">
                        <UserCircle size={18} className="text-gray-400 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[12px] uppercase tracking-widest text-gray-300 font-bold">Moje konto</p>
                            <p className="text-sm text-white truncate">{userLabel}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white" title="Zamknij (Esc)"><X size={14} /></button>
                </div>
                <div className="px-5 py-4">
                    <MsAccountPanel oauthResult={oauthResult} />
                </div>
            </div>
        </div>,
        document.body
    );
}
