import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Phone, Mail } from 'lucide-react';
import { shortCompanyName } from './wbs/realizationShared';

const inputCls = 'w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[15px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50';
const labelCls = 'text-[12px] font-bold uppercase tracking-widest text-gray-500 mb-1 block ml-1';
const iconCls = 'absolute left-3 top-1/2 -translate-y-1/2 text-gray-500';

// @anchor new-contact-modal — nowy kontakt zamówienia: nic nie trafia na listę, dopóki użytkownik
// nie zapisze; `id` powstaje od razu, bo pod nim `lookupNip` trzyma status NIP-u, który po zapisie
// zostaje widoczny przy wierszu kontaktu. Bez zamykania kliknięciem w tło — to formularz i
// przypadkowe kliknięcie obok kasowałoby wpisane dane.
export default function NewContactModal({ suggestUsers, lookupNip, renderNipStatus, onSubmit, onClose }) {
    const [id] = useState(() => crypto.randomUUID());
    const [draft, setDraft] = useState({ name: '', role: '', company: '', nip: '', phone: '', email: '' });
    const [suggestions, setSuggestions] = useState([]);
    const [saving, setSaving] = useState(false);
    const nipCheck = useRef({ nip: '', promise: null, firma: null });

    const set = (field) => (e) => setDraft(prev => ({ ...prev, [field]: e.target.value }));

    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            if (suggestions.length) setSuggestions([]);
            else onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, suggestions.length]);

    const handleNameChange = (e) => {
        setDraft(prev => ({ ...prev, name: e.target.value }));
        setSuggestions(suggestUsers(e.target.value));
    };

    const pickUser = (user) => {
        setDraft(prev => ({
            ...prev,
            name: [user.firstName, user.lastName].filter(Boolean).join(' '),
            email: user.email || prev.email,
            company: user.company ?? prev.company,
            phone: user.phone ?? prev.phone,
        }));
        setSuggestions([]);
    };

    // Jedno sprawdzenie na numer: blur pola NIP i klik „Zapisz" idą zaraz po sobie, a Enter w polu
    // NIP nie wywołuje blur — zapis czeka na wynik, żeby firma trafiła do rejestru i do kontaktu.
    const checkNip = (value) => {
        const nip = String(value || '').replace(/\D/g, '');
        if (nipCheck.current.nip === nip) return nipCheck.current.promise;
        const check = { nip, promise: null, firma: null };
        nipCheck.current = check;
        check.promise = lookupNip(id, nip, (firma) => {
            check.firma = firma;
            setDraft(prev => ({ ...prev, nip: firma?.nip || prev.nip, company: prev.company || shortCompanyName(firma?.name) || '' }));
        });
        return check.promise;
    };

    const canSave = draft.name.trim().length > 0 && !saving;

    const submit = async (e) => {
        e.preventDefault();
        if (!canSave) return;
        setSaving(true);
        await checkNip(draft.nip);
        const { firma } = nipCheck.current;
        onSubmit({
            id,
            name: draft.name.trim(),
            role: draft.role.trim(),
            company: draft.company.trim() || shortCompanyName(firma?.name) || '',
            nip: firma?.nip || draft.nip.trim(),
            phone: draft.phone.trim(),
            email: draft.email.trim(),
        });
    };

    return createPortal(
        <div className="fixed inset-0 z-[140] flex overflow-y-auto p-4 bg-black/70 backdrop-blur-sm">
            <form onSubmit={submit} noValidate className="m-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <h2 className="text-base font-semibold text-white flex items-center gap-2"><UserPlus size={16} className="text-blue-400" /> Nowy kontakt</h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white" title="Zamknij (Esc)"><X size={14} /></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 px-5 py-4">
                    <div className="relative">
                        <label className={labelCls}>Imię i nazwisko *</label>
                        <input autoFocus type="text" value={draft.name} onChange={handleNameChange} onBlur={() => setSuggestions([])} autoComplete="off" className={inputCls} />
                        {suggestions.length > 0 && (
                            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                                {suggestions.map(u => (
                                    <button key={u.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickUser(u); }} className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0">
                                        <div className="text-[13px] text-gray-200">{[u.firstName, u.lastName].filter(Boolean).join(' ')}</div>
                                        <div className="text-[11px] text-gray-500">{u.email}{u.company ? ` · ${u.company}` : ''}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className={labelCls}>Rola</label>
                        <input type="text" value={draft.role} onChange={set('role')} placeholder="np. Inżynier" className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>Firma</label>
                        <input type="text" value={draft.company} onChange={set('company')} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>NIP</label>
                        <input
                            type="text"
                            value={draft.nip}
                            onChange={set('nip')}
                            onBlur={(e) => checkNip(e.target.value)}
                            placeholder="10 cyfr"
                            title="Po wpisaniu NIP-u dane firmy pobiorą się z Białej listy VAT i zapiszą w rejestrze firm"
                            className={inputCls}
                        />
                        {renderNipStatus(id)}
                    </div>
                    <div>
                        <label className={labelCls}>Telefon</label>
                        <div className="relative">
                            <Phone size={12} className={iconCls} />
                            <input type="text" value={draft.phone} onChange={set('phone')} placeholder="+48..." className={`${inputCls} pl-9`} />
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}>E-mail</label>
                        <div className="relative">
                            <Mail size={12} className={iconCls} />
                            <input type="email" value={draft.email} onChange={set('email')} placeholder="example@..." className={`${inputCls} pl-9`} />
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 px-5 py-4 border-t border-white/10">
                    <button type="button" onClick={onClose} disabled={saving} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors">Anuluj</button>
                    <button type="submit" disabled={!canSave} className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg disabled:opacity-50">
                        {saving ? 'Zapisywanie…' : 'Zapisz kontakt'}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
}
