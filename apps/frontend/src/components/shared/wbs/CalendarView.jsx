import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Check } from 'lucide-react';
import { EXEC_STATUS_META, isTaskClosed } from './wbsConstants';

// @anchor task-tile-style — kolor kafelka zadania wg statusu (te same barwy co `EXEC_STATUS_META.color`);
// pełne nazwy klas, bo Tailwind nie widzi klas składanych w locie. `swatch` = kwadracik w legendzie.
export const TASK_TILE_STYLE = {
    TO_DO:       { tile: 'border-slate-400/30 bg-slate-500/15 text-slate-100 hover:border-slate-300/60', swatch: 'bg-slate-500/40 border-slate-400/50' },
    IN_PROGRESS: { tile: 'border-blue-500/30 bg-blue-500/15 text-blue-100 hover:border-blue-400/60',     swatch: 'bg-blue-500/40 border-blue-500/50' },
    ON_HOLD:     { tile: 'border-amber-500/30 bg-amber-500/15 text-amber-100 hover:border-amber-400/60', swatch: 'bg-amber-500/40 border-amber-500/50' },
    DONE:        { tile: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200/70 hover:border-emerald-400/50', swatch: 'bg-emerald-500/40 border-emerald-500/50' },
    CANCELLED:   { tile: 'border-red-500/25 bg-red-500/10 text-red-200/60 hover:border-red-400/50',     swatch: 'bg-red-500/40 border-red-500/50' },
};

// @anchor calendar-view
export default function CalendarView({ userTasks = [], onDrop, onDateClick, onUserTaskDone, onUserTaskClick }) {
    const [viewDate, setViewDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'

    const weekDates = useMemo(() => {
        const d = new Date(viewDate);
        const dow = d.getDay();
        const diff = dow === 0 ? -6 : 1 - dow;
        d.setDate(d.getDate() + diff);
        return Array.from({ length: 7 }, (_, i) => {
            const day = new Date(d);
            day.setDate(d.getDate() + i);
            return day;
        });
    }, [viewDate]);

    const daysInMonth = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];
        const startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        for (let i = startPadding; i > 0; i--) days.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
        for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), isCurrentMonth: true });
        const endPadding = 42 - days.length;
        for (let i = 1; i <= endPadding; i++) days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
        return days;
    }, [viewDate]);

    const navigate = (offset) => {
        const next = new Date(viewDate);
        if (viewMode === 'week') next.setDate(next.getDate() + offset * 7);
        else next.setMonth(next.getMonth() + offset);
        setViewDate(next);
    };

    const monthNames = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
    const weekDays = ["Pn","Wt","Śr","Cz","Pt","Sb","Nd"];

    const isToday = (d) => {
        const t = new Date();
        return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
    };

    const formatDateToYYYYMMDD = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    // @anchor calendar-user-tasks-for-date — UserTaski na dany dzień: każdy dzień od Od (plannedStart) do Do
    // (plannedEnd) w czasie lokalnym; zadanie bez Od — tylko dzień terminu.
    const getUserTasksForDate = (date) => {
        const targetStr = formatDateToYYYYMMDD(date);
        return userTasks.filter(t => {
            const endRef = t.plannedEnd || t.plannedStart;
            if (!endRef) return false;
            const endStr = formatDateToYYYYMMDD(new Date(endRef));
            const startStr = t.plannedStart ? formatDateToYYYYMMDD(new Date(t.plannedStart)) : endStr;
            return targetStr >= startStr && targetStr <= endStr;
        });
    };

    // @anchor calendar-render-user-task — kafelek zadania: kolor wg statusu (`TASK_TILE_STYLE`), godzina Od w dniu
    // startu zadania z godziną, checkbox „zrobione / przywróć", drag do przełożenia. Zamknięte — przekreślone.
    // `_readOnly` (zadanie innej osoby, którego nie zleciłem) = bez checkboxa i bez przeciągania;
    // `_who` = odpowiedzialny, pokazywany gdy kalendarz zawiera zadania wszystkich.
    const renderUserTask = (task, date) => {
        const style = TASK_TILE_STYLE[task.status] || TASK_TILE_STYLE.TO_DO;
        const closed = isTaskClosed(task.status);
        const start = new Date(task.plannedStart || task.plannedEnd);
        const time = task.durationMinutes && formatDateToYYYYMMDD(start) === formatDateToYYYYMMDD(date)
            ? start.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : null;
        return (
            <div
                key={`ut_${task.id}`}
                draggable={!task._readOnly}
                onDragStart={(e) => { if (task._readOnly) return; e.dataTransfer.setData('application/json', JSON.stringify({ id: task.id, _kind: 'user', isMove: true })); }}
                onClick={(e) => { e.stopPropagation(); onUserTaskClick && onUserTaskClick(task); }}
                className={`group/ut relative px-2 py-1.5 border rounded-lg text-[10px] font-bold leading-tight transition-all flex items-center gap-2 pointer-events-auto shadow-sm cursor-pointer ${style.tile} ${task._readOnly ? 'opacity-70' : ''}`}
                title={[task.title, EXEC_STATUS_META[task.status]?.label && `Status: ${EXEC_STATUS_META[task.status].label}`, task.wbsNode?.name && `Pozycja WBS: ${task.wbsNode.name}`, task.node?.name && `Projekt: ${task.node.name}`, task._who && `Odpowiedzialny: ${task._who}`].filter(Boolean).join('\n')}
            >
                {!task._readOnly && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onUserTaskDone && onUserTaskDone(task.id); }}
                        className={`flex-shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${closed ? 'border-emerald-400/60 bg-emerald-400/20 hover:bg-transparent' : 'border-white/30 hover:bg-emerald-400/20 hover:border-emerald-400'}`}
                        title={closed ? 'Przywróć do wykonania' : 'Oznacz jako wykonane'}
                    >
                        <Check size={8} className={closed ? 'text-emerald-300' : 'text-white/30 group-hover/ut:text-emerald-300 transition-colors'} />
                    </button>
                )}
                {time && <span className="flex-shrink-0 font-mono text-[9px] opacity-80">{time}</span>}
                <span className={`truncate flex-1 ${closed ? 'line-through' : ''}`}>{task.title}</span>
                {task._who && <span className="flex-shrink-0 text-[9px] font-semibold opacity-70 truncate max-w-[45%]">{task._who}</span>}
            </div>
        );
    };

    const weekRangeLabel = (() => {
        const s = weekDates[0], e = weekDates[6];
        const sm = String(s.getMonth() + 1).padStart(2, '0');
        const em = String(e.getMonth() + 1).padStart(2, '0');
        return `${s.getDate()}.${sm} – ${e.getDate()}.${em}.${e.getFullYear()}`;
    })();

    const headerTitle = viewMode === 'week' ? weekRangeLabel : `${monthNames[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    const headerSubtitle = viewMode === 'week' ? 'Harmonogram tygodniowy' : 'Harmonogram miesięczny';

    return (
        <div className="flex flex-col h-full bg-black/20 border border-white/5 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl animate-fade-in text-white select-none">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                        <CalendarIcon size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white leading-tight">{headerTitle}</h3>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">{headerSubtitle}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* View toggle */}
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                        <button
                            onClick={() => setViewMode('month')}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'month' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >Miesiąc</button>
                        <button
                            onClick={() => setViewMode('week')}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'week' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >Tydzień</button>
                    </div>
                    {/* Navigation */}
                    <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
                        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"><ChevronLeft size={16} /></button>
                        <button onClick={() => setViewDate(new Date())} className="px-3 py-1 text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">DZISIAJ</button>
                        <button onClick={() => navigate(1)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"><ChevronRight size={16} /></button>
                    </div>
                </div>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-white/5 bg-white/[0.01]">
                {viewMode === 'week'
                    ? weekDates.map((d, i) => (
                        <div key={i} className={`py-2 text-center text-[10px] font-bold uppercase tracking-tighter ${isToday(d) ? 'text-blue-400' : 'text-gray-500'}`}>
                            <div>{weekDays[i]}</div>
                            <div className={`text-[11px] font-mono mt-0.5 ${isToday(d) ? 'bg-blue-600 text-white rounded-md px-1 inline-block' : 'text-gray-600'}`}>{d.getDate()}</div>
                        </div>
                    ))
                    : weekDays.map(d => (
                        <div key={d} className="py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{d}</div>
                    ))
                }
            </div>

            {/* Grid */}
            {viewMode === 'month' ? (
                <div className="flex-1 grid grid-cols-7 grid-rows-6 auto-rows-fr overflow-hidden bg-black/10">
                    {daysInMonth.map((day, i) => {
                        const isTodayFlag = isToday(day.date);
                        return (
                            <div
                                key={i}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDrop(e, day.date)}
                                onClick={() => onDateClick && onDateClick(day.date)}
                                className={`relative min-h-[80px] border-r border-b border-white/[0.05] flex flex-col group transition-all ${!day.isCurrentMonth ? 'bg-black/40 opacity-20' : 'bg-transparent'} hover:bg-white/[0.05] active:bg-white/[0.08] cursor-pointer`}
                            >
                                <div className="p-2 flex justify-between items-start pointer-events-none">
                                    <span className={`text-[11px] font-mono font-bold leading-none ${isTodayFlag ? 'bg-blue-600 text-white px-1.5 py-1 rounded-lg scale-110 shadow-lg shadow-blue-500/40' : 'text-gray-400'}`}>
                                        {day.date.getDate()}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 scrollbar-hide pointer-events-none">
                                    {getUserTasksForDate(day.date).map((task) => renderUserTask(task, day.date))}
                                </div>
                                <div className="absolute inset-0 border-2 border-transparent group-hover:border-blue-500/40 pointer-events-none transition-all" />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex-1 grid grid-cols-7 overflow-y-auto bg-black/10">
                    {weekDates.map((date, i) => {
                        const dateTasks = getUserTasksForDate(date);
                        return (
                            <div
                                key={i}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDrop(e, date)}
                                onClick={() => onDateClick && onDateClick(date)}
                                className="relative border-r border-white/[0.05] flex flex-col group transition-all hover:bg-white/[0.05] cursor-pointer min-h-[300px]"
                            >
                                <div className="flex-1 p-1.5 space-y-1.5">
                                    {dateTasks.map((task) => renderUserTask(task, date))}
                                    {dateTasks.length === 0 && (
                                        <div className="h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                            <span className="text-[9px] text-gray-600">+ dodaj</span>
                                        </div>
                                    )}
                                </div>
                                <div className="absolute inset-0 border-2 border-transparent group-hover:border-blue-500/40 pointer-events-none transition-all" />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
