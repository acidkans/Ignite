import { X, Sparkles, RefreshCw, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { fmtPLN } from './wbsConstants';

// @anchor offer-ai-check-labels
export const OFFER_AI_SEVERITY = {
    error: { label: 'Błąd', cls: 'text-red-300 border-red-500/30 bg-red-500/10', Icon: AlertCircle },
    warning: { label: 'Ostrzeżenie', cls: 'text-amber-300 border-amber-500/30 bg-amber-500/10', Icon: AlertTriangle },
    info: { label: 'Do sprawdzenia', cls: 'text-sky-300 border-sky-500/30 bg-sky-500/10', Icon: Info },
};
export const OFFER_AI_CATEGORY = {
    brak_w_budzecie: 'Brak w budżecie',
    brak_w_tekscie: 'Pozycja bez opisu',
    niezgodnosc_wartosci: 'Niezgodność wartości',
    sprzecznosc: 'Sprzeczność',
};
const SOURCE_LABEL = { oferta: 'Oferta', strategia: 'Strategia', budzet: 'Budżet' };

// @anchor offer-ai-check-modal
// Wynik analizy AI „oferta + strategie vs budżet". Stan: { loading, error, result }.
// Wynik jest listą do przejrzenia przez człowieka — model może coś przeoczyć lub
// zgłosić fałszywie, co komunikujemy wprost w nagłówku.
export default function OfferAiCheckModal({ state, onClose, onRun }) {
    if (!state) return null;
    const { loading, error, result, doc } = state;
    const findings = result?.findings || [];
    const counts = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10">
                    <Sparkles size={16} className="text-violet-300" />
                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-200">Analiza AI: oferta i strategie vs budżet</h2>
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            onClick={onRun}
                            disabled={loading}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-200 text-[10px] font-bold uppercase tracking-widest ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> {result ? 'Analizuj ponownie' : 'Analizuj'}
                        </button>
                        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-400"><X size={16} /></button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-4">
                    {loading && (
                        <div className="flex items-center gap-3 text-sm text-gray-300">
                            <div className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                            Agent czyta strukturę projektu, ofertę i strategie, a potem porównuje je z budżetem — przy dużym projekcie trwa to 1–2 minuty…
                        </div>
                    )}
                    {error && !loading && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
                    )}
                    {result && (
                        <>
                            <div className="text-[11px] text-gray-500">
                                {new Date(result.createdAt).toLocaleString('pl-PL')} · {result.model} · sprawdzono {result.itemsChecked} pozycji budżetu i {result.strategiesChecked} strategii.
                                {' '}Wynik AI to lista kontrolna do przejrzenia — model może coś przeoczyć albo zgłosić fałszywie.
                            </div>
                            {doc?.status === 'saving' && <div className="text-[12px] text-gray-400">Zapisuję raport PDF w dokumentacji projektu…</div>}
                            {doc?.status === 'saved' && (
                                <div className="text-[12px] text-emerald-300">
                                    Raport zapisany w dokumentacji projektu jako „{doc.name}" — otwórz panel Dokumentacji, żeby czytać go obok budżetu i poprawiać pozycje.
                                </div>
                            )}
                            {doc?.status === 'error' && <div className="text-[12px] text-red-300">Nie udało się zapisać raportu w dokumentacji: {doc.error}</div>}
                            {result.projectUnderstanding && (
                                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Jak agent rozumie projekt</div>
                                    <div className="text-sm text-gray-300 whitespace-pre-wrap">{result.projectUnderstanding}</div>
                                </div>
                            )}
                            {result.summary && (
                                <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3">
                                    <div className="text-[10px] uppercase tracking-widest text-violet-300/80 font-bold mb-1">Ocena</div>
                                    <div className="text-sm text-gray-200 whitespace-pre-wrap">{result.summary}</div>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                {Object.entries(OFFER_AI_SEVERITY).map(([k, v]) => (
                                    <span key={k} className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${v.cls}`}>{v.label}: {counts[k] || 0}</span>
                                ))}
                            </div>
                            {findings.length === 0 && <div className="text-sm text-gray-400">Nie znaleziono rozbieżności.</div>}
                            {findings.map((f, i) => {
                                const sev = OFFER_AI_SEVERITY[f.severity] || OFFER_AI_SEVERITY.info;
                                return (
                                    <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${sev.cls}`}><sev.Icon size={11} /> {sev.label}</span>
                                            <span className="text-[11px] font-bold text-gray-300">{OFFER_AI_CATEGORY[f.category] || f.category}</span>
                                            {f.branch && <span className="text-[11px] text-blue-300">· {f.branch}</span>}
                                        </div>
                                        {f.quote && (
                                            <div className="border-l-2 border-gray-500/50 pl-3 text-sm italic text-gray-400">
                                                {SOURCE_LABEL[f.source] ? <span className="not-italic text-[10px] uppercase tracking-wider text-gray-500 mr-2">{SOURCE_LABEL[f.source]}</span> : null}
                                                „{f.quote}"
                                            </div>
                                        )}
                                        <div className="text-sm text-gray-200">{f.description}</div>
                                        {f.budgetItems?.length > 0 && (
                                            <ul className="text-[12px] text-gray-400 flex flex-col gap-0.5">
                                                {f.budgetItems.map((b, j) => (
                                                    <li key={j}>▸ {b.path} — {b.quantity} {b.unit}, koszt {fmtPLN(b.totalCost)} PLN, cena ofert. {fmtPLN(b.offerPrice)} PLN</li>
                                                ))}
                                            </ul>
                                        )}
                                        {f.suggestion && <div className="text-[12px] text-emerald-300/90">Sugestia: {f.suggestion}</div>}
                                    </div>
                                );
                            })}
                        </>
                    )}
                    {!loading && !result && !error && (
                        <div className="text-sm text-gray-400">Kliknij „Analizuj", aby porównać ofertę i strategie z pozycjami budżetu.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
