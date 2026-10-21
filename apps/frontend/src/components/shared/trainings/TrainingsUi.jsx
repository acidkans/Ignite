import { X } from 'lucide-react';

// @anchor highlight-hits — tekst z podświetlonymi znakami trafienia fuzzy match.
export function Highlight({ text, hits }) {
    if (!hits?.length) return <>{text}</>;
    const set = new Set(hits);
    return <>{[...String(text)].map((ch, i) => (set.has(i) ? <mark key={i} className="bg-transparent font-bold text-teal-300">{ch}</mark> : ch))}</>;
}

// @anchor order-chip — zamówienie jako plakietka; zamknięte (wszystko odebrane protokołem) wyszarzone,
// bo nie jest już aktywnym projektem. `warn` = pracownik nie ma ważnego szkolenia wymaganego tu.
export function OrderChip({ order, warn, compact }) {
    if (!order) return null;
    const cls = order.closed
        ? 'bg-white/5 text-gray-500 line-through decoration-gray-600'
        : warn ? 'bg-red-500/15 text-red-300' : 'bg-blue-500/10 text-blue-300';
    return (
        <span
            title={`${order.name} · ${order.area}${order.closed ? ' · zamknięte — wszystkie pozycje odebrane protokołem' : ''}${warn ? ` · brak ważnego szkolenia: ${warn}` : ''}`}
            className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 align-middle text-[11px] ${compact ? 'max-w-[150px] md:max-w-[130px]' : ''} ${cls}`}>
            {warn ? '⚠ ' : ''}{order.name}
        </span>
    );
}

// @anchor trainings-modal — ramka modala Szkoleń (ciemna, mieści się na tablecie).
export function Modal({ title, onClose, children, footer, width = 'max-w-xl' }) {
    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[6vh]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={`w-full ${width} rounded-xl border border-white/10 bg-[#0b1220] shadow-2xl`} role="dialog" aria-modal="true">
                <div className="flex items-center border-b border-white/[.07] px-5 py-3.5">
                    <h3 className="text-sm font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="ml-auto p-1 text-gray-500 hover:text-gray-200" aria-label="Zamknij"><X size={16} /></button>
                </div>
                <div className="grid gap-3 px-5 py-4">{children}</div>
                {footer && <div className="flex justify-end gap-2 border-t border-white/[.07] px-5 py-3">{footer}</div>}
            </div>
        </div>
    );
}

// @anchor trainings-confirm — potwierdzenie TAK / NIE (bez window.confirm).
export function Confirm({ title, children, onYes, onNo, busy }) {
    return (
        <Modal title={title} onClose={onNo} width="max-w-md" footer={<>
            <button onClick={onNo} className={BTN}>NIE</button>
            <button onClick={onYes} disabled={busy} className={`${BTN} border-red-500/50 bg-red-500/80 text-white hover:bg-red-500`}>TAK</button>
        </>}>
            <div className="text-sm text-gray-300">{children}</div>
        </Modal>
    );
}

// @anchor trainings-ui-classes — wspólne klasy przycisków i pól (cele dotykowe ≥ 36 px na tablecie).
export const BTN = 'min-h-[36px] rounded-md border border-white/15 bg-white/[.04] px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
export const BTN_PRIMARY = 'min-h-[36px] rounded-md border border-teal-500 bg-teal-500 px-3 py-1.5 text-xs font-bold text-teal-950 transition-colors hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40';
export const INPUT = 'min-h-[38px] w-full rounded-md border border-white/15 bg-[#0a1120] px-3 py-2 text-sm text-gray-100 outline-none focus:border-teal-500';
export const LABEL = 'grid content-start gap-1 text-[11px] font-semibold text-gray-400';
