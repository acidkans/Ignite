import { useCallback, useEffect, useState } from 'react';
import { fmtDay, trainingsApi, ORDER_STAGE_LABEL } from './trainingsShared';
import { BTN, BTN_PRIMARY, INPUT, LABEL } from './TrainingsUi';

const TRYBY = [
    { id: 'PROGI', label: 'przy progach: próg / 7 / 1 dzień i w dniu wygaśnięcia' },
    { id: 'DAILY', label: 'codziennie, dopóki problem trwa' },
    { id: 'ONCE', label: 'tylko raz na dane szkolenie' },
];
const STATUS_RUN = { SENT: 'wysłano', SKIPPED: 'pominięto — nic nowego', ERROR: 'błąd', TEST: 'test (do mnie)' };

// @anchor training-alerts-tab — ustawienia codziennego maila do ADMIN-ów, podgląd dzisiejszej
// wysyłki (ten sam HTML, który pójdzie) i historia przebiegów. Zmiana ustawienia zapisuje się
// od razu i odświeża podgląd.
export default function TrainingAlertsTab({ toast, reloadSignal }) {
    const [settings, setSettings] = useState(null);
    const [preview, setPreview] = useState(null);
    const [runs, setRuns] = useState([]);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const [s, p, r] = await Promise.all([trainingsApi('/alerts/settings'), trainingsApi('/alerts/preview'), trainingsApi('/alerts/runs')]);
            setSettings(s); setPreview(p); setRuns(r); setError('');
        } catch (e) { setError(e.message); }
    }, []);
    useEffect(() => { load(); }, [load, reloadSignal]);

    const zapisz = async (patch) => {
        setSettings(s => ({ ...s, ...patch }));
        try {
            setSettings(await trainingsApi('/alerts/settings', { method: 'PATCH', body: patch }));
            setPreview(await trainingsApi('/alerts/preview'));
        } catch (e) { toast(`Nie zapisano ustawień: ${e.message}`, true); load(); }
    };

    const akcja = async (rodzaj) => {
        setBusy(rodzaj);
        try {
            if (rodzaj === 'test') {
                const r = await trainingsApi('/alerts/send-test', { method: 'POST' });
                toast(`Wysłano test na ${r.to}`);
            } else {
                const r = await trainingsApi('/alerts/run', { method: 'POST' });
                toast(r.status === 'SENT' ? `Wysłano do ${r.recipients} adminów` : r.status === 'SKIPPED' ? 'Nic nowego do wysłania — progi z dzisiejszych pozycji już poszły' : `Błąd wysyłki: ${r.error}`, r.status === 'ERROR');
            }
        } catch (e) { toast(e.message, true); }
        setBusy('');
        load();
    };

    if (error) return <div className="text-sm text-red-400">{error}</div>;
    if (!settings || !preview) return <div className="text-sm text-gray-500">Ładowanie…</div>;

    const ile = (k) => preview.items.filter(i => i.kind === k).length;
    const nowe = preview.items.filter(i => i.isNew).length;

    return (
        <div className="grid items-start gap-4 xl:grid-cols-[380px_1fr]">
            <section className="rounded-lg border border-white/[.07] bg-[#0a1120] p-4">
                <h3 className="text-sm font-bold text-gray-100">Reguła wysyłki</h3>
                <p className="mb-3 mt-1.5 text-xs text-gray-400">
                    Codziennie o <b className="text-gray-200">{String(settings.hour).padStart(2, '0')}:00</b> system sprawdza pracowników
                    przypisanych do <b className="text-gray-200">aktywnych zamówień</b>. Jeśli szkolenie wymagane przez zamówienie kończy się
                    w ciągu progu albo już wygasło, ADMIN-i dostają jeden zbiorczy mail. Zamówienia zamknięte — wszystkie pozycje
                    odebrane protokołem lub zafakturowane — są pomijane.
                </p>
                <label className="flex min-h-[36px] items-center gap-2 text-sm text-gray-200">
                    <input type="checkbox" checked={settings.enabled} onChange={e => zapisz({ enabled: e.target.checked })} className="h-4 w-4 accent-teal-500" />
                    Wysyłka włączona
                </label>
                <div className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Aktywne zamówienia = etap</div>
                <div className="flex flex-wrap gap-1.5">
                    {settings.allStages.map(st => {
                        const on = settings.stages.includes(st);
                        return (
                            <button key={st} onClick={() => zapisz({ stages: on ? settings.stages.filter(x => x !== st) : [...settings.stages, st] })}
                                className={`min-h-[34px] rounded-full border px-3 text-[11px] ${on ? 'border-teal-500 bg-teal-500/10 text-teal-300' : 'border-white/15 text-gray-400'}`}>
                                {ORDER_STAGE_LABEL[st] || st}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className={LABEL}>Ostrzegaj na (dni przed)
                        <input type="number" min="1" max="365" defaultValue={settings.warnDays} key={`w${settings.warnDays}`}
                            onBlur={e => { const v = Number(e.target.value); if (v !== settings.warnDays) zapisz({ warnDays: v }); }} className={INPUT} />
                    </label>
                    <label className={LABEL}>Godzina wysyłki
                        <select value={settings.hour} onChange={e => zapisz({ hour: Number(e.target.value) })} className={INPUT}>
                            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                        </select>
                    </label>
                </div>
                <label className={`${LABEL} mt-3`}>Przypomnienia
                    <select value={settings.mode} onChange={e => zapisz({ mode: e.target.value })} className={INPUT}>
                        {TRYBY.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                </label>
                <label className="mt-2 flex min-h-[36px] items-center gap-2 text-sm text-gray-200">
                    <input type="checkbox" checked={settings.includeMissing} onChange={e => zapisz({ includeMissing: e.target.checked })} className="h-4 w-4 accent-teal-500" />
                    Uwzględniaj też <b>brak</b> wymaganego szkolenia
                </label>
                <div className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Odbiorcy — aktywni ADMIN-i</div>
                {preview.recipients.length
                    ? preview.recipients.map(r => <div key={r.email} className="py-0.5 text-xs text-gray-300">{r.name} <span className="text-gray-500">{r.email}</span></div>)
                    : <div className="text-xs text-red-400">Żaden aktywny ADMIN nie ma adresu e-mail.</div>}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[.07] pt-3">
                    <button onClick={() => akcja('test')} disabled={!!busy} className={BTN}>{busy === 'test' ? 'Wysyłam…' : 'Wyślij testowo do mnie'}</button>
                    <button onClick={() => akcja('run')} disabled={!!busy || !nowe} title={nowe ? 'Wysyła do wszystkich ADMIN-ów i zapisuje progi' : 'Brak nowych pozycji — wszystkie progi z dzisiejszej listy już poszły'} className={BTN_PRIMARY}>
                        {busy === 'run' ? 'Wysyłam…' : 'Wyślij teraz'}
                    </button>
                </div>
            </section>

            <section className="min-w-0">
                <div className="rounded-lg border border-white/[.07] bg-[#0a1120] p-4">
                    <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="text-sm font-bold text-gray-100">Podgląd dzisiejszej wysyłki</h3>
                        <span className="text-[11px] text-gray-500">{fmtDay(preview.today)}, {String(settings.hour).padStart(2, '0')}:00</span>
                    </div>
                    <div className="mb-3 mt-2 flex flex-wrap gap-2 text-[11px]">
                        {!settings.enabled && <span className="rounded bg-white/5 px-1.5 py-0.5 text-gray-400">wysyłka wyłączona — mail nie pójdzie</span>}
                        <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-300">{ile('EXPIRED')} wygasło</span>
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">{ile('EXPIRING')} kończy się ≤ {settings.warnDays} dni</span>
                        {settings.includeMissing && <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-300">{ile('MISSING')} brak szkolenia</span>}
                        <span className="rounded bg-teal-500/10 px-1.5 py-0.5 text-teal-300">{nowe} nowych (przekroczony nowy próg)</span>
                        {preview.closedSkipped > 0 && <span className="rounded bg-white/5 px-1.5 py-0.5 text-gray-400">pominięto {preview.closedSkipped} zamkniętych zamówień</span>}
                    </div>
                    {preview.mail ? (
                        <div className="overflow-hidden rounded-md bg-white text-[#1f2937]">
                            <div className="border-b border-gray-200 bg-gray-100 px-3.5 py-2.5 text-xs">
                                <div><span className="inline-block w-14 text-gray-500">Do:</span>{preview.recipients.map(r => r.email).join(', ') || '—'}</div>
                                <div><span className="inline-block w-14 text-gray-500">Temat:</span><b>{preview.mail.subject}</b></div>
                            </div>
                            {/* HTML maila z backendu — ten sam, który wyśle cron; w iframe, żeby style maila nie mieszały się z aplikacją */}
                            <iframe title="Podgląd maila" sandbox="" srcDoc={preview.mail.html} className="h-[460px] w-full border-0 bg-white" />
                        </div>
                    ) : (
                        <div className="rounded-md border border-white/[.07] px-4 py-6 text-center text-sm text-gray-500">
                            Żadne wymagane szkolenie w aktywnych zamówieniach nie kończy się w ciągu {settings.warnDays} dni — mail nie zostanie wysłany.
                        </div>
                    )}
                </div>
                <div className="mt-4 rounded-lg border border-white/[.07] bg-[#0a1120] p-4">
                    <h3 className="mb-2 text-sm font-bold text-gray-100">Historia wysyłek</h3>
                    {!runs.length ? <div className="text-xs text-gray-500">Jeszcze nic nie wysłano.</div> : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12px]">
                                <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-500"><th className="py-1.5 pr-3">Data</th><th className="pr-3">Odbiorców</th><th className="pr-3">Pozycji</th><th>Status</th></tr></thead>
                                <tbody>
                                    {runs.map(r => (
                                        <tr key={r.id} className="border-t border-white/[.05]">
                                            <td className="py-1.5 pr-3 tabular-nums">{new Date(r.ranAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}</td>
                                            <td className="pr-3">{r.recipients}</td>
                                            <td className="pr-3">{r.items}</td>
                                            <td className={r.status === 'ERROR' ? 'text-red-400' : 'text-gray-300'}>{STATUS_RUN[r.status] || r.status}{r.error ? ` — ${r.error}` : ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
