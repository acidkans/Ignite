import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, X } from 'lucide-react';

// @anchor calendar-view
export default function CalendarView({ subtasks, categories, onDrop, onDateClick, onTaskClick, onRemoveTask, onUpdateTask }) {
    const [viewDate, setViewDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'
    const [resizingTask, setResizingTask] = useState(null);

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

    const getTasksForDate = (date) => {
        const targetStr = formatDateToYYYYMMDD(date);
        return subtasks.map(s => resizingTask && resizingTask.id === s.id ? { ...s, plannedEnd: resizingTask.newEnd } : s)
            .filter(s => {
                if (!s.plannedStart) return false;
                const datePart = s.plannedStart.split('T')[0];
                const endPart = (s.plannedEnd || s.plannedStart).split('T')[0];
                return targetStr >= datePart && targetStr <= endPart;
            });
    };

    const getTaskStyle = (task, date) => {
        const cat = categories?.find(c => c.label === task.category);
        const color = cat?.color || 'blue';
        const isStart = task.plannedStart.startsWith(formatDateToYYYYMMDD(date));
        const isEnd = (task.plannedEnd || task.plannedStart).startsWith(formatDateToYYYYMMDD(date));
        const base = task.status === 'FINISHED'
            ? `bg-${color}-500/10 border-${color}-500/30 text-${color}-400 opacity-60`
            : `bg-${color}-500/20 border-${color}-500/30 text-${color}-100 hover:border-${color}-400/60 hover:bg-${color}-500/30 shadow-sm`;
        const borderRadius = `${isStart ? 'rounded-l-lg' : 'rounded-l-none'} ${isEnd ? 'rounded-r-lg' : 'rounded-r-none'}`;
        return `${base} ${borderRadius}`;
    };

    const handleResizeStart = (e, task) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingTask({ id: task.id, newEnd: task.plannedEnd || task.plannedStart });
        const onMouseUp = () => {
            setResizingTask(current => {
                if (current && onUpdateTask) {
                    const original = subtasks.find(s => s.id === current.id);
                    if (original && original.plannedEnd !== current.newEnd) onUpdateTask({ ...original, plannedEnd: current.newEnd });
                }
                return null;
            });
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleCellMouseEnter = (date) => {
        if (resizingTask) {
            const dateStr = formatDateToYYYYMMDD(date) + "T23:59:59";
            const task = subtasks.find(s => s.id === resizingTask.id);
            if (task && dateStr >= task.plannedStart) setResizingTask(prev => ({ ...prev, newEnd: dateStr }));
        }
    };

    const renderTask = (task, date) => {
        const cat = categories?.find(c => c.label === task.category);
        const color = cat?.color || 'blue';
        const dateStr = formatDateToYYYYMMDD(date);
        const isEnd = (task.plannedEnd || task.plannedStart).startsWith(dateStr);
        return (
            <div
                key={`${task.id}_${task.plannedStart}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ id: task.id, isMove: true, requirementItemId: task.requirementItemId, phase: task.phase }))}
                onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                className={`group/task relative px-2 py-1.5 border text-[10px] font-bold leading-tight transition-all cursor-pointer flex items-center gap-2 pointer-events-auto ${getTaskStyle(task, date)} ${resizingTask?.id === task.id ? 'ring-2 ring-blue-500/50 scale-[1.02] z-50' : ''}`}
            >
                <div className="flex-shrink-0"><Clock size={10} /></div>
                <span className="truncate flex-1">{task.name}</span>
                {isEnd && (
                    <div
                        onMouseDown={(e) => handleResizeStart(e, task)}
                        className={`absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-${color}-400/20 rounded-r-lg flex items-center justify-center group-hover/task:bg-white/5`}
                    >
                        <div className="w-0.5 h-3 bg-white/20 rounded-full" />
                    </div>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); onRemoveTask(task.requirementItemId, task.phase, task.id); }}
                    className="opacity-0 group-hover/task:opacity-100 p-0.5 hover:bg-red-500/20 rounded text-red-400 transition-all z-10"
                >
                    <X size={10} />
                </button>
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
                        const dateTasks = getTasksForDate(day.date);
                        const isTodayFlag = isToday(day.date);
                        return (
                            <div
                                key={i}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDrop(e, day.date)}
                                onClick={() => !resizingTask && onDateClick && onDateClick(day.date)}
                                onMouseEnter={() => handleCellMouseEnter(day.date)}
                                className={`relative min-h-[80px] border-r border-b border-white/[0.05] flex flex-col group transition-all ${!day.isCurrentMonth ? 'bg-black/40 opacity-20' : 'bg-transparent'} hover:bg-white/[0.05] active:bg-white/[0.08] cursor-pointer`}
                            >
                                <div className="p-2 flex justify-between items-start pointer-events-none">
                                    <span className={`text-[11px] font-mono font-bold leading-none ${isTodayFlag ? 'bg-blue-600 text-white px-1.5 py-1 rounded-lg scale-110 shadow-lg shadow-blue-500/40' : 'text-gray-400'}`}>
                                        {day.date.getDate()}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 scrollbar-hide pointer-events-none">
                                    {dateTasks.map((task) => renderTask(task, day.date))}
                                </div>
                                <div className="absolute inset-0 border-2 border-transparent group-hover:border-blue-500/40 pointer-events-none transition-all" />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex-1 grid grid-cols-7 overflow-y-auto bg-black/10">
                    {weekDates.map((date, i) => {
                        const dateTasks = getTasksForDate(date);
                        return (
                            <div
                                key={i}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDrop(e, date)}
                                onClick={() => !resizingTask && onDateClick && onDateClick(date)}
                                onMouseEnter={() => handleCellMouseEnter(date)}
                                className="relative border-r border-white/[0.05] flex flex-col group transition-all hover:bg-white/[0.05] cursor-pointer min-h-[300px]"
                            >
                                <div className="flex-1 p-1.5 space-y-1.5">
                                    {dateTasks.map((task) => renderTask(task, date))}
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
