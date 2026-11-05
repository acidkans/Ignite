// Czas harmonogramu — czysta logika dat wspólna dla Harmonogramu (Planowanie i Realizacja),
// `useRealizationData` i eksportów. Przeniesione z dawnego GanttSection (gantt-task-react usunięty):
// polskie święta, dni robocze, długość pozycji z ilości/jednostki, domyślne daty pasków
// (`ganttDatesByNode`) i siatka eksportu Excel. Koniec zadania (`end`) jest WYŁĄCZNY.
export const DAY_MS = 24 * 60 * 60 * 1000;

// @anchor is-valid-gantt-date
// Data nadająca się na oś harmonogramu — odrzuca Invalid Date i rok spoza zakresu (niedokończone wpisywanie).
export const isValidGanttDate = (d) => { const x = new Date(d); return !isNaN(x.getTime()) && x.getFullYear() >= 2000 && x.getFullYear() <= 2200; };

const easterDate = (year) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const L = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * L) / 451);
    const month = Math.floor((h + L - 7 * m + 114) / 31);
    const day = ((h + L - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
};

const _holidaysCache = {};
const polishHolidaysSet = (year) => {
    if (_holidaysCache[year]) return _holidaysCache[year];
    const easter = easterDate(year);
    const easterMon = new Date(easter); easterMon.setDate(easter.getDate() + 1);
    const corpusChristi = new Date(easter); corpusChristi.setDate(easter.getDate() + 60);
    const days = [
        new Date(year, 0, 1), new Date(year, 0, 6),
        easter, easterMon,
        new Date(year, 4, 1), new Date(year, 4, 3),
        corpusChristi,
        new Date(year, 7, 15),
        new Date(year, 10, 1), new Date(year, 10, 11),
        new Date(year, 11, 25), new Date(year, 11, 26),
    ];
    const set = new Set(days.map(d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`));
    _holidaysCache[year] = set;
    return set;
};

export const isPolishHoliday = (date) => {
    const set = polishHolidaysSet(date.getFullYear());
    return set.has(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
};

export const isWorkType = (t) => {
    const s = String(t || '').toLowerCase();
    return s === 'work' || s === 'praca';
};
export const isMaterialType = (t) => {
    const s = String(t || '').toLowerCase();
    return s === 'material' || s === 'materiał' || s === 'materiał';
};
export const isServiceType = (t) => {
    const s = String(t || '').toLowerCase();
    return s === 'service' || s === 'usługa' || s === 'usluga' || s === 'pakiet' || s === 'komplet';
};
// Packet types: show as resizable bars (not milestones), duration = quantity days
export const isPacketType = (t) => {
    const s = String(t || '').toLowerCase();
    return s === 'pakiet' || s === 'komplet';
};
// @anchor is-milestone-type — milestone (typ węzła WBS) bez importu z `wbsConstants`, żeby ten moduł
// został czysty i dał się testować w Node (`test/`). Lustro `isMilestoneNode` z `wbsConstants.js`.
export const isMilestoneType = (t) => String((t && typeof t === 'object') ? t.type : t || '').toLowerCase() === 'milestone';
export const isDayUnit = (u) => { const s = String(u || '').toLowerCase().trim(); return s === 'dni' || s === 'dzień' || s === 'dzien' || s === 'd' || s === ''; };
const isPacketUnit = (u) => { const s = String(u || '').toLowerCase().trim(); return s === 'pakiet' || s === 'komplet'; };

// Pozostałe jednostki czasu pracy — przeliczane na długość paska zamiast traktowania jak pakiet (1 dzień).
const isHourUnit = (u) => ['godziny', 'godzina', 'godz', 'godz.', 'h', 'rbh', 'roboczogodziny'].includes(u);
const isWeekUnit = (u) => ['tygodnie', 'tydzień', 'tydzien', 'tyg', 'tyg.'].includes(u);
const isMonthUnit = (u) => ['miesiące', 'miesiace', 'miesiąc', 'miesiac', 'mies', 'mies.', 'm-c', 'mc'].includes(u);
const HOURS_PER_WORKDAY = 8;
const WORKDAYS_PER_WEEK = 5;

// Czas pracy w miesiącach kalendarzowych (0 gdy jednostka nie jest miesięczna) — koniec paska
// liczony datą (+N miesięcy), nie stałą liczbą dni roboczych.
// @anchor node-duration-months
const nodeDurationMonths = (node) => {
    if (!isWorkType(node.type)) return 0;
    const u = String(node.unit || '').toLowerCase().trim();
    const qty = Number(String(node.quantity ?? '').replace(',', '.')) || 0;
    return isMonthUnit(u) && qty > 0 ? qty : 0;
};

// Koniec (wyłączny) okresu N miesięcy od startu; część ułamkowa jako 30-dniowe miesiące.
// @anchor add-calendar-months
const addCalendarMonths = (start, months) => {
    const whole = Math.floor(months);
    const d = new Date(start);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + whole);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    const fracDays = Math.round((months - whole) * 30);
    if (fracDays > 0) d.setDate(d.getDate() + fracDays);
    return d;
};

export const nodeDurationDays = (node) => {
    const u = String(node.unit || '').toLowerCase().trim();
    const qty = Number(String(node.quantity ?? '').replace(',', '.')) || 0;
    if (isWorkType(node.type) && qty > 0) {
        if (isDayUnit(u)) return Math.max(1, Math.round(qty));
        if (isHourUnit(u)) return Math.max(1, Math.ceil(qty / HOURS_PER_WORKDAY));
        if (isWeekUnit(u)) return Math.max(1, Math.round(qty * WORKDAYS_PER_WEEK));
    }
    // Packet types (type=pakiet/komplet) or work with packet units → use qty as gantt days, min 1
    if (isPacketType(node.type) || (isWorkType(node.type) && isPacketUnit(u))) {
        return qty > 0 ? Math.max(1, Math.round(qty)) : 1;
    }
    return 0;
};

export const isNonWorkingDay = (date) => {
    const dow = date.getDay();
    return dow === 0 || dow === 6 || isPolishHoliday(date);
};

export const advanceToWorkingDay = (date) => {
    const d = new Date(date);
    while (isNonWorkingDay(d)) d.setDate(d.getDate() + 1);
    return d;
};

export const retreatToWorkingDay = (date) => {
    const d = new Date(date);
    while (isNonWorkingDay(d)) d.setDate(d.getDate() - 1);
    return d;
};

export const addWorkingDays = (start, dur) => {
    const d = new Date(start);
    let remaining = dur;
    while (remaining > 0) {
        d.setDate(d.getDate() + 1);
        if (!isNonWorkingDay(new Date(d.getTime() - DAY_MS))) {
            remaining -= 1;
        }
    }
    return d;
};

// branchWorkOnHolidays: { [nodeId]: boolean } – per-branch setting for depth-0 nodes
export const buildTasksFromTree = (items, projectStart, projectName, overrides, branchWorkOnHolidays) => {
    const tasks = [];
    const taskBranchMap = {};
    const branchNameMap = {};
    let cursor = new Date(projectStart);
    cursor.setHours(0, 0, 0, 0);
    let rootMaxEnd = new Date(cursor);

    const hasWorkOrServiceLeaf = (node) => {
        if (isWorkType(node.type) || isServiceType(node.type) || isMilestoneType(node.type)) return true;
        if (Array.isArray(node.children) && node.children.length > 0) {
            return node.children.some(hasWorkOrServiceLeaf);
        }
        return false;
    };

    const walk = (nodes, parentId, depth, branchWow, currentBranchId) => {
        let groupStart = null;
        let groupEnd = null;

        for (const node of nodes) {
            const hasChildren = Array.isArray(node.children) && node.children.length > 0;
            // Węzeł typu praca/usługa jest zadaniem (pasek) — niezależnie od tego czy ma dzieci.
            // Tylko węzeł innego typu z dziećmi jest czysto grupującą gałęzią (bez paska).
            // Milestone też jest zadaniem — rombem (1 dzień) albo rombem z okienkiem `ganttStart..ganttEnd`.
            const isMs = isMilestoneType(node.type);
            const isTaskNode = isWorkType(node.type) || isServiceType(node.type) || isMs;
            if (!hasChildren && !isTaskNode) continue;
            if (hasChildren && !isTaskNode && !hasWorkOrServiceLeaf(node)) continue;

            const niceName = String(node.name || '').trim() || '(bez nazwy)';

            const wow = depth === 0 ? (branchWorkOnHolidays[node.id] ?? false) : branchWow;
            const thisBranchId = depth === 0 ? node.id : currentBranchId;
            if (depth === 0) branchNameMap[node.id] = niceName;

            // Czysto grupująca gałąź (nie-zadanie z dziećmi) — bez paska, schodzimy w dzieci.
            if (hasChildren && !isTaskNode) {
                if (depth === 0 && !wow) cursor = advanceToWorkingDay(cursor);
                walk(node.children, parentId, depth + 1, wow, thisBranchId);
                continue;
            }

            {
                taskBranchMap[node.id] = thisBranchId;
                if (depth === 0 && !wow) cursor = advanceToWorkingDay(cursor);

                // Per-task WoH override — jeśli zadanie ma własne ustawienie, nadpisuje gałąź
                const effectiveWow = Object.prototype.hasOwnProperty.call(branchWorkOnHolidays, node.id)
                    ? branchWorkOnHolidays[node.id]
                    : wow;
                const dur = nodeDurationDays(node);
                const durMonths = nodeDurationMonths(node);
                const ovr = overrides?.[node.id];
                let start, end, type;
                // tylko praca z jednostką dni może aktualizować ilość przez timeline
                const canUpdateDuration = isWorkType(node.type) && isDayUnit(node.unit);
                const defaultStart = effectiveWow ? new Date(projectStart) : advanceToWorkingDay(new Date(projectStart));
                if (isMs) {
                    // Milestone: zapisane okno albo jeden dzień od domyślnego startu; nie przesuwa kursora.
                    const zapisane = ovr?.start && ovr?.end && isValidGanttDate(ovr.start) && isValidGanttDate(ovr.end);
                    start = zapisane ? new Date(ovr.start) : defaultStart;
                    end = zapisane ? new Date(ovr.end) : new Date(start.getTime() + DAY_MS);
                    if (end <= start) end = new Date(start.getTime() + DAY_MS);
                    type = 'milestone';
                } else if (ovr?.start && ovr?.end && isValidGanttDate(ovr.start) && isValidGanttDate(ovr.end)) {
                    start = new Date(ovr.start);
                    end = new Date(ovr.end);
                    type = 'task';
                } else if (durMonths > 0) {
                    // Miesiąc = dni robocze w danym miesiącu kalendarzowym (bez weekendów i świąt, ~20–21),
                    // niezależnie od ustawienia pracy w święta gałęzi.
                    start = defaultStart;
                    const monthsEnd = addCalendarMonths(start, durMonths);
                    let workDays = 0;
                    for (const c = new Date(start); c < monthsEnd; c.setDate(c.getDate() + 1)) {
                        if (!isNonWorkingDay(c)) workDays++;
                    }
                    workDays = Math.max(1, workDays);
                    end = effectiveWow
                        ? new Date(start.getTime() + workDays * DAY_MS)
                        : addWorkingDays(start, workDays);
                    type = 'task';
                } else if (dur > 0) {
                    start = defaultStart;
                    end = effectiveWow
                        ? new Date(start.getTime() + dur * DAY_MS)
                        : addWorkingDays(start, dur);
                    type = 'task';
                } else {
                    // Praca z jednostką inną niż dni (sztuki, kpl, usługa…) — pasek 1-dniowy,
                    // rozciągalny; resize zmienia tylko ganttStart/ganttEnd, nie quantity/unit.
                    start = defaultStart;
                    end = new Date(start.getTime() + DAY_MS);
                    type = 'task';
                }
                tasks.push({
                    id: node.id,
                    type,
                    name: niceName,
                    start,
                    end,
                    progress: 0,
                    project: parentId || undefined,
                    _canUpdateDuration: canUpdateDuration && !isMs,
                    depth,
                    node,
                });
                cursor = new Date(end);
                if (!groupStart || start < groupStart) groupStart = start;
                if (!groupEnd || end > groupEnd) groupEnd = end;
            }

            // Zadanie może mieć też dzieci (np. praca z pod-usługą) — po dodaniu własnego
            // paska schodzimy w dzieci, żeby i one dostały swoje paski.
            if (hasChildren) {
                walk(node.children, parentId, depth + 1, wow, thisBranchId);
            }
        }
        if (groupEnd && groupEnd > rootMaxEnd) rootMaxEnd = new Date(groupEnd);
    };

    walk(items, null, 0, false, null);
    return { tasks, taskBranchMap, branchNameMap };
};

// Data "Do" jest domknięta (= ostatni dzień zadania). Wewnętrznie task.end jest
// wykluczające (dzień po ostatnim), więc do wyświetlenia odejmujemy 1 dzień.
export const inclusiveEnd = (d) => new Date(new Date(d).getTime() - DAY_MS);

// @anchor data-lokalna-iso — 'RRRR-MM-DD' w czasie lokalnym (pole <input type="date">); '' dla braku daty.
export const dataLokalnaIso = (d) => {
    if (!d || !isValidGanttDate(d)) return '';
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// @anchor zakres-dni-do-gantt — dni od..ost (włącznie, 'RRRR-MM-DD') → `{ ganttStart, ganttEnd }`
// w konwencji Harmonogramu: lokalna północ, koniec wyłączny. Pusty/wcześniejszy `ost` = jeden dzień.
export const zakresDniDoGantt = (od, ost) => {
    const [y, m, d] = String(od).split('-').map(Number);
    const s = new Date(y, m - 1, d);
    let e = s;
    if (ost) { const [y2, m2, d2] = String(ost).split('-').map(Number); e = new Date(y2, m2 - 1, d2); }
    if (e < s) e = s;
    const koniec = new Date(e); koniec.setDate(koniec.getDate() + 1);
    return { ganttStart: s.toISOString(), ganttEnd: koniec.toISOString() };
};

// @anchor gantt-daty-wezlow — daty pasków tak, jak je rysuje Gantt: zapisane `ganttStart/End`
// albo domyślne (start projektu + czas trwania), których Gantt NIE zapisuje do bazy, dopóki
// ktoś nie ruszy paska. Bez tego Realizacja widziała tylko ręcznie poprawione paski.
// `items` = drzewo (z `children`); zwraca { [id]: { od, do } }, `do` = ostatni dzień (domknięty).
export const ganttDatesByNode = (items, projectStartDate) => {
    const start = projectStartDate && isValidGanttDate(projectStartDate)
        ? new Date(String(projectStartDate).slice(0, 10))
        : new Date();
    start.setHours(0, 0, 0, 0);
    const overrides = {};
    const walk = (nodes) => {
        for (const n of nodes || []) {
            if (n.ganttStart && n.ganttEnd) overrides[n.id] = { start: n.ganttStart, end: n.ganttEnd };
            walk(n.children);
        }
    };
    walk(items);
    const { tasks } = buildTasksFromTree(items || [], start, '', overrides, {});
    const out = {};
    for (const t of tasks) {
        if (t && isValidGanttDate(t.start) && isValidGanttDate(t.end)) out[t.id] = { od: t.start, do: new Date(Math.max(+t.start, +inclusiveEnd(t.end))) };
    }
    return out;
};
// ExcelJS serializuje daty wg składowych UTC — daty z aplikacji są o północy
// lokalnej, więc bez konwersji plik cofa dzień o dobę. Budujemy północ UTC
// z lokalnego dnia kalendarzowego.
export const toExcelUtcDate = (d) => {
    const x = new Date(d);
    return new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()));
};

export const taskDays = (task, branchWorkOnHolidays = {}, taskBranchMap = {}) => {
    if (task.type === 'milestone') return 0;
    const start = new Date(task.start); start.setHours(0, 0, 0, 0);
    const end   = new Date(task.end);   end.setHours(0, 0, 0, 0);
    const branchId = taskBranchMap[task.id];
    const wow = Object.prototype.hasOwnProperty.call(branchWorkOnHolidays, task.id)
        ? branchWorkOnHolidays[task.id]
        : (branchWorkOnHolidays[branchId] ?? false);
    if (wow) return Math.max(0, Math.round((end - start) / DAY_MS));
    let count = 0;
    const cur = new Date(start);
    while (cur < end) { if (!isNonWorkingDay(cur)) count++; cur.setDate(cur.getDate() + 1); }
    return count;
};


// Buduje siatkę timeline do eksportu Excel — kolumny grupowane wg widoku Gantta
// (dzień/tydzień/miesiąc). Kolory komórek odwzorowują wykres: niebieski = dzień
// roboczy zadania, szary = weekend/święto, marker start/koniec projektu.
// @anchor build-excel-timeline
export const buildExcelTimeline = (tasks, viewMode, branchWorkOnHolidays, taskBranchMap, projectStart, projectEnd) => {
    const empty = { mode: viewMode, columns: [], rowCells: tasks.map(() => []) };
    if (!tasks.length) return empty;

    let earliest = tasks[0].start, latest = tasks[0].end;
    for (const t of tasks) {
        if (t.start < earliest) earliest = t.start;
        if (t.end > latest) latest = t.end;
    }
    const lo = new Date(earliest); lo.setHours(0, 0, 0, 0);
    const hi = new Date(latest); hi.setHours(0, 0, 0, 0);
    const ps = projectStart ? new Date(`${projectStart}T00:00:00`) : null;
    const pe = projectEnd ? new Date(`${projectEnd}T00:00:00`) : null;
    let loMs = lo.getTime();
    let hiMs = hi.getTime(); // task.end jest wykluczające
    if (ps) loMs = Math.min(loMs, ps.getTime());
    if (pe) hiMs = Math.max(hiMs, pe.getTime() + DAY_MS);

    const days = [];
    for (let ms = loMs; ms < hiMs; ms += DAY_MS) days.push(new Date(ms));
    if (!days.length) return empty;

    // Wypełnienie per zadanie per dzień — dzień roboczy w zakresie zadania = niebieski
    const fillByTask = tasks.map(t => {
        const ts = new Date(t.start); ts.setHours(0, 0, 0, 0);
        const te = new Date(t.end); te.setHours(0, 0, 0, 0);
        const branchId = taskBranchMap[t.id];
        const wow = Object.prototype.hasOwnProperty.call(branchWorkOnHolidays, t.id)
            ? branchWorkOnHolidays[t.id]
            : (branchWorkOnHolidays[branchId] ?? false);
        return days.map(d => {
            // Milestone: romb jednego dnia albo całe okno (dni kalendarzowe, termin to termin).
            if (t.type === 'milestone') return te > ts ? (d >= ts && d < te) : d.getTime() === ts.getTime();
            if (d < ts || d >= te) return false;
            return wow || !isNonWorkingDay(d);
        });
    });

    // Grupowanie dni w kolumny wg widoku
    const groups = [];
    if (viewMode === 'Day') {
        days.forEach((_, i) => groups.push([i]));
    } else if (viewMode === 'Week') {
        let cur = [];
        days.forEach((d, i) => {
            if (cur.length && d.getDay() === 1) { groups.push(cur); cur = []; }
            cur.push(i);
        });
        if (cur.length) groups.push(cur);
    } else {
        let cur = [], curKey = null;
        days.forEach((d, i) => {
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (cur.length && key !== curKey) { groups.push(cur); cur = []; }
            cur.push(i); curKey = key;
        });
        if (cur.length) groups.push(cur);
    }

    const psMs = ps ? ps.getTime() : null;
    const peMs = pe ? pe.getTime() : null;
    const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
    const dd = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

    const columns = groups.map(idxs => {
        const first = days[idxs[0]];
        const last = days[idxs[idxs.length - 1]];
        let label, nonWorking = false;
        if (viewMode === 'Day') {
            label = dd(first);
            nonWorking = isNonWorkingDay(first);
        } else if (viewMode === 'Week') {
            label = dd(first);
        } else {
            label = `${MONTHS[first.getMonth()]} ${String(first.getFullYear()).slice(2)}`;
        }
        const inRange = (ms) => ms != null && ms >= first.getTime() && ms <= last.getTime();
        let marker = null;
        if (inRange(psMs)) marker = 'start';
        if (inRange(peMs)) marker = marker === 'start' ? 'both' : 'end';
        return { label, nonWorking, marker };
    });

    const rowCells = fillByTask.map(fill => groups.map(idxs => idxs.some(i => fill[i])));
    const holidays = days.filter(d => isPolishHoliday(d)).map(toExcelUtcDate);

    return { mode: viewMode, columns, rowCells, holidays };
};
