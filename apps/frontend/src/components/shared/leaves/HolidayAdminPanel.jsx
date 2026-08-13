import { API_URL } from '../../../config';
import { useCallback, useEffect, useState } from 'react';

// @anchor holiday-admin-panel
// Zarządzanie dniami wolnymi za święta — WYŁĄCZNIE dla administratora.
// Zatwierdzanie i cofanie decyzji per dzień oraz dodanie własnego dnia,
// gdy kalendarz świąt nie pokrywa przypadku.
export default function HolidayAdminPanel({ onChanged }) {
    const thisYear = new Date().getFullYear();
    const [year, setYear] = useState(thisYear);
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [customDate, setCustomDate] = useState('');
    const [customName, setCustomName] = useState('');

    const authHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionStorage.getItem('token')}`,
    });

    // @anchor holiday-admin-load
    const load = useCallback(async (y) => {
        try {
            const res = await fetch(`${API_URL}/leaves/holidays?year=${y}`, { headers: authHeaders() });
            if (!res.ok) throw new Error(`Błąd pobierania (${res.status})`);
            setData(await res.json());
            setError(null);
        } catch (err) {
            setError(err.message);
        }
    }, []);

    useEffect(() => { load(year); }, [year, load]);

    const apply = async (fn) => {
        setBusy(true);
        setError(null);
        try {
            const fresh = await fn();
            setData(fresh);
            onChanged?.(fresh);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    // @anchor holiday-admin-toggle
    /// Zatwierdzenie i cofnięcie idą tą samą ścieżką — wysyłamy komplet zatwierdzonych dat.
    const toggle = (date) => apply(async () => {
        const approvedNow = new Set((data?.items || []).filter(i => i.approved).map(i => i.date));
        if (approvedNow.has(date)) approvedNow.delete(date); else approvedNow.add(date);
        const res = await fetch(`${API_URL}/leaves/holidays`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ year, dates: [...approvedNow] }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Błąd zapisu (${res.status})`);
        return res.json();
    });

    // @anchor holiday-admin-add-custom
    const addCustom = () => apply(async () => {
        if (!customDate) throw new Error('Podaj datę własnego dnia wolnego.');
        const res = await fetch(`${API_URL}/leaves/holidays/custom`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ date: customDate, name: customName || undefined }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Błąd zapisu (${res.status})`);
        const fresh = await res.json();
        setCustomDate('');
        setCustomName('');
        if (fresh.year !== year) setYear(fresh.year);
        return fresh;
    });

    // @anchor holiday-admin-remove-custom
    const removeCustom = (date) => apply(async () => {
        const res = await fetch(`${API_URL}/leaves/holidays/custom?date=${date}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Błąd usuwania (${res.status})`);
        return res.json();
    });

    const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <label className="text-[11px] text-gray-500 uppercase tracking-wider">rok</label>
                <select
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="ml-auto text-[11px] text-gray-500">
                    zatwierdzonych: <span className="text-yellow-300 font-semibold">{data?.approvedDays ?? 0}</span>
                </span>
            </div>

            {error && <div className="p-2 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-xs">{error}</div>}

            {/* @anchor holiday-admin-list */}
            <div className="flex flex-col">
                {(data?.items || []).map(i => (
                    <div key={i.date} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-b-0">
                        <span className="text-sm text-gray-200 w-24 shrink-0">{i.date}</span>
                        <span className="text-xs text-gray-400 flex-1 truncate" title={i.name}>
                            {i.name}{i.custom ? ' · dzień własny' : ''}
                        </span>
                        <button
                            onClick={() => toggle(i.date)}
                            disabled={busy}
                            className={`text-[11px] px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
                                i.approved
                                    ? 'bg-green-500/15 border-green-500/30 text-green-300 hover:bg-green-500/30'
                                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                            }`}
                            title={i.approved ? 'Cofnij zatwierdzenie' : 'Zatwierdź dzień wolny'}
                        >
                            {i.approved ? '✓ zatwierdzony — cofnij' : 'zatwierdź'}
                        </button>
                        {i.custom && (
                            <button
                                onClick={() => removeCustom(i.date)}
                                disabled={busy}
                                className="text-[11px] px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/30 text-red-400 border border-red-500/20 transition-colors disabled:opacity-50"
                                title="Usuń dzień dodany ręcznie"
                            >
                                🗑️
                            </button>
                        )}
                    </div>
                ))}
                {data && !data.items?.length && (
                    <p className="text-sm text-gray-500">Brak dni wolnych w {year} roku — dodaj własny poniżej.</p>
                )}
            </div>

            {/* @anchor holiday-admin-custom-form */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                <input
                    type="date"
                    value={customDate}
                    onChange={e => setCustomDate(e.target.value)}
                    className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-yellow-500/50"
                />
                <input
                    type="text"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="opis (opcjonalnie)"
                    className="flex-1 min-w-[140px] bg-gray-800 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50"
                />
                <button
                    onClick={addCustom}
                    disabled={busy || !customDate}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-200 border border-yellow-500/30 transition-colors disabled:opacity-50"
                    title="Dodaj własny dzień wolny i od razu go zatwierdź"
                >
                    + Dodaj własny dzień
                </button>
            </div>
        </div>
    );
}
