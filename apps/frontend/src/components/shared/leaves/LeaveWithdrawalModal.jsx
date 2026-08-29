import { useState } from 'react';
import { warsawDayKey } from './leavesTheme';

// @anchor leave-withdrawal-modal
// Potwierdzenie wycofania zatwierdzonego urlopu — własny modal, nie window.confirm,
// bo natywne okno ma nieedytowalne „OK / Anuluj" i nie zmieści skutków decyzji.
// Trzy tryby:
//   request — pracownik prosi przełożonego o wycofanie (opcjonalny powód),
//   confirm — przełożony potwierdza wycofanie (dni wracają, wpis znika z kalendarza),
//   reject  — przełożony odmawia, urlop zostaje w mocy.
export default function LeaveWithdrawalModal({ row, mode, onCancel, onConfirm }) {
    // @anchor withdrawal-reason-state
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const name = `${row?.user?.firstName || ''} ${row?.user?.lastName || ''}`.trim();
    const okres = `${warsawDayKey(row?.dateStart)} — ${warsawDayKey(row?.dateEnd)}`;
    const rodzaj = row?.leaveType?.name || 'Urlop';

    const meta = {
        request: {
            title: 'Wycofanie zatwierdzonego urlopu',
            lead: 'Twój urlop jest zatwierdzony, więc nie możesz go usunąć samodzielnie. Prośba trafi do przełożonego — do jego decyzji urlop obowiązuje bez zmian.',
            action: 'Wyślij prośbę do przełożonego',
            accent: 'bg-orange-600 hover:bg-orange-500',
        },
        confirm: {
            title: `Wycofaj zatwierdzony urlop ${name}`,
            lead: 'Dni wrócą do puli pracownika, wpis urlopowy zostanie skasowany, a zdarzenie zniknie ze wspólnego kalendarza. Pracownik dostanie maila.',
            action: `Wycofaj zatwierdzony urlop ${name}`,
            accent: 'bg-orange-600 hover:bg-orange-500',
        },
        reject: {
            title: 'Odmowa wycofania urlopu',
            lead: 'Urlop zostaje w mocy — dni nie wrócą do puli, wpis zostaje w kalendarzu. Pracownik dostanie maila z odmową.',
            action: 'Zostaw urlop w mocy',
            accent: 'bg-gray-600 hover:bg-gray-500',
        },
    }[mode];

    const run = async () => {
        setBusy(true);
        try {
            await onConfirm(mode === 'request' ? reason.trim() : null);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
            <div
                className="w-full max-w-lg bg-gray-900 border border-white/10 rounded-xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-white/10">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500">Wnioski urlopowe</p>
                    <h2 className="text-lg font-bold text-gray-100 mt-1">{meta.title}</h2>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <div className="text-sm text-gray-300">
                        <span className="inline-flex items-center gap-2">
                            {row?.leaveType?.color && (
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.leaveType.color }} />
                            )}
                            <strong>{rodzaj}</strong>
                        </span>
                        <span className="text-gray-500"> — {okres}</span>
                        {row?.daysCount ? <span className="text-gray-500"> ({row.daysCount} dni)</span> : null}
                        {name && mode !== 'request' && <div className="text-gray-400 mt-1">{name}</div>}
                    </div>

                    <p className="text-xs text-gray-400 leading-relaxed">{meta.lead}</p>

                    {mode === 'request' && (
                        // @anchor withdrawal-reason-field
                        <label className="block">
                            <span className="text-[11px] uppercase tracking-wider text-gray-500">Powód (opcjonalnie)</span>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                                placeholder="Trafi do maila przełożonego"
                                className="mt-1 w-full bg-gray-800 border border-white/10 rounded-md px-3 py-2 text-sm text-gray-100
                                           focus:outline-none focus:border-orange-500/60 resize-y"
                            />
                        </label>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-2">
                    <button
                        onClick={onCancel}
                        disabled={busy}
                        className="px-4 py-2 rounded-md text-sm text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                        NIE, anuluj
                    </button>
                    <button
                        onClick={run}
                        disabled={busy}
                        className={`px-4 py-2 rounded-md text-sm text-white transition-colors disabled:opacity-50 ${meta.accent}`}
                    >
                        {busy ? 'Zapisywanie…' : `TAK — ${meta.action}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
