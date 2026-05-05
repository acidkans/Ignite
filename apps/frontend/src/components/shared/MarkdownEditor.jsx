import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsRight, ChevronsLeft, LayoutList, X, FileDown, ChevronDown } from 'lucide-react';

// Wspólny edytor markdown z toolbarem (B, H1-H3, Lista, 1., wcięcie/cofnięcie + Tab) i podglądem
// (multi-level numeracja: 1, 1.1, 1.1.1 …, hanging indent w flexie — bez wyjścia poza obramówkę).
// Stosowany w "Cel projektu" (RequirementsTab) oraz w "Jak to chcemy zrobić" (UnifiedWbsPanel/Strategy).
export default function MarkdownEditor({
    value = '',
    onChange,
    onSave = null,
    onExportPDF = null,
    placeholder = '',
    className = '',
    containerClassName = '',
    saveDebounceMs = 1500,
    previewTitle = 'Podgląd',
    saveIndicator = false,
    presets = null,
    onManagePresets = null,
}) {
    const taRef = useRef(null);
    const saveTimeoutRef = useRef(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [presetsOpen, setPresetsOpen] = useState(false);

    const triggerSave = useCallback((nextVal, immediate = false) => {
        if (!onSave) return;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        const doSave = async () => {
            setSaving(true);
            try {
                await Promise.resolve(onSave(nextVal, immediate));
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            } catch (e) {
                console.error('[MarkdownEditor save]', e);
            } finally {
                setSaving(false);
            }
        };
        if (immediate) doSave();
        else saveTimeoutRef.current = setTimeout(doSave, saveDebounceMs);
    }, [onSave, saveDebounceMs]);

    // Focus + setSelectionRange BEZ przewijania textareay i modalu/strony.
    const restoreFocus = (selStart, selEnd) => {
        const ta = taRef.current;
        if (!ta) return;
        const savedScrollTop = ta.scrollTop;
        const savedScrollLeft = ta.scrollLeft;
        try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
        ta.setSelectionRange(selStart, selEnd);
        ta.scrollTop = savedScrollTop;
        ta.scrollLeft = savedScrollLeft;
    };

    const updateValue = (next, selStart, selEnd) => {
        onChange?.(next);
        setTimeout(() => restoreFocus(selStart, selEnd), 0);
        triggerSave(next);
    };

    // Bold: jeśli jest zaznaczenie — pogrubia zaznaczenie; bez zaznaczenia — pogrubia całą bieżącą linię
    // (z pominięciem prefiksu listy "- "/"1. " i wcięć), co jest naturalne dla Markdown.
    const boldAction = () => {
        const ta = taRef.current;
        if (!ta) return;
        const text = ta.value;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        if (end > start) {
            const selected = text.slice(start, end);
            const insert = `**${selected}**`;
            const next = `${text.slice(0, start)}${insert}${text.slice(end)}`;
            updateValue(next, start + insert.length, start + insert.length);
            return;
        }
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const lineEndIdx = text.indexOf('\n', start);
        const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
        const lineText = text.slice(lineStart, lineEnd);
        if (!lineText.trim()) return;
        const m = lineText.match(/^(\s*(?:- |\d+\. )?)(.*?)(\s*)$/);
        const lead = m ? m[1] : '';
        const content = m ? m[2] : lineText;
        const trail = m ? m[3] : '';
        if (!content) return;
        const newLine = `${lead}**${content}**${trail}`;
        const next = `${text.slice(0, lineStart)}${newLine}${text.slice(lineEnd)}`;
        const cursorPos = lineStart + lead.length + 2 + content.length + 2;
        updateValue(next, cursorPos, cursorPos);
    };

    const prefixSelectionLines = (prefix) => {
        const ta = taRef.current;
        if (!ta) return;
        const text = ta.value;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const selected = text.slice(start, end);
        let next, cursorPos;
        if (selected) {
            const transformed = selected.split('\n').map(line => `${prefix}${line}`).join('\n');
            next = `${text.slice(0, start)}${transformed}${text.slice(end)}`;
            cursorPos = start + transformed.length;
        } else {
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            next = `${text.slice(0, lineStart)}${prefix}${text.slice(lineStart)}`;
            cursorPos = lineStart + prefix.length + (start - lineStart);
        }
        updateValue(next, cursorPos, cursorPos);
    };

    const indentSelectionLines = (unit = '  ') => {
        const ta = taRef.current;
        if (!ta) return;
        const text = ta.value;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = end > start ? end : (text.indexOf('\n', start) === -1 ? text.length : text.indexOf('\n', start));
        const block = text.slice(lineStart, lineEnd);
        const transformed = block.split('\n').map(l => `${unit}${l}`).join('\n');
        const next = `${text.slice(0, lineStart)}${transformed}${text.slice(lineEnd)}`;
        const newStart = start + unit.length;
        const newEnd = end + unit.length * (block.split('\n').length);
        updateValue(next, newStart, newEnd);
    };

    const outdentSelectionLines = (unit = '  ') => {
        const ta = taRef.current;
        if (!ta) return;
        const text = ta.value;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = end > start ? end : (text.indexOf('\n', start) === -1 ? text.length : text.indexOf('\n', start));
        const block = text.slice(lineStart, lineEnd);
        let removedFirst = 0, removedTotal = 0;
        const transformed = block.split('\n').map((l, i) => {
            if (l.startsWith(unit)) {
                if (i === 0) removedFirst = unit.length;
                removedTotal += unit.length;
                return l.slice(unit.length);
            }
            return l;
        }).join('\n');
        const next = `${text.slice(0, lineStart)}${transformed}${text.slice(lineEnd)}`;
        const newStart = Math.max(lineStart, start - removedFirst);
        const newEnd = Math.max(newStart, end - removedTotal);
        updateValue(next, newStart, newEnd);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) outdentSelectionLines();
            else indentSelectionLines();
            return;
        }
        if (e.key !== 'Enter') return;
        const ta = taRef.current;
        if (!ta) return;
        const text = ta.value;
        const pos = ta.selectionStart;
        const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
        const lineEnd = text.indexOf('\n', pos);
        const fullLine = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
        const ulMatch = fullLine.match(/^(\s*)- (.*)/);
        const olMatch = fullLine.match(/^(\s*)(\d+)\. (.*)/);
        if (ulMatch) {
            e.preventDefault();
            const indent = ulMatch[1];
            const content = ulMatch[2].trim();
            const prefixLen = indent.length + 2;
            let newText, np;
            if (!content) { newText = text.slice(0, lineStart) + text.slice(lineStart + prefixLen); np = lineStart; }
            else { const insert = `\n${indent}- `; newText = text.slice(0, pos) + insert + text.slice(pos); np = pos + insert.length; }
            updateValue(newText, np, np);
            return;
        }
        if (olMatch) {
            e.preventDefault();
            const indent = olMatch[1];
            const n = parseInt(olMatch[2], 10);
            const content = olMatch[3].trim();
            const prefixLen = indent.length + String(n).length + 2;
            let newText, np;
            if (!content) { newText = text.slice(0, lineStart) + text.slice(lineStart + prefixLen); np = lineStart; }
            else { const insert = `\n${indent}${n + 1}. `; newText = text.slice(0, pos) + insert + text.slice(pos); np = pos + insert.length; }
            updateValue(newText, np, np);
        }
    };

    const renderHtml = (text) => {
        const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const lines = (text || '').split('\n');
        const indentLevel = (ws) => Math.floor((ws || '').replace(/\t/g, '  ').length / 2);
        const isTableRow = (l) => l.trimStart().startsWith('|');
        const isSepRow = (l) => /^\s*\|[\s\-:|]+\|\s*$/.test(l);
        const parseCells = (l) => l.split('|').slice(1, -1).map(c => c.trim());
        let html = '';
        let olCounters = [];
        const resetOl = () => { olCounters = []; };
        let idx = 0;
        while (idx < lines.length) {
            const raw = lines[idx];
            if (isTableRow(raw)) {
                const block = [];
                while (idx < lines.length && isTableRow(lines[idx])) { block.push(lines[idx]); idx++; }
                const sepIdx = block.findIndex(isSepRow);
                const heads = sepIdx > 0 ? block.slice(0, sepIdx) : [block[0]];
                const body = sepIdx >= 0 ? block.slice(sepIdx + 1) : block.slice(1);
                resetOl();
                html += `<table style="border-collapse:collapse;width:100%;margin:10px 0;font-size:13px">`;
                html += `<thead><tr>${parseCells(heads[0]).map(c => `<th style="font-size:15px;font-weight:bold;text-align:left;border-bottom:2px solid #555;padding:5px 10px;background:rgba(255,255,255,0.04)">${bold(c)}</th>`).join('')}</tr></thead>`;
                html += `<tbody>${body.map(dr => `<tr>${parseCells(dr).map(c => `<td style="font-weight:normal;padding:4px 10px;border-bottom:1px solid rgba(255,255,255,0.08)">${bold(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
                html += `</table>`;
                continue;
            }
            const h3m = raw.match(/^### (.+)/);
            const h2m = raw.match(/^## (.+)/);
            const h1m = raw.match(/^# (.+)/);
            const ulm = raw.match(/^(\s*)- (.*)/);
            const olm = raw.match(/^(\s*)(\d+)\. (.*)/);
            if (h3m) { resetOl(); html += `<h3 style="font-size:12px;font-weight:bold;margin:12px 0 2px 0;padding-left:4em">${bold(h3m[1])}</h3>`; }
            else if (h2m) { resetOl(); html += `<h2 style="font-size:13px;font-weight:bold;margin:14px 0 3px 0;padding-left:2em">${bold(h2m[1])}</h2>`; }
            else if (h1m) { resetOl(); html += `<h1 style="font-size:14px;font-weight:bold;margin:16px 0 4px 0;padding-left:0">${bold(h1m[1])}</h1>`; }
            else if (ulm) {
                resetOl();
                const L = indentLevel(ulm[1]);
                html += `<div style="display:flex;margin:2px 0;padding-left:${L * 1.5}em"><span style="display:inline-block;width:1.2em;flex-shrink:0">•</span><span style="flex:1;min-width:0">${bold(ulm[2])}</span></div>`;
            } else if (olm) {
                const L = indentLevel(olm[1]);
                const N = parseInt(olm[2], 10);
                while (olCounters.length > L + 1) olCounters.pop();
                if (olCounters.length === L + 1) olCounters[L] = N;
                else { while (olCounters.length < L) olCounters.push(1); olCounters.push(N); }
                const num = olCounters.join('.') + '.';
                const numColEm = Math.max(2, num.length * 0.55 + 0.4);
                html += `<div style="display:flex;margin:2px 0;padding-left:${L * 1.5}em"><strong style="display:inline-block;width:${numColEm}em;flex-shrink:0">${num}</strong><span style="flex:1;min-width:0">${bold(olm[3])}</span></div>`;
            } else if (raw.trim() === '') {
                resetOl();
                html += '<br>';
            } else {
                resetOl();
                html += `<p style="margin:0 0 4px 0">${bold(raw)}</p>`;
            }
            idx++;
        }
        return html;
    };

    const insertPreset = (text) => {
        const ta = taRef.current;
        setPresetsOpen(false);
        if (!ta) { onChange?.(text); triggerSave(text); return; }
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? start;
        const current = ta.value;
        const prefix = current.length > 0 && !current.endsWith('\n') ? '\n\n' : '';
        const next = current.slice(0, start) + prefix + text + current.slice(end);
        updateValue(next, start + prefix.length + text.length, start + prefix.length + text.length);
    };

    const handleChange = (e) => {
        const next = e.target.value;
        onChange?.(next);
        triggerSave(next);
    };

    const handleBlur = () => {
        if (onSave) triggerSave(value, true);
    };

    const btnCls = "px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all";
    const iconBtnCls = "p-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 transition-all";

    return (
        <>
            <div className={`flex flex-col min-h-0 ${containerClassName}`}>
                {saveIndicator && (
                    <div className="flex justify-end h-4 mb-1">
                        {saving && <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Zapisywanie...</span>}
                        {saved && !saving && <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Zapisano</span>}
                    </div>
                )}
                <div className="flex items-center gap-1 mb-2 flex-wrap">
                    <button type="button" onClick={() => boldAction()} className={btnCls} title="Pogrubienie (zaznaczenie lub cała linia)">B</button>
                    <button type="button" onClick={() => prefixSelectionLines('# ')} className={btnCls} title="Nagłówek H1">H1</button>
                    <button type="button" onClick={() => prefixSelectionLines('## ')} className={btnCls} title="Nagłówek H2">H2</button>
                    <button type="button" onClick={() => prefixSelectionLines('### ')} className={btnCls} title="Nagłówek H3">H3</button>
                    <button type="button" onClick={() => prefixSelectionLines('- ')} className={btnCls} title="Lista punktowana">Lista</button>
                    <button type="button" onClick={() => prefixSelectionLines('1. ')} className={btnCls} title="Lista numerowana (Tab/Shift+Tab dla zagnieżdżania)">1.</button>
                    <button type="button" onClick={() => outdentSelectionLines()} className={iconBtnCls} title="Cofnij wcięcie (Shift+Tab)"><ChevronsLeft size={12} /></button>
                    <button type="button" onClick={() => indentSelectionLines()} className={iconBtnCls} title="Wcięcie (Tab)"><ChevronsRight size={12} /></button>
                    <button type="button" onClick={() => setPreviewOpen(true)} className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all">
                        <LayoutList size={11} /> Podgląd
                    </button>
                    {(presets || onManagePresets) && (
                        <div className="relative flex items-center gap-1">
                            {presets && presets.length > 0 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setPresetsOpen(p => !p)}
                                        className="flex items-center gap-1 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded text-amber-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                                    >
                                        Wstaw szablon <ChevronDown size={10} />
                                    </button>
                                    {presetsOpen && (
                                        <div className="absolute left-0 top-full mt-1 z-50 bg-[#0d1520] border border-white/10 rounded-xl shadow-2xl min-w-[260px] py-1">
                                            {presets.map((p, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => insertPreset(p.text)}
                                                    className="w-full text-left px-4 py-2 text-xs text-gray-200 hover:bg-white/10 transition-colors"
                                                >
                                                    {p.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                            {onManagePresets && (
                                <button
                                    type="button"
                                    onClick={onManagePresets}
                                    className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-gray-400 hover:text-gray-200 text-[10px] transition-all"
                                    title="Zarządzaj szablonami"
                                >
                                    ⚙
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <textarea
                    ref={taRef}
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    className={className}
                    placeholder={placeholder}
                />
            </div>
            {previewOpen && createPortal(
                <div className="fixed inset-0 z-[120] bg-[#05070bcc] backdrop-blur-sm flex flex-col">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0b0f17]">
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Podgląd: {previewTitle}</h3>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Pełny viewport</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {onExportPDF && (
                                <button type="button" onClick={onExportPDF} className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-red-300 text-[10px] font-bold uppercase tracking-widest transition-all">
                                    <FileDown size={11} /> PDF
                                </button>
                            )}
                            <button type="button" onClick={() => setPreviewOpen(false)} className="p-2 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all" aria-label="Zamknij podgląd">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto px-8 py-6 custom-scrollbar">
                        <div className="mx-auto max-w-5xl bg-black/40 border border-white/10 rounded-2xl p-8 min-h-full text-gray-200 leading-relaxed">
                            <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: renderHtml(value || 'Brak treści') }} />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
