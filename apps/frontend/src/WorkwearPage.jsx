import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { API_URL } from './config';
import ExportChoiceModal from './components/shared/ExportChoiceModal';
import { fullName, normTxt, todayIso } from './components/shared/trainings/trainingsShared';
import { BTN, BTN_PRIMARY, INPUT, LABEL, Modal } from './components/shared/trainings/TrainingsUi';
import { buildWorkwearExcel } from './utils/workwearExcel';
import { useDevice } from './hooks/useDevice';

async function workwearApi(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API_URL}/workwear${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${sessionStorage.getItem('token')}`,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || `Błąd ${res.status}`);
    return data;
}

const DEFAULT_SCALE = 'LETTER';

// @anchor new-workwear-item-modal
function NewWorkwearItemModal({ onClose, onAdded }) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!name.trim() || busy) return;
        setBusy(true);
        try {
            onAdded(await workwearApi('/items', { method: 'POST', body: { name } }));
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    return (
        <Modal title="Nowa pozycja ubrania" onClose={onClose} width="max-w-md" footer={<>
            <button onClick={onClose} className={BTN}>Anuluj</button>
            <button onClick={submit} disabled={!name.trim() || busy} className={BTN_PRIMARY}>{busy ? 'Zapisuję…' : 'Dodaj pozycję'}</button>
        </>}>
            <label className={LABEL}>Nazwa
                <input
                    autoFocus
                    value={name}
                    maxLength={40}
                    onChange={e => { setName(e.target.value); setError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                    placeholder="np. Krótkie spodenki"
                    className={INPUT}
                />
            </label>
            {error && <div className="text-sm text-red-400">{error}</div>}
        </Modal>
    );
}

// @anchor workwear-page — System › Użytkownicy › Ubrania robocze (tylko ADMIN; backend pilnuje tego niezależnie).
// Wiersz = pracownik, kolumna = element ubrania; w każdej komórce osobny wybór rozmiarówki i rozmiaru.
export default function WorkwearPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    // @anchor workwear-export-open
    const [exportOpen, setExportOpen] = useState(false);
    // @anchor workwear-add-item-open
    const [addItemOpen, setAddItemOpen] = useState(false);
    const { isMobile } = useDevice();

    useEffect(() => {
        workwearApi('/overview').then(setData).catch(e => setError(e.message));
    }, []);

    const rows = useMemo(() => {
        const tokens = normTxt(query).split(/\s+/).filter(Boolean);
        return (data?.users || []).filter(u => {
            const text = normTxt(`${fullName(u)} ${u.email}`);
            return tokens.every(t => text.includes(t));
        });
    }, [data, query]);

    const save = async (userId, item, sizeScale, size) => {
        const previous = data;
        setData(d => ({
            ...d,
            users: d.users.map(u => u.id !== userId ? u : {
                ...u,
                workwear: [...u.workwear.filter(w => w.item !== item), { item, sizeScale, size }],
            }),
        }));
        try {
            await workwearApi(`/users/${userId}/items/${item}`, { method: 'PUT', body: { sizeScale, size } });
            setError('');
        } catch (e) {
            setData(previous);
            setError(`Nie zapisano rozmiaru: ${e.message}`);
        }
    };

    const exportFilename = `ubrania_robocze_${todayIso()}.xlsx`;

    // Poniżej xl przełącznik nad listą i pola ≥ 36 px pod dotyk, żeby kolumny mieściły się bez przewijania.
    const renderSizePicker = (u, item) => {
        const entry = u.workwear.find(w => w.item === item.key);
        const scale = entry?.sizeScale || DEFAULT_SCALE;
        return (
            <div className="flex flex-col gap-1.5 xl:flex-row xl:items-center xl:gap-2">
                <div className="flex overflow-hidden rounded-md border border-white/10 xl:shrink-0">
                    {Object.entries(data.scales).map(([key, sizes]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => key !== scale && save(u.id, item.key, key, null)}
                            title="Rozmiarówka"
                            className={`min-h-[36px] flex-1 px-2 py-1 text-[12px] whitespace-nowrap transition-colors xl:min-h-0 xl:flex-none xl:text-[11px] ${key === scale ? 'bg-teal-500/20 text-teal-300' : 'text-gray-500 hover:text-gray-200'}`}
                        >
                            {sizes[0]}–{sizes[sizes.length - 1]}
                        </button>
                    ))}
                </div>
                <select
                    value={entry?.size || ''}
                    onChange={e => save(u.id, item.key, scale, e.target.value || null)}
                    aria-label={`${item.label}: ${fullName(u)}`}
                    className="min-h-[38px] w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 xl:min-h-0 xl:w-20 text-[13px] text-gray-200 [color-scheme:dark] focus:border-teal-500/50 focus:outline-none"
                >
                    <option value="">—</option>
                    {data.scales[scale].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
        );
    };

    return (
        <div className="flex h-full min-h-0 w-full flex-col animate-fade-in">
            <div className="px-4 pb-3 pt-6 md:px-8">
                <div className="text-[11px] text-gray-500">System › Użytkownicy › Ubrania robocze</div>
                <h2 className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-2xl font-bold text-transparent">Ubrania robocze</h2>
                <p className="mt-1 text-xs text-gray-500">Rozmiary ubrań roboczych pracowników. Zmiany zapisują się od razu.</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Szukaj pracownika…"
                        className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-gray-200 placeholder-gray-600 focus:border-teal-500/50 focus:outline-none sm:w-64"
                    />
                    <button onClick={() => setAddItemOpen(true)} disabled={!data} className={`${BTN} ml-auto`}>+ Nowa pozycja</button>
                    <button onClick={() => setExportOpen(true)} disabled={!rows.length} title="Eksportuje widoczne wiersze" className={`${BTN} flex items-center gap-1.5`}>
                        <FileSpreadsheet size={14} /> Eksport Excel
                    </button>
                </div>
                {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
                {!data && !error && <div className="text-sm text-gray-500">Ładowanie…</div>}
                {/* @anchor workwear-mobile-cards — na telefonie karta pracownika zamiast tabeli przewijanej w bok */}
                {data && isMobile && (
                    <div className="flex flex-col gap-2">
                        {rows.map(u => (
                            <div key={u.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                                <div className="mb-2 text-sm font-semibold text-gray-200">{fullName(u)}</div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                                    {data.items.map(i => (
                                        <div key={i.key} className="min-w-0">
                                            <div className="mb-1 truncate text-[11px] font-bold uppercase tracking-widest text-gray-500">{i.label}</div>
                                            {renderSizePicker(u, i)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {rows.length === 0 && <div className="py-6 text-center text-[13px] italic text-gray-500">Brak pracowników.</div>}
                    </div>
                )}
                {data && !isMobile && (
                    <div className="overflow-x-auto rounded-lg border border-white/10">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="border-b border-white/10 text-[11px] uppercase tracking-widest text-gray-500">
                                    <th className="sticky left-0 z-[1] bg-[#070c17] px-3 py-2 font-bold">Pracownik</th>
                                    {data.items.map(i => <th key={i.key} className="px-3 py-2 font-bold">{i.label}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(u => (
                                    <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                                        <td className="sticky left-0 z-[1] min-w-[110px] bg-[#070c17] px-3 py-2 text-[13px] text-gray-200 xl:whitespace-nowrap">{fullName(u)}</td>
                                        {data.items.map(i => <td key={i.key} className="min-w-[118px] px-2 py-2 xl:px-3">{renderSizePicker(u, i)}</td>)}
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr><td colSpan={data.items.length + 1} className="px-3 py-6 text-center text-[13px] italic text-gray-500">Brak pracowników.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {data && (
                <ExportChoiceModal
                    open={exportOpen}
                    onClose={() => setExportOpen(false)}
                    title="Excel — Ubrania robocze"
                    defaultFilename={exportFilename}
                    makeArtifact={() => buildWorkwearExcel({ rows, items: data.items, filename: exportFilename })}
                />
            )}
            {addItemOpen && (
                <NewWorkwearItemModal
                    onClose={() => setAddItemOpen(false)}
                    onAdded={(item) => {
                        setData(d => ({ ...d, items: [...d.items, item] }));
                        setAddItemOpen(false);
                    }}
                />
            )}
        </div>
    );
}
