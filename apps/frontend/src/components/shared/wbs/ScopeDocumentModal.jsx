import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Sparkles, RefreshCw, FileText, Eye, Save, Check, Merge, Trash2, Upload, AlertTriangle } from 'lucide-react';
import MarkdownEditor from '../MarkdownEditor';
import { API_URL } from '../../../config';
import { fmtQty } from './wbsConstants';

const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');

// @anchor scope-api
async function scopeApi(method, path, body) {
    const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token()}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    if (!res.ok) throw new Error((json && (json.message || json.error)) || `Błąd ${res.status}`);
    return json;
}

const TABS = [
    { key: 'layout', label: '1. Układ' },
    { key: 'header', label: '2. Metryczka' },
    { key: 'texts', label: '3. Treść' },
    { key: 'qty', label: '4. Zakres ilościowy' },
];

// Sekcje opisowe w kolejności dokumentu; `ai` = da się wygenerować ponownie.
const TEXT_SECTIONS = [
    { key: 'goal', no: 1, title: 'Przedmiot i cel projektu', ai: true, hint: 'AI: z „Cel projektu" + parsowanej dokumentacji zamówienia' },
    { key: 'assumptions', no: 2, title: 'Sytuacja wyjściowa i założenia', ai: true, hint: 'AI: ze strategii gałęzi („Jak to chcemy zrobić")' },
    { key: 'packages', no: 4, title: 'Opis pakietów prac', ai: true, hint: 'AI: strategia i składowe każdego pakietu' },
    { key: 'supplies', no: 6, title: 'Dostawy po stronie wykonawcy', hint: 'Wpisz ręcznie dla tej oferty' },
    { key: 'exclusions', no: 7, title: 'Poza zakresem / po stronie Zamawiającego', hint: 'Wpisz ręcznie dla tej oferty' },
    { key: 'organization', no: 8, title: 'Organizacja realizacji', hint: 'Szacowany czas prac dopisuje się z metryczki' },
    { key: 'acceptance', no: 9, title: 'Dokumentacja i odbiór', hint: 'Gwarancja dopisuje się z metryczki' },
];

const btn = 'flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none';
const btnViolet = `${btn} border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-200`;
const btnGray = `${btn} border-white/10 bg-white/5 hover:bg-white/10 text-gray-300`;
const btnGreen = `${btn} border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200`;
const input = 'w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500';
const Spin = () => <div className="w-3 h-3 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />;

// @anchor scope-document-modal
// Okno „Opis zakresu prac" (załącznik do oferty, docs/PLAN-opis-zakresu-oferty.md):
// układ (AI: pakiety vs lokalizacje, zatwierdzenie i ręczne łączenie), metryczka, teksty sekcji
// (AI + edycja, zapis tylko w dokumencie), wybór pozycji do zakresu ilościowego, podgląd i zapis PDF.
export default function ScopeDocumentModal({ nodeId, versionId, onClose, onScopeItemsChanged }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState({});
    const [tab, setTab] = useState('layout');
    const [sections, setSections] = useState({});
    const [layoutReason, setLayoutReason] = useState('');
    const [selectedPkgs, setSelectedPkgs] = useState([]);
    const [confirmPdf, setConfirmPdf] = useState(false);
    const [itemFilter, setItemFilter] = useState('');
    const [onlyChecked, setOnlyChecked] = useState(false);
    const vq = versionId ? `?versionId=${versionId}` : '';
    const vBody = versionId ? { versionId } : {};
    const logoInput = useRef(null);

    const load = useCallback(async () => {
        try {
            const d = await scopeApi('GET', `/scope-documents/${nodeId}${vq}`);
            setData(d);
            setSections(d.document?.sections || {});
            setError('');
            return d;
        } catch (e) { setError(e.message); }
    }, [nodeId, vq]);

    useEffect(() => { load(); }, [load]);

    // Logo firmy Zamawiającego — endpoint wymaga tokenu, więc pobieramy blob zamiast <img src=API>.
    const supplierId = data?.supplier?.id;
    const supplierLogo = data?.supplier?.logoPath;
    const [logoUrl, setLogoUrl] = useState('');
    const [logoVer, setLogoVer] = useState(0);
    useEffect(() => {
        if (!supplierId || !supplierLogo) { setLogoUrl(''); return; }
        let url = '';
        let alive = true;
        fetch(`${API_URL}/suppliers/${supplierId}/logo`, { headers: { Authorization: `Bearer ${token()}` } })
            .then(r => (r.ok ? r.blob() : null))
            .then(b => { if (alive && b) { url = URL.createObjectURL(b); setLogoUrl(url); } })
            .catch(() => {});
        return () => { alive = false; if (url) URL.revokeObjectURL(url); };
    }, [supplierId, supplierLogo, logoVer]);

    const run = async (key, fn) => {
        setBusy(b => ({ ...b, [key]: true }));
        setError(''); setNotice('');
        try { return await fn(); }
        catch (e) { setError(e.message); }
        finally { setBusy(b => ({ ...b, [key]: false })); }
    };

    const patch = (body) => scopeApi('PATCH', `/scope-documents/${nodeId}`, body);
    const doc = data?.document;
    const model = data?.model;
    const layout = data?.layout;

    // ── układ ────────────────────────────────────────────────────────────────
    const detectLayout = () => run('layout', async () => {
        const r = await scopeApi('POST', `/scope-documents/${nodeId}/detect-layout`, vBody);
        setLayoutReason(r.reason || '');
        setSelectedPkgs([]);
        await load();
    });

    // Zmiana układu: pakiety są kluczem tekstów sekcji 4 — przy zmianie nazwy/łączeniu przenosimy teksty.
    const saveLayout = (next, pkgTexts) => run('layoutSave', async () => {
        const body = { layout: next, layoutConfirmed: false };
        if (pkgTexts) body.sections = { packages: pkgTexts };
        await patch(body);
        await load();
    });

    const renamePackage = (i, name) => {
        const old = layout.packages[i].name;
        const clean = name.trim();
        if (!clean || clean === old) return;
        const cur = sections.packages || {};
        const pk = cur[old] !== undefined ? { [clean]: cur[old], [old]: null } : null;
        saveLayout({ ...layout, packages: layout.packages.map((p, j) => j === i ? { ...p, name: clean } : p) }, pk);
    };

    const mergePackages = () => {
        if (selectedPkgs.length < 2) return;
        const idx = [...selectedPkgs].sort((a, b) => a - b);
        const target = layout.packages[idx[0]];
        const merged = { name: target.name, wbsNodeIds: [...new Set(idx.flatMap(i => layout.packages[i].wbsNodeIds))] };
        const cur = sections.packages || {};
        const pk = { [target.name]: idx.map(i => cur[layout.packages[i].name]).filter(Boolean).join('\n') };
        idx.slice(1).forEach(i => { pk[layout.packages[i].name] = null; });
        const packages = layout.packages.filter((_, i) => !idx.slice(1).includes(i)).map(p => p === target ? merged : p);
        setSelectedPkgs([]);
        saveLayout({ ...layout, packages }, pk);
    };

    const removeGroup = (kind, i) => saveLayout({ ...layout, [kind]: layout[kind].filter((_, j) => j !== i) });
    const renameLocation = (i, name) => {
        const clean = name.trim();
        if (!clean || clean === layout.locations[i].name) return;
        saveLayout({ ...layout, locations: layout.locations.map((l, j) => j === i ? { ...l, name: clean } : l) });
    };
    const confirmLayout = () => run('layoutConfirm', async () => { await patch({ layoutConfirmed: true, layout }); await load(); });

    // ── treść ────────────────────────────────────────────────────────────────
    const saveSection = async (key, value) => {
        const d = await patch({ sections: { [key]: value } });
        setData(prev => prev ? { ...prev, document: d } : prev);
    };
    const savePackageText = async (name, value) => {
        const d = await patch({ sections: { packages: { [name]: value } } });
        setData(prev => prev ? { ...prev, document: d } : prev);
    };
    const generate = (only) => run(only ? `gen-${only.join()}` : 'gen', async () => {
        const r = await scopeApi('POST', `/scope-documents/${nodeId}/generate`, { ...vBody, ...(only ? { only } : {}) });
        if (!r.generated?.length) setNotice('Wszystkie sekcje AI są już wypełnione — użyj „↻ AI" przy sekcji, by napisać ją od nowa.');
        await load();
    });

    // ── zakres ilościowy ─────────────────────────────────────────────────────
    // Elementy jak w tabeli PDF: ta sama nazwa + j.m. = jeden wiersz (np. maszt w 5 lokalizacjach).
    const itemGroups = useMemo(() => {
        const map = new Map();
        for (const n of data?.tree || []) {
            if (n.isBranch || String(n.type).toLowerCase() === 'group') continue;
            const key = `${n.name.trim().toLowerCase()}|${(n.unit || '').trim().toLowerCase()}`;
            if (!map.has(key)) map.set(key, { key, name: n.name.trim(), unit: n.unit || '', total: 0, ids: [], checked: 0 });
            const g = map.get(key);
            g.total += Number(n.quantity) || 0;
            g.ids.push(n.id);
            if (n.showInScope) g.checked++;
        }
        // Kolejność stała (alfabetyczna) — przełączenie nie przestawia listy pod kursorem.
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    }, [data]);
    const visibleGroups = itemGroups.filter(g => (!onlyChecked || g.checked) && (!itemFilter || g.name.toLowerCase().includes(itemFilter.toLowerCase())));

    const toggleGroup = (g) => run(`item-${g.key}`, async () => {
        const next = g.checked < g.ids.length;
        await Promise.all(g.ids.map(id => fetch(`${API_URL}/wbs-nodes/${id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ showInScope: next }),
        })));
        await load();
        onScopeItemsChanged?.();
    });
    const suggestItems = () => run('items', async () => {
        const r = await scopeApi('POST', `/scope-documents/${nodeId}/suggest-items`, vBody);
        setNotice(`AI zaznaczyło ${r.selected} pozycji drzewa. Odznacz zbędne albo dodaj brakujące.`);
        await load();
        onScopeItemsChanged?.();
    });

    // ── metryczka ────────────────────────────────────────────────────────────
    const saveField = (body) => run('header', async () => { const d = await patch(body); setData(prev => ({ ...prev, document: d })); await load(); });
    const saveShortCode = (code) => run('shortCode', async () => {
        await scopeApi('PATCH', `/suppliers/${data.supplier.id}`, { shortCode: code });
        await load();
    });
    const uploadLogo = (file) => run('logo', async () => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`${API_URL}/suppliers/${data.supplier.id}/logo`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Wgranie logo nieudane');
        setNotice('Logo zapisane — pojawi się w nagłówku dokumentu.');
        await load();
        setLogoVer(v => v + 1);
    });

    // ── podgląd i PDF ────────────────────────────────────────────────────────
    const preview = () => run('preview', async () => {
        const res = await fetch(`${API_URL}/scope-documents/${nodeId}/preview${vq}`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!res.ok) throw new Error('Podgląd nieudany');
        const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/html' }));
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
    const savePdf = () => run('pdf', async () => {
        setConfirmPdf(false);
        const r = await scopeApi('POST', `/scope-documents/${nodeId}/pdf`, vBody);
        setNotice(`Zapisano „${r.filename}" (oferta ${r.offerNumber}, wersja ${r.revisionLabel}) w dokumentach zamówienia.`);
        await load();
    });

    if (!data) {
        return (
            <Shell onClose={onClose} title="Opis zakresu prac">
                <div className="p-10 flex items-center justify-center gap-3 text-sm text-gray-400">
                    {error ? <span className="text-red-300">{error}</span> : <><Spin /> Wczytywanie…</>}
                </div>
            </Shell>
        );
    }

    const hasLoc = (model?.locations || []).length > 0;
    const toolbar = (
        <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-gray-400 mr-2">
                {doc.offerNumber ? <>Oferta <b className="text-gray-200">{doc.offerNumber}</b> · wersja {doc.documentId ? `1.${doc.revision}` : '1.0'}</> : 'Numer oferty nadany przy pierwszym zapisie'}
            </span>
            <button className={btnGray} onClick={preview} disabled={busy.preview}>{busy.preview ? <Spin /> : <Eye size={11} />} Podgląd</button>
            <button className={btnGreen} onClick={() => (doc.layoutConfirmed ? savePdf() : setConfirmPdf(true))} disabled={busy.pdf}>
                {busy.pdf ? <Spin /> : <Save size={11} />} Zapisz PDF
            </button>
        </div>
    );

    return (
        <Shell onClose={onClose} title="Opis zakresu prac" toolbar={toolbar}>
            <div className="flex items-center gap-1 px-5 pt-3 border-b border-white/10">
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded-t-lg border-b-2 ${tab === t.key ? 'border-violet-400 text-violet-200' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                        {t.label}
                        {t.key === 'layout' && !doc.layoutConfirmed && <span className="ml-1.5 text-amber-400">•</span>}
                    </button>
                ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-4">
                {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">{error}</div>}
                {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{notice}</div>}

                {tab === 'layout' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <button className={btnViolet} onClick={detectLayout} disabled={busy.layout}>
                                {busy.layout ? <Spin /> : <Sparkles size={11} />} {data.layoutDetected ? 'Rozpoznaj ponownie (AI)' : 'Rozpoznaj układ (AI)'}
                            </button>
                            <button className={btnGreen} onClick={confirmLayout} disabled={busy.layoutConfirm || doc.layoutConfirmed}>
                                {busy.layoutConfirm ? <Spin /> : <Check size={11} />} {doc.layoutConfirmed ? 'Układ zatwierdzony' : 'Zatwierdź układ'}
                            </button>
                            <button className={btnGray} onClick={mergePackages} disabled={selectedPkgs.length < 2 || busy.layoutSave}>
                                <Merge size={11} /> Połącz zaznaczone pakiety ({selectedPkgs.length})
                            </button>
                            {busy.layoutSave && <Spin />}
                        </div>
                        <p className="text-xs text-gray-400">
                            {!data.layoutDetected
                                ? 'Domyślnie najwyższe gałęzie drzewa są pakietami prac. Kliknij „Rozpoznaj układ", jeśli drzewo jest podzielone na lokalizacje albo pakiety powtarzają się pod różnymi nazwami.'
                                : <>Tryb: <b className="text-gray-200">{layout.mode === 'locations' ? 'najwyższe gałęzie to lokalizacje' : 'najwyższe gałęzie to pakiety prac'}</b>{layoutReason && <> — {layoutReason}</>}</>}
                        </p>

                        <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-4">
                            <div className="rounded-xl border border-white/10 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-gray-400">
                                        <tr>
                                            <th className="w-8" />
                                            <th className="text-left px-2 py-2 min-w-[300px]">Pakiet prac</th>
                                            {(model.locations || []).map(l => <th key={l} className="px-2 py-2 text-center">{l}</th>)}
                                            <th className="w-8" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {layout.packages.map((p, i) => (
                                            <tr key={`${p.name}-${i}`} className="border-t border-white/5">
                                                <td className="text-center">
                                                    <input type="checkbox" checked={selectedPkgs.includes(i)} onChange={e => setSelectedPkgs(s => e.target.checked ? [...s, i] : s.filter(x => x !== i))} />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <input defaultValue={p.name} onBlur={e => renamePackage(i, e.target.value)} className="w-full bg-transparent border border-transparent hover:border-white/10 focus:border-violet-500 rounded px-2 py-1 text-gray-200 focus:outline-none" />
                                                    <div className="px-2 text-[10px] text-gray-500">{p.wbsNodeIds.length} gałęzi drzewa</div>
                                                </td>
                                                {(model.locations || []).map((l, j) => (
                                                    <td key={l} className="text-center">{model.matrix?.[i]?.[j] ? <span className="text-violet-300">●</span> : <span className="text-gray-600">—</span>}</td>
                                                ))}
                                                <td className="text-center">
                                                    <button onClick={() => removeGroup('packages', i)} className="p-1 text-gray-500 hover:text-red-300" title="Usuń pakiet z dokumentu"><Trash2 size={12} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="rounded-xl border border-white/10 p-3 flex flex-col gap-2">
                                <div className="text-[10px] uppercase tracking-widest text-gray-400">Lokalizacje</div>
                                {layout.locations.length === 0 && <div className="text-xs text-gray-500">Zakres nie jest podzielony na lokalizacje — sekcja 3 będzie listą pakietów, a sekcja 5 tabelą z jedną kolumną ilości.</div>}
                                {layout.locations.map((l, i) => (
                                    <div key={`${l.name}-${i}`} className="flex items-center gap-2">
                                        <input defaultValue={l.name} onBlur={e => renameLocation(i, e.target.value)} className={input} />
                                        <button onClick={() => removeGroup('locations', i)} className="p-1 text-gray-500 hover:text-red-300"><Trash2 size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'header' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card title="Dokument">
                            <Field label="Tytuł"><input key={`t-${sections.title}`} defaultValue={sections.title || ''} placeholder={model.title} onBlur={e => e.target.value !== (sections.title || '') && saveField({ sections: { title: e.target.value } })} className={input} /></Field>
                            <Field label="Przedmiot"><input key={`s-${sections.subject}`} defaultValue={sections.subject || ''} onBlur={e => e.target.value !== (sections.subject || '') && saveField({ sections: { subject: e.target.value } })} className={input} /></Field>
                            <Field label="Inwestor / odbiorca końcowy"><input key={`i-${sections.investor}`} defaultValue={sections.investor || ''} onBlur={e => e.target.value !== (sections.investor || '') && saveField({ sections: { investor: e.target.value } })} className={input} /></Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Ważność oferty (dni)"><input type="number" min="1" key={`v-${doc.validityDays}`} defaultValue={doc.validityDays} onBlur={e => Number(e.target.value) !== doc.validityDays && saveField({ validityDays: e.target.value })} className={input} /></Field>
                                <Field label="Gwarancja (miesiące)"><input type="number" min="0" key={`w-${doc.warrantyMonths}`} defaultValue={doc.warrantyMonths} onBlur={e => Number(e.target.value) !== doc.warrantyMonths && saveField({ warrantyMonths: e.target.value })} className={input} /></Field>
                            </div>
                            <Field label="Szacowany czas prac" hint={doc.workDuration === null ? 'Wyliczony z terminu realizacji — wpisz własny, by zmienić' : 'Wyczyść pole, by wrócić do wyliczenia z terminu'}>
                                <input key={`d-${doc.workDuration}`} defaultValue={doc.workDuration ?? ''} placeholder={model.workDuration || 'brak terminu realizacji w wymaganiach'} onBlur={e => { const v = e.target.value.trim(); if (v !== (doc.workDuration ?? '')) saveField({ workDuration: v || null }); }} className={input} />
                            </Field>
                        </Card>
                        <Card title="Strony">
                            <Info label="Zamawiający" value={[model.client.name, model.client.nip && `NIP ${model.client.nip}`].filter(Boolean).join(' · ')} />
                            {data.supplier ? (
                                <div className="grid grid-cols-2 gap-3 items-end">
                                    <Field label="Skrót firmy (numer oferty)" hint="3 litery A-Z">
                                        <input key={`sc-${data.supplier.shortCode}`} maxLength={3} defaultValue={data.supplier.shortCode || ''} placeholder="np. LAC" onBlur={e => { const v = e.target.value.toUpperCase(); if (v !== (data.supplier.shortCode || '')) saveShortCode(v); }} className={`${input} uppercase`} />
                                    </Field>
                                    <div className="flex items-center gap-2">
                                        {logoUrl && <img src={logoUrl} alt="" className="h-8 max-w-[90px] object-contain bg-white rounded p-0.5" />}
                                        <button className={btnGray} onClick={() => logoInput.current?.click()} disabled={busy.logo}>{busy.logo ? <Spin /> : <Upload size={11} />} {data.supplier.logoPath ? 'Zmień logo' : 'Wgraj logo'}</button>
                                        <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadLogo(f); }} />
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs text-amber-300/90">Firma Zamawiającego nie jest w rejestrze firm. Uzupełnij NIP firmy PM w wymaganiach zamówienia, aby podpiąć logo i skrót. Bez tego skrót numeru oferty powstanie z nazwy firmy.</div>
                            )}
                            <Info label="Kontakt — Zamawiający" value={model.clientContact} />
                            <Info label={`Kontakt — ${model.companyName}`} value={model.airtelContact} hint="Właściciel zamówienia" />
                            <Info label="Termin realizacji" value={model.term} hint="Z wymagań zamówienia" />
                            <Info label="Podstawa" value={model.versionLabel && `wycena „${model.versionLabel}"`} />
                        </Card>
                    </div>
                )}

                {tab === 'texts' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <button className={btnViolet} onClick={() => generate()} disabled={busy.gen}>
                                {busy.gen ? <Spin /> : <Sparkles size={11} />} {busy.gen ? 'AI pisze… (do minuty)' : 'Uzupełnij puste sekcje (AI)'}
                            </button>
                            <span className="text-xs text-gray-500">Zapisane teksty nie są nadpisywane. Zmiany zostają tylko w tym dokumencie.</span>
                        </div>
                        {TEXT_SECTIONS.map(s => (
                            <Card key={s.key} title={`${s.no}. ${s.title}`} hint={s.hint} action={s.ai && (
                                <button className={btnViolet} onClick={() => generate([s.key])} disabled={busy[`gen-${s.key}`] || busy.gen} title="Napisz sekcję od nowa — obecny tekst zostanie zastąpiony">
                                    {busy[`gen-${s.key}`] ? <Spin /> : <RefreshCw size={11} />} AI od nowa
                                </button>
                            )}>
                                {s.key === 'packages' ? (
                                    layout.packages.map((p, i) => (
                                        <div key={p.name} className="flex flex-col gap-1">
                                            <div className="text-xs font-bold text-blue-300">4.{i + 1} {p.name}</div>
                                            <MarkdownEditor
                                                value={sections.packages?.[p.name] || ''}
                                                onChange={v => setSections(prev => ({ ...prev, packages: { ...(prev.packages || {}), [p.name]: v } }))}
                                                onSave={v => savePackageText(p.name, v)}
                                                previewTitle={p.name}
                                                placeholder="- co obejmuje pakiet…"
                                                className="w-full min-h-[110px] bg-black/40 border border-white/10 rounded-xl p-3 text-gray-300 text-sm focus:outline-none focus:border-violet-500 custom-scrollbar resize-y"
                                            />
                                        </div>
                                    ))
                                ) : (
                                    <MarkdownEditor
                                        value={sections[s.key] ?? model.sections?.[s.key] ?? ''}
                                        onChange={v => setSections(prev => ({ ...prev, [s.key]: v }))}
                                        onSave={v => saveSection(s.key, v)}
                                        previewTitle={s.title}
                                        placeholder={s.key === 'supplies' ? '- konstrukcje, szafy, okablowanie…' : s.key === 'exclusions' ? '- dostawa urządzeń po stronie Zamawiającego…' : ''}
                                        className="w-full min-h-[120px] bg-black/40 border border-white/10 rounded-xl p-3 text-gray-300 text-sm focus:outline-none focus:border-violet-500 custom-scrollbar resize-y"
                                    />
                                )}
                            </Card>
                        ))}
                    </div>
                )}

                {tab === 'qty' && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <Card title={hasLoc ? 'Zakres ilościowy w lokalizacjach (podgląd)' : 'Zakres ilościowy (podgląd)'}>
                            {model.quantities.length === 0
                                ? <div className="text-xs text-gray-500">Brak pozycji — zaznacz elementy po prawej albo użyj „AI: zaproponuj pozycje".</div>
                                : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead className="text-[10px] uppercase tracking-widest text-gray-400 bg-white/5">
                                                <tr>
                                                    <th className="text-left px-2 py-1.5">Element</th><th className="px-2">j.m.</th>
                                                    {model.locations.map(l => <th key={l} className="px-2">{l}</th>)}
                                                    <th className="px-2">Razem</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {model.quantities.map(q => (
                                                    <tr key={`${q.name}|${q.unit}`} className="border-t border-white/5 text-gray-300">
                                                        <td className="px-2 py-1">{q.name}</td><td className="px-2 text-center text-gray-500">{q.unit}</td>
                                                        {q.perLocation.map((v, j) => <td key={j} className="px-2 text-right">{v ? fmtQty(v) : <span className="text-gray-600">—</span>}</td>)}
                                                        <td className="px-2 text-right font-bold">{fmtQty(q.total)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                        </Card>
                        <Card title="Pozycje drzewa w tabeli" action={
                            <button className={btnViolet} onClick={suggestItems} disabled={busy.items}>{busy.items ? <Spin /> : <Sparkles size={11} />} AI: zaproponuj pozycje</button>
                        }>
                            <div className="flex items-center gap-3">
                                <input value={itemFilter} onChange={e => setItemFilter(e.target.value)} placeholder="Szukaj pozycji…" className={input} />
                                <label className="flex items-center gap-1.5 text-xs text-gray-400 whitespace-nowrap">
                                    <input type="checkbox" checked={onlyChecked} onChange={e => setOnlyChecked(e.target.checked)} /> tylko zaznaczone
                                </label>
                            </div>
                            <div className="max-h-[50vh] overflow-y-auto custom-scrollbar flex flex-col">
                                {visibleGroups.map(g => (
                                    <label key={g.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 text-xs text-gray-300 cursor-pointer">
                                        {busy[`item-${g.key}`] ? <Spin /> : (
                                            <input type="checkbox" checked={g.checked > 0} ref={el => { if (el) el.indeterminate = g.checked > 0 && g.checked < g.ids.length; }} onChange={() => toggleGroup(g)} />
                                        )}
                                        <span className="flex-1">{g.name}</span>
                                        <span className="text-gray-500 whitespace-nowrap">{fmtQty(g.total)} {g.unit}{g.ids.length > 1 ? ` · ${g.ids.length}×` : ''}</span>
                                    </label>
                                ))}
                                {visibleGroups.length === 0 && <div className="text-xs text-gray-500 p-2">Brak pozycji.</div>}
                            </div>
                        </Card>
                    </div>
                )}
            </div>

            {confirmPdf && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60" onClick={() => setConfirmPdf(false)}>
                    <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#0b0f17] p-5 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start gap-3 text-sm text-gray-200">
                            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                            <div>Układ pakietów i lokalizacji nie jest zatwierdzony. Zapisać PDF mimo to?</div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button className={btnGray} onClick={() => { setConfirmPdf(false); setTab('layout'); }}>NIE — sprawdzę układ</button>
                            <button className={btnGreen} onClick={savePdf}>TAK — zapisz</button>
                        </div>
                    </div>
                </div>
            )}
        </Shell>
    );
}

function Shell({ title, toolbar, onClose, children }) {
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div className="w-full max-w-6xl h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10">
                    <FileText size={16} className="text-emerald-300" />
                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-200">{title}</h2>
                    {toolbar}
                    <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-400 ml-2"><X size={16} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}

function Card({ title, hint, action, children }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-300">{title}</div>
                    {hint && <div className="text-[11px] text-gray-500">{hint}</div>}
                </div>
                {action && <div className="ml-auto">{action}</div>}
            </div>
            {children}
        </div>
    );
}

function Field({ label, hint, children }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-gray-500">{label}</span>
            {children}
            {hint && <span className="text-[10px] text-gray-600">{hint}</span>}
        </label>
    );
}

function Info({ label, value, hint }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-widest text-gray-500">{label}{hint && <span className="normal-case tracking-normal text-gray-600"> · {hint}</span>}</span>
            <span className="text-sm text-gray-200">{value || <span className="text-gray-600">—</span>}</span>
        </div>
    );
}
