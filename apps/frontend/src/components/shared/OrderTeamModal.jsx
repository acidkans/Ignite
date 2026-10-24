import { useState, useEffect, useRef } from 'react';
import { X, Users, Search, Lock, Globe, Loader2, UserPlus } from 'lucide-react';
import { API_URL } from '../../config';

const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');
const personName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.email || '—';

// @anchor order-team-modal
// Widoczność zamówienia = jego zespół (Team.orderNodeId). Ten sam modal służy przy tworzeniu
// zamówienia (`nodeId` puste — `onSubmit` dostaje wybrane osoby i tworzy zamówienie) i przy
// zmianie zespołu istniejącego (`nodeId` — wczytuje GET /process-tree/:id/team, zapisuje PUT).
// Autor/właściciel jest zawsze w zespole i nie da się go usunąć.
export default function OrderTeamModal({ nodeId = null, orderName = '', onClose, onSubmit, onSaved, submitLabel }) {
    const [members, setMembers] = useState([]);
    const [ownerId, setOwnerId] = useState(null);
    const [isPublic, setIsPublic] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const searchSeq = useRef(0);

    // Stan początkowy: istniejący zespół albo sam autor (nowe zamówienie).
    useEffect(() => {
        const headers = { Authorization: `Bearer ${token()}` };
        (async () => {
            try {
                if (nodeId) {
                    const res = await fetch(`${API_URL}/process-tree/${nodeId}/team`, { headers });
                    if (!res.ok) throw new Error(res.status === 403 ? 'Nie należysz do zespołu tego zamówienia' : 'Błąd pobierania zespołu');
                    const data = await res.json();
                    setMembers(data.members || []);
                    setOwnerId(data.ownerId);
                    setIsPublic(!!data.isPublic);
                } else {
                    const res = await fetch(`${API_URL}/users/profile`, { headers });
                    const me = res.ok ? await res.json() : null;
                    if (me?.userId) {
                        setMembers([{ id: me.userId, firstName: me.firstName, lastName: me.lastName, email: me.email }]);
                        setOwnerId(me.userId);
                    }
                }
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [nodeId]);

    // Wyszukiwarka osób — /users/suggest jest dostępne dla każdego zalogowanego.
    useEffect(() => {
        const seq = ++searchSeq.current;
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`${API_URL}/users/suggest?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token()}` } });
                const data = res.ok ? await res.json() : [];
                if (seq === searchSeq.current) setResults(Array.isArray(data) ? data : []);
            } catch { /* podpowiedzi są pomocnicze */ }
        }, 200);
        return () => clearTimeout(t);
    }, [query]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const memberIds = new Set(members.map(m => m.id));
    const candidates = results.filter(u => !memberIds.has(u.id)).slice(0, 30);
    const add = (u) => setMembers(prev => [...prev, u]);
    const remove = (id) => { if (id !== ownerId) setMembers(prev => prev.filter(m => m.id !== id)); };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const userIds = members.map(m => m.id);
            if (nodeId) {
                const res = await fetch(`${API_URL}/process-tree/${nodeId}/team`, {
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userIds, isPublic }),
                });
                if (!res.ok) throw new Error(res.status === 403 ? 'Brak uprawnień do zmiany zespołu' : 'Błąd zapisu zespołu');
                onSaved?.(await res.json());
            } else {
                await onSubmit?.({ userIds, isPublic });
            }
        } catch (e) {
            setError(e.message || 'Błąd zapisu');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-white/10">
                    <div>
                        <p className="text-[12px] uppercase tracking-widest text-gray-500 font-bold flex items-center gap-1.5"><Users size={13} /> Zespół zamówienia — kto widzi</p>
                        <h2 className="text-base font-semibold text-white mt-0.5">{orderName || 'Nowe zamówienie'}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white" title="Zamknij (Esc)"><X size={14} /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                    <p className="text-[13px] text-gray-400">Zamówienie (z WBS, zadaniami i dokumentami) widzą wyłącznie członkowie tego zespołu i administratorzy. Kontakty spoza zespołu są tylko wpisem w zamówieniu.</p>

                    {loading ? (
                        <p className="text-gray-500 text-[13px] flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Wczytywanie…</p>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-1.5">
                                {members.map(m => (
                                    <span key={m.id} className={`flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-[13px] border ${m.id === ownerId ? 'bg-blue-500/15 border-blue-400/40 text-blue-200' : 'bg-white/[0.06] border-white/10 text-gray-200'}`} title={m.email}>
                                        {personName(m)}
                                        {m.id === ownerId ? (
                                            <span className="flex items-center gap-0.5 px-1 text-[11px] text-blue-300/80"><Lock size={10} /> autor</span>
                                        ) : (
                                            <button onClick={() => remove(m.id)} className="p-0.5 rounded-full hover:bg-red-500/20 text-gray-500 hover:text-red-300" title="Usuń z zespołu"><X size={11} /></button>
                                        )}
                                    </span>
                                ))}
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 focus-within:border-blue-500/50">
                                    <Search size={13} className="text-gray-500" />
                                    <input
                                        autoFocus
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        placeholder="Dodaj osobę — szukaj po imieniu, nazwisku, e-mailu…"
                                        className="flex-1 bg-transparent text-[14px] text-white placeholder-gray-600 focus:outline-none"
                                    />
                                </label>
                                <div className="max-h-56 overflow-y-auto rounded-lg border border-white/5 divide-y divide-white/5">
                                    {candidates.length === 0 ? (
                                        <p className="px-3 py-2 text-[13px] text-gray-600 italic">Brak pasujących osób spoza zespołu.</p>
                                    ) : candidates.map(u => (
                                        <button key={u.id} onClick={() => add(u)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.05] transition-colors">
                                            <UserPlus size={13} className="text-emerald-400/70 flex-shrink-0" />
                                            <span className="text-[14px] text-gray-200 truncate">{personName(u)}</span>
                                            <span className="ml-auto text-[12px] text-gray-500 truncate">{u.company ? `${u.company} · ` : ''}{u.email}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <label className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 cursor-pointer">
                                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="mt-1" />
                                <span>
                                    <span className="flex items-center gap-1.5 text-[14px] text-white"><Globe size={13} /> Publiczne</span>
                                    <span className="block text-[12px] text-gray-500">Widoczne dla wszystkich zalogowanych. Zespół dalej służy do zadań i kontaktów.</span>
                                </span>
                            </label>
                        </>
                    )}
                    {error && <p className="text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                </div>

                <div className="flex gap-3 px-5 py-4 border-t border-white/10">
                    <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors">Anuluj</button>
                    <button
                        onClick={save}
                        disabled={saving || loading || members.length === 0}
                        className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                        {saving ? 'Zapisywanie…' : (submitLabel || 'Zapisz zespół')}
                    </button>
                </div>
            </div>
        </div>
    );
}
