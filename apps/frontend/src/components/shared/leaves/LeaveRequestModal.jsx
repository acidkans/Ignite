import { API_URL } from '../../../config';
import { useEffect, useMemo, useState } from 'react';
import { CARE_LEAVE_CODE, SATURDAY_HOLIDAY_CODE, LEAVE_TYPES_REQUIRING_COMMENT, LEAVE_COMMENT_MIN_LENGTH, CARE_LEAVE_COMMENT_HINT } from './leavesTheme';
import { nonWorkingDayReason, nextWorkingDayFrom, previousWorkingDayFrom } from './polishHolidays';

// @anchor day-off-notice
// Komunikat pod polem daty: dlaczego wybrany dzien odpadl i na co zostal przestawiony.
// Czerwony, bo ma rzucac sie w oczy — zmiana zaszla bez udzialu uzytkownika.
const DayOffNotice = ({ notice }) => {
    const dzien = (d) => d.split('-').reverse().join('.');
    return (
        <p className="text-[11px] text-red-400">
            {dzien(notice.wybrany)} — to {notice.powod}, urlopu nie bierze się w dzień wolny.
            Ustawiliśmy {dzien(notice.ustawiony)}.
        </p>
    );
};

// @anchor leave-request-modal
// Modal „Nowy wniosek urlopowy" — układ wg formularza źródłowego:
// Imię Nazwisko, rodzaj_urlopu, data_od, data_do, komentarz, dni_urlopu.
// Sekcja rozwijana: obecność w biurze + saldo dni pozostałych do wybrania.
export default function LeaveRequestModal({ request, leaveTypes, employees, currentUserId, canPickEmployee, onClose, onSuccess }) {
    const isEdit = !!request?.id;

    // datetime-local: "YYYY-MM-DDTHH:mm"
    const toLocal = (v, fallback) => {
        if (!v) return fallback || '';
        const d = new Date(v);
        if (isNaN(d.getTime())) return fallback || '';
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const pad = n => String(n).padStart(2, '0');

    // @anchor next-working-day
    // Domyslna data wniosku nie moze wypasc w dzien wolny — urlopu udziela sie w dni pracy,
    // a wyliczanie dni pomija weekendy i swieta, wiec sobota jako start dawala 0 dni.
    const nextWorkingDayStr = (from) => {
        const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
        // weekend i swieta omija `next-working-day-from` — jedna lista dla domyslnej daty
        // i dla bezpiecznika przy recznym wyborze
        return nextWorkingDayFrom(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    };
    const dayStr = nextWorkingDayStr(new Date());

    const [form, setForm] = useState({
        userId: request?.userId || currentUserId || '',
        leaveTypeId: request?.leaveTypeId || '',
        dependentId: request?.dependentId || '',
        holidayDayOffId: request?.holidayDayOffId || '',
        dateStart: toLocal(request?.dateStart, `${dayStr}T00:00`),
        dateEnd: toLocal(request?.dateEnd, `${dayStr}T23:59`),
        comment: request?.comment || '',
        daysCount: request?.daysCount ?? 1,
        officeFrom: toLocal(request?.officeFrom, ''),
        officeTo: toLocal(request?.officeTo, ''),
    });
    // @anchor days-touched
    // Dopóki użytkownik nie nadpisze pola ręcznie, liczba dni jest wyliczana z zakresu dat.
    const [daysTouched, setDaysTouched] = useState(!!request?.id);
    // @anchor end-auto-adjusted
    // true = date „do" przestawil bezpiecznik, bo wypadala przed data „od". Pole robi sie
    // czerwone z notka, zeby zmiana nie przeszla niezauwazona; gasnie po recznej edycji „do".
    const [endAutoAdjusted, setEndAutoAdjusted] = useState(false);
    // @anchor day-notices
    // Komunikat „wybrany dzien jest wolny" osobno dla kazdej z dat:
    // { powod: 'sobota' | 'niedziela' | nazwa swieta, wybrany, ustawiony }. null = dzien roboczy.
    const [dayNotices, setDayNotices] = useState({ dateStart: null, dateEnd: null });
    const setDayNotice = (field, notice) => setDayNotices(n => (n[field] === notice ? n : { ...n, [field]: notice }));
    const [dependents, setDependents] = useState([]);
    const [loadingDependents, setLoadingDependents] = useState(false);
    // @anchor leave-request-modal-balance
    // Saldo puli dni wybranego pracownika — źródło kolumn „urlop z <rok>" i blokady wysyłki.
    const [balance, setBalance] = useState(null);
    // @anchor leave-request-modal-type-usage
    const [typeUsage, setTypeUsage] = useState(null);
    const [showExtra, setShowExtra] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    // @anchor is-care-leave
    const isCareLeave = useMemo(
        () => leaveTypes.find(t => t.id === form.leaveTypeId)?.code === CARE_LEAVE_CODE,
        [leaveTypes, form.leaveTypeId]
    );

    // @anchor is-saturday-holiday-leave
    const isSaturdayHolidayLeave = useMemo(
        () => leaveTypes.find(t => t.id === form.leaveTypeId)?.code === SATURDAY_HOLIDAY_CODE,
        [leaveTypes, form.leaveTypeId]
    );

    // @anchor holiday-days-state
    // Swieta w sobote zatwierdzone przez admina — lista do wyboru we wniosku.
    const [holidayDays, setHolidayDays] = useState([]);
    const [loadingHolidayDays, setLoadingHolidayDays] = useState(false);
    // @anchor holiday-days-error
    // Nieudane pobranie listy NIE moze udawac „admin nic nie zatwierdzil" — to dwa rozne stany.
    const [holidayDaysError, setHolidayDaysError] = useState(null);

    // @anchor fetch-holiday-days
    // Sciagane dopiero gdy rodzaj = za swieto w sobote, dla roku z daty rozpoczecia.
    useEffect(() => {
        if (!isSaturdayHolidayLeave || !form.userId) { setHolidayDays([]); setHolidayDaysError(null); return; }
        let cancelled = false;
        setLoadingHolidayDays(true);
        setHolidayDaysError(null);
        const token = sessionStorage.getItem('token');
        const year = Number((form.dateStart || '').slice(0, 4)) || new Date().getFullYear();
        const params = new URLSearchParams({ userId: form.userId, year: String(year) });
        if (request?.id) params.set('requestId', request.id);
        fetch(`${API_URL}/leave-requests/holiday-days?${params}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(async res => {
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message || `Nie udało się pobrać listy świąt (HTTP ${res.status}).`);
                }
                return res.json();
            })
            .then(data => {
                if (cancelled) return;
                const items = data?.items || [];
                setHolidayDays(items);
                const free = items.filter(i => !i.used);
                setForm(f => ({
                    ...f,
                    // jedno wolne swieto — wybierane automatycznie, bez dropdownu
                    holidayDayOffId: free.length === 1
                        ? free[0].id
                        : (free.some(i => i.id === f.holidayDayOffId) ? f.holidayDayOffId : ''),
                }));
            })
            .catch(err => { if (!cancelled) { setHolidayDays([]); setHolidayDaysError(err.message); } })
            .finally(() => { if (!cancelled) setLoadingHolidayDays(false); });
        return () => { cancelled = true; };
    }, [isSaturdayHolidayLeave, form.userId, form.dateStart, request?.id]);

    // @anchor allows-hourly
    // Podzial na godziny zalezy od rodzaju urlopu — kolumna LeaveType.allowsHourly.
    // Pelnodniowe rodzaje dostaja sam kalendarz, godzinowe kalendarz + pelna godzine.
    const allowsHourly = useMemo(
        () => !!leaveTypes.find(t => t.id === form.leaveTypeId)?.allowsHourly,
        [leaveTypes, form.leaveTypeId]
    );

    // @anchor hour-options
    // Do wyboru wylacznie pelne godziny — minuty zawsze 00, tak samo waliduje backend.
    const HOUR_OPTIONS = useMemo(
        () => Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
        []
    );

    const dayPart = v => (v || '').slice(0, 10);
    const hourPart = v => (v || '').slice(11, 13);

    // @anchor set-day-part
    // Zmiana daty zachowuje godzine; przy rodzaju pelnodniowym doklejamy granice doby.
    // Bezpiecznik: przesuniecie daty „od" za date „do" pociaga „do" za soba, zeby zakres
    // nigdy nie byl odwrocony. Zmiane sygnalizujemy na czerwono — patrz `end-auto-adjusted`.
    const setDayPart = (field, wybranyDzien, fallbackTime) => {
        if (!wybranyDzien) {
            setDayNotice(field, null);
            return set(field, '');
        }

        // Bezpiecznik 1: weekend i swieto. Nie blokujemy zapisu — przesuwamy wybor na
        // sasiedni dzien roboczy i mowimy, dlaczego, bo urlopu w dzien wolny sie nie bierze.
        // Poczatek idzie w przod, koniec COFA sie do poprzedniego dnia roboczego — inaczej
        // zamkniecie urlopu w sobote wydluzaloby nieobecnosc o poniedzialek.
        const powod = nonWorkingDayReason(wybranyDzien);
        let day = wybranyDzien;
        if (powod) {
            day = field === 'dateEnd' ? previousWorkingDayFrom(wybranyDzien) : nextWorkingDayFrom(wybranyDzien);
            // cofniecie nie moze wjechac przed date „od" — wtedy urlop trwa jeden dzien
            if (field === 'dateEnd' && day < dayPart(form.dateStart)) day = dayPart(form.dateStart);
        }
        setDayNotice(field, powod ? { powod, wybrany: wybranyDzien, ustawiony: day } : null);

        const time = allowsHourly ? `${hourPart(form[field]) || '00'}:00` : fallbackTime;
        const value = `${day}T${time}`;

        if (field === 'dateEnd') {
            // reczna zmiana daty „do" kasuje ostrzezenie o odwroconym zakresie —
            // uzytkownik wlasnie podal swoja wartosc
            setEndAutoAdjusted(false);
            return set(field, value);
        }

        if (field !== 'dateStart') return set(field, value);

        // Bezpiecznik 2: data „od" nie moze wyprzedzic daty „do" — koniec idzie za poczatkiem.
        setForm(f => {
            const next = { ...f, dateStart: value };
            if (dayPart(f.dateEnd) >= day) return next;
            // przy rodzaju godzinowym koniec nie moze wypasc przed poczatkiem tej samej doby
            const endHour = allowsHourly
                ? String(Math.max(Number(hourPart(f.dateEnd) || '00'), Number(hourPart(value) || '00'))).padStart(2, '0')
                : null;
            next.dateEnd = allowsHourly ? `${day}T${endHour}:00` : `${day}T23:59`;
            return next;
        });
        setEndAutoAdjusted(dayPart(form.dateEnd) < day);
    };

    const setHourPart = (field, hour) => {
        const day = dayPart(form[field]);
        if (!day) return;
        set(field, `${day}T${hour}:00`);
    };

    // @anchor normalize-times-on-type-change
    // Przelaczenie rodzaju nie moze zostawic minut z poprzedniego formularza:
    // pelnodniowy = 00:00 / 23:59, godzinowy = pelna godzina.
    useEffect(() => {
        setForm(f => {
            const startDay = dayPart(f.dateStart);
            const endDay = dayPart(f.dateEnd);
            if (!startDay || !endDay) return f;
            const nextStart = allowsHourly ? `${startDay}T${hourPart(f.dateStart) || '00'}:00` : `${startDay}T00:00`;
            const nextEnd = allowsHourly ? `${endDay}T${hourPart(f.dateEnd) || '00'}:00` : `${endDay}T23:59`;
            if (f.dateStart === nextStart && f.dateEnd === nextEnd) return f;
            return { ...f, dateStart: nextStart, dateEnd: nextEnd };
        });
    }, [allowsHourly]);

    // @anchor comment-required
    // Rodzaje z ustawowym wymogiem uzasadnienia (dziś: opieka, art. 173(1) par. 5 KP).
    const commentRequired = useMemo(
        () => LEAVE_TYPES_REQUIRING_COMMENT.includes(
            leaveTypes.find(t => t.id === form.leaveTypeId)?.code
        ),
        [leaveTypes, form.leaveTypeId]
    );

    // @anchor comment-block
    // Ten sam warunek co w back-funkcja assertCommentValid — blokuje wysyłkę zanim poleci request.
    const commentBlock = !commentRequired
        ? null
        : !form.comment.trim()
            ? CARE_LEAVE_COMMENT_HINT
            : form.comment.trim().length < LEAVE_COMMENT_MIN_LENGTH
                ? `Twoje uzasadnienie jest za krótkie — potrzeba min. ${LEAVE_COMMENT_MIN_LENGTH} znaków.`
                : null;

    // @anchor fetch-dependents
    // Podopieczni sciagani dopiero gdy rodzaj = opieka — i zawsze dla wybranego pracownika.
    useEffect(() => {
        if (!isCareLeave || !form.userId) { setDependents([]); return; }
        let cancelled = false;
        setLoadingDependents(true);
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/dependents?userId=${form.userId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => (res.ok ? res.json() : []))
            .then(list => {
                if (cancelled) return;
                setDependents(list);
                // jeden podopieczny — wybierany automatycznie, bez dropdownu
                setForm(f => ({
                    ...f,
                    dependentId: list.length === 1
                        ? list[0].id
                        : (list.some(d => d.id === f.dependentId) ? f.dependentId : ''),
                }));
            })
            .catch(() => { if (!cancelled) setDependents([]); })
            .finally(() => { if (!cancelled) setLoadingDependents(false); });
        return () => { cancelled = true; };
    }, [isCareLeave, form.userId]);

    // @anchor fetch-leave-balance
    useEffect(() => {
        if (!form.userId) { setBalance(null); return; }
        let cancelled = false;
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/leave-balances?userId=${form.userId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (!cancelled) setBalance(data); })
            .catch(() => { if (!cancelled) setBalance(null); });
        return () => { cancelled = true; };
    }, [form.userId]);

    // @anchor fetch-type-usage
    /// Ile dni wybrano i ile zostało z każdego rodzaju urlopu — liczy backend,
    /// tymi samymi regułami, którymi blokuje wysyłkę wniosku.
    useEffect(() => {
        if (!form.userId) { setTypeUsage(null); return; }
        let cancelled = false;
        const token = sessionStorage.getItem('token');
        const year = Number((form.dateStart || '').slice(0, 4)) || new Date().getFullYear();
        fetch(`${API_URL}/leave-requests/type-usage?userId=${form.userId}&year=${year}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (!cancelled) setTypeUsage(data); })
            .catch(() => { if (!cancelled) setTypeUsage(null); });
        return () => { cancelled = true; };
    }, [form.userId, form.dateStart]);

    // @anchor selected-type-usage
    const selectedUsage = useMemo(
        () => (typeUsage?.items || []).find(i => i.leaveTypeId === form.leaveTypeId) || null,
        [typeUsage, form.leaveTypeId]
    );

    // @anchor selected-type-consumes-balance
    const consumesBalance = useMemo(
        () => !!leaveTypes.find(t => t.id === form.leaveTypeId)?.consumesBalance,
        [leaveTypes, form.leaveTypeId]
    );

    // @anchor working-days-between-front
    // Dni od poczatku do konca wlacznie, z pominieciem sobot i niedziel.
    // 11.08 00:00 → 12.08 23:59 to dwa dni; weekend w zakresie nie jest liczony.
    const workingDays = (startLocal, endLocal) => {
        if (!startLocal || !endLocal) return 0;
        const [ay, am, ad] = startLocal.slice(0, 10).split('-').map(Number);
        const [by, bm, bd] = endLocal.slice(0, 10).split('-').map(Number);
        const start = Date.UTC(ay, am - 1, ad);
        const end = Date.UTC(by, bm - 1, bd);
        if (isNaN(start) || isNaN(end) || end < start) return 0;
        let days = 0;
        for (let ms = start; ms <= end; ms += 86400000) {
            const dow = new Date(ms).getUTCDay();
            if (dow !== 0 && dow !== 6) days++;
        }
        return days;
    };

    // @anchor auto-days-count
    useEffect(() => {
        if (daysTouched) return;
        setForm(f => {
            const computed = workingDays(f.dateStart, f.dateEnd);
            return f.daysCount === computed ? f : { ...f, daysCount: computed };
        });
    }, [form.dateStart, form.dateEnd, daysTouched]);

    const selectedDependent = dependents.find(d => d.id === form.dependentId) || null;

    const formatBirthDate = (v) => {
        if (!v) return '—';
        const d = new Date(v);
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pl-PL');
    };

    const ageOf = (v) => {
        const d = new Date(v);
        if (isNaN(d.getTime())) return null;
        const now = new Date();
        let age = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
        return age;
    };

    // @anchor leave-request-balance-block
    // Wymaganie: bez dostępnych dni w puli nie da się złożyć wniosku o urlop konsumujący saldo.
    const totalRemaining = balance?.totalRemaining ?? 0;
    const requestedDays = Number(form.daysCount) || 0;
    const balanceBlock = !consumesBalance || !balance
        ? null
        : totalRemaining <= 0
            ? 'Nie masz już wolnych dni urlopu — sprawdź saldo w zakładce „Moje dane”.'
            : requestedDays > totalRemaining
                ? `Chcesz wziąć ${requestedDays} dni, a zostało Ci ${totalRemaining}. Skróć termin.`
                : null;

    // @anchor submit-block
    // Jedyne zrodlo prawdy o gotowosci wniosku: wyszarza przycisk „Zloz wniosek",
    // niesie powod w tooltipie i sluzy za walidacje przy zapisie. Kolejnosc = kolejnosc pol
    // w formularzu, zeby komunikat wskazywal pierwsze brakujace pole od gory.
    const submitBlock = useMemo(() => {
        if (!form.userId) return 'Wybierz pracownika.';
        if (!form.leaveTypeId) return 'Wybierz rodzaj urlopu.';
        if (isCareLeave && !form.dependentId) return 'Wskaż, kim się opiekujesz.';
        if (isSaturdayHolidayLeave && !form.holidayDayOffId) {
            return 'Wskaż, za które sobotnie święto odbierasz dzień wolny.';
        }
        if (!form.dateStart || !form.dateEnd) return 'Podaj datę od i datę do.';
        if (form.dateEnd < form.dateStart) return 'Data „do" wypada przed datą „od" — popraw termin.';
        if (commentBlock) return commentBlock;
        if (!(Number(form.daysCount) > 0)) return 'Zaznacz przynajmniej jeden dzień pracy.';
        if (balanceBlock) return balanceBlock;
        return null;
    }, [
        form.userId, form.leaveTypeId, form.dependentId, form.holidayDayOffId,
        form.dateStart, form.dateEnd, form.daysCount,
        isCareLeave, isSaturdayHolidayLeave, commentBlock, balanceBlock,
    ]);

    const handleSave = async () => {
        setError(null);
        if (submitBlock) return setError(submitBlock);

        const payload = {
            userId: form.userId,
            leaveTypeId: form.leaveTypeId || null,
            dependentId: isCareLeave ? form.dependentId : null,
            holidayDayOffId: isSaturdayHolidayLeave ? form.holidayDayOffId : null,
            dateStart: new Date(form.dateStart).toISOString(),
            dateEnd: new Date(form.dateEnd).toISOString(),
            // urlop pelnodniowy nie niesie godzin — wniosek obejmuje caly dzien pracy
            timeStart: allowsHourly ? `${hourPart(form.dateStart) || '00'}:00` : null,
            timeEnd: allowsHourly ? `${hourPart(form.dateEnd) || '00'}:00` : null,
            comment: form.comment || null,
            daysCount: Number(form.daysCount) || 1,
            officeFrom: form.officeFrom ? new Date(form.officeFrom).toISOString() : null,
            officeTo: form.officeTo ? new Date(form.officeTo).toISOString() : null,
        };

        setSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-requests${isEdit ? `/${request.id}` : ''}`, {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Nie udało się zapisać wniosku — spróbuj jeszcze raz.');
            }
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

    const inputCls = 'bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50';
    const labelCls = 'text-xs text-gray-400 uppercase tracking-widest';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={handleBackdrop}>
            <div className="relative bg-gray-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">{isEdit ? 'Edycja wniosku urlopowego' : 'Nowy wniosek urlopowy'}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none">&times;</button>
                </div>

                {error && <div className="p-3 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-sm">{error}</div>}

                {/* @anchor leave-request-balance-banner */}
                {consumesBalance && balance && (
                    <div className={`p-2 rounded text-xs border ${balanceBlock ? 'bg-red-600/15 border-red-500/40 text-red-300' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                        Dostępne dni urlopu: <span className="font-semibold">{totalRemaining}</span>
                        {balanceBlock ? ` — ${balanceBlock}` : ''}
                    </div>
                )}

                {/* Imię Nazwisko */}
                <div className="flex flex-col gap-1">
                    <label className={labelCls}>Imię Nazwisko <span className="text-amber-500">*</span></label>
                    <select
                        value={form.userId}
                        onChange={e => set('userId', e.target.value)}
                        disabled={!canPickEmployee}
                        className={`bg-gray-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50 ${!canPickEmployee ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        <option value="">— wybierz —</option>
                        {employees.map(u => (
                            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                        ))}
                    </select>
                </div>

                {/* rodzaj_urlopu */}
                <div className="flex flex-col gap-1">
                    <label className={labelCls}>Rodzaj urlopu <span className="text-amber-500">*</span></label>
                    <select
                        value={form.leaveTypeId}
                        onChange={e => set('leaveTypeId', e.target.value)}
                        className="bg-gray-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                    >
                        <option value="">— wybierz —</option>
                        {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>

                    {/* @anchor leave-request-type-usage-info */}
                    {selectedUsage && (
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs bg-white/5 border border-white/10 rounded px-3 py-2">
                            <span className="text-gray-500">
                                w {typeUsage?.year} roku wybrano:
                                <span className="ml-1 text-gray-200 font-semibold">{selectedUsage.used}</span> dni
                            </span>
                            {selectedUsage.pending > 0 && (
                                <span className="text-amber-400">w tym oczekuje: {selectedUsage.pending}</span>
                            )}
                            {selectedUsage.limit === null ? (
                                <span className="text-gray-500">bez limitu rocznego</span>
                            ) : (
                                <span className={selectedUsage.remaining > 0 ? 'text-green-400' : 'text-red-400'}>
                                    zostało: <span className="font-semibold">{selectedUsage.remaining}</span> z {selectedUsage.limit}
                                    {selectedUsage.source ? <span className="text-gray-600"> ({selectedUsage.source})</span> : null}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Podopieczny — tylko dla urlopu opiekuńczego */}
                {/* @anchor leave-request-dependent-section */}
                {isCareLeave && (
                    <div className="flex flex-col gap-2 border border-teal-500/30 bg-teal-500/[0.06] rounded-lg p-3">
                        <label className={labelCls}>Podopieczny <span className="text-amber-500">*</span></label>

                        {loadingDependents ? (
                            <p className="text-sm text-gray-500">Wczytywanie podopiecznych...</p>
                        ) : dependents.length === 0 ? (
                            <p className="text-sm text-amber-300">
                                Nie masz jeszcze zapisanych podopiecznych. Dodaj ich w zakładce „Moje dane”,
                                sekcja Podopieczni.
                            </p>
                        ) : (
                            <>
                                {dependents.length > 1 && (
                                    <select
                                        value={form.dependentId}
                                        onChange={e => set('dependentId', e.target.value)}
                                        className="bg-gray-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500/50"
                                    >
                                        <option value="">— wybierz podopiecznego —</option>
                                        {dependents.map(d => (
                                            <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                                        ))}
                                    </select>
                                )}

                                {selectedDependent && (
                                    <div className="grid grid-cols-3 gap-3 pt-1">
                                        <div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Imię</p>
                                            <p className="text-sm text-gray-200">{selectedDependent.firstName}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Nazwisko</p>
                                            <p className="text-sm text-gray-200">{selectedDependent.lastName}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Data urodzenia</p>
                                            <p className="text-sm text-gray-200">
                                                {formatBirthDate(selectedDependent.birthDate)}
                                                {ageOf(selectedDependent.birthDate) !== null && (
                                                    <span className="text-gray-500"> ({ageOf(selectedDependent.birthDate)} l.)</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* @anchor leave-request-holiday-field */}
                {isSaturdayHolidayLeave && (
                    <div className="flex flex-col gap-2 border border-lime-500/30 bg-lime-500/[0.06] rounded-lg p-3">
                        <label className={labelCls}>Za które święto <span className="text-amber-500">*</span></label>

                        {loadingHolidayDays ? (
                            <p className="text-sm text-gray-500">Wczytywanie listy świąt...</p>
                        ) : holidayDaysError ? (
                            <p className="text-sm text-red-300">{holidayDaysError}</p>
                        ) : holidayDays.length === 0 ? (
                            <p className="text-sm text-amber-300">
                                Na ten rok nie ma jeszcze zatwierdzonego żadnego sobotniego święta — daj znać administratorowi.
                            </p>
                        ) : holidayDays.every(h => h.used) ? (
                            <p className="text-sm text-amber-300">
                                Za każde zatwierdzone święto już złożyłeś wniosek — nie ma czego odbierać.
                            </p>
                        ) : (
                            <select
                                value={form.holidayDayOffId}
                                onChange={e => set('holidayDayOffId', e.target.value)}
                                className="bg-gray-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-lime-500/50"
                            >
                                <option value="">— wybierz święto —</option>
                                {holidayDays.map(h => (
                                    <option key={h.id} value={h.id} disabled={h.used}>
                                        {h.date} — {h.name}{h.used ? ' (już odebrane)' : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                )}

                {/* data_od / data_do */}
                {/* @anchor leave-request-date-fields */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                        <label className={labelCls}>Data od <span className="text-amber-500">*</span></label>
                        <div className="flex gap-2">
                            {/* @anchor leave-request-date-start-input */}
                            <input
                                type="date"
                                value={dayPart(form.dateStart)}
                                onChange={e => setDayPart('dateStart', e.target.value, '00:00')}
                                className={`${
                                    dayNotices.dateStart
                                        ? `${inputCls.replace('text-white', 'text-red-400 font-semibold')} border-red-500/60`
                                        : inputCls
                                } flex-1 min-w-0`}
                            />
                            {allowsHourly && (
                                <select
                                    value={hourPart(form.dateStart) || '00'}
                                    onChange={e => setHourPart('dateStart', e.target.value)}
                                    className="bg-gray-800 border border-white/10 rounded px-2 py-2 text-white focus:outline-none focus:border-blue-500/50"
                                >
                                    {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}:00</option>)}
                                </select>
                            )}
                        </div>
                        {/* @anchor leave-request-date-start-notice */}
                        {dayNotices.dateStart && <DayOffNotice notice={dayNotices.dateStart} />}
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className={labelCls}>Data do <span className="text-amber-500">*</span></label>
                        <div className="flex gap-2">
                            {/* @anchor leave-request-date-end-input */}
                            {/* Kolor podmieniamy w `inputCls`, a nie dopisujemy obok — `text-white`
                                i `text-red-400` maja ta sama specyficznosc, wiec dopisany przegrywa. */}
                            <input
                                type="date"
                                value={dayPart(form.dateEnd)}
                                onChange={e => setDayPart('dateEnd', e.target.value, '23:59')}
                                className={`${
                                    endAutoAdjusted || dayNotices.dateEnd
                                        ? `${inputCls.replace('text-white', 'text-red-400 font-semibold')} border-red-500/60`
                                        : inputCls
                                } flex-1 min-w-0`}
                            />
                            {allowsHourly && (
                                <select
                                    value={hourPart(form.dateEnd) || '00'}
                                    onChange={e => setHourPart('dateEnd', e.target.value)}
                                    className="bg-gray-800 border border-white/10 rounded px-2 py-2 text-white focus:outline-none focus:border-blue-500/50"
                                >
                                    {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}:00</option>)}
                                </select>
                            )}
                        </div>
                        {/* @anchor leave-request-date-end-notice */}
                        {dayNotices.dateEnd && <DayOffNotice notice={dayNotices.dateEnd} />}
                        {/* @anchor leave-request-date-end-adjusted-note */}
                        {endAutoAdjusted && (
                            <p className="text-[11px] text-red-400">
                                Data „do" wypadała przed datą „od" — ustawiliśmy ją na ten sam dzień. Popraw, jeśli urlop ma trwać dłużej.
                            </p>
                        )}
                    </div>
                </div>

                {/* komentarz */}
                {/* @anchor leave-request-comment-field */}
                <div className="flex flex-col gap-1">
                    <label className={labelCls}>
                        {commentRequired ? 'Uzasadnienie' : 'Komentarz'}
                        {commentRequired && <span className="text-amber-500"> *</span>}
                    </label>
                    <textarea
                        rows={commentRequired ? 3 : 1}
                        value={form.comment}
                        onChange={e => set('comment', e.target.value)}
                        placeholder={commentRequired ? 'np. Matka po zabiegu, wymaga stałej opieki — stopień pokrewieństwa: matka' : ''}
                        className={`${inputCls} resize-y ${commentRequired && commentBlock ? 'border-amber-500/50' : ''}`}
                    />
                    {commentRequired && (
                        <p className="text-[11px] text-amber-300/80 leading-snug">
                            {CARE_LEAVE_COMMENT_HINT} Imię i nazwisko podopiecznego bierzemy z pola powyżej.
                        </p>
                    )}
                </div>

                {/* dni_urlopu */}
                {/* @anchor leave-request-days-field */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between">
                        <label className={labelCls}>Dni urlopu</label>
                        {daysTouched ? (
                            <button
                                type="button"
                                onClick={() => { setDaysTouched(false); set('daysCount', workingDays(form.dateStart, form.dateEnd)); }}
                                className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                przelicz z dat
                            </button>
                        ) : (
                            <span className="text-[10px] text-gray-500">wyliczane z dat, bez sobot i niedziel</span>
                        )}
                    </div>
                    <input
                        type="number" step="0.5" min="0"
                        value={form.daysCount}
                        onChange={e => { setDaysTouched(true); set('daysCount', e.target.value); }}
                        placeholder="1"
                        className={inputCls}
                    />
                </div>

                {/* Sekcja dodatkowa */}
                <button
                    type="button"
                    onClick={() => setShowExtra(v => !v)}
                    className="text-left text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                    {showExtra ? '▼' : '▶'} Obecność w biurze i saldo dni
                </button>

                {showExtra && (
                    <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className={labelCls}>W biurze od</label>
                                <input type="datetime-local" value={form.officeFrom} onChange={e => set('officeFrom', e.target.value)} className={inputCls} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className={labelCls}>W biurze do</label>
                                <input type="datetime-local" value={form.officeTo} onChange={e => set('officeTo', e.target.value)} className={inputCls} />
                            </div>
                        </div>

                        {/* @anchor leave-request-balance-grid */}
                        {/* Lata liczone dynamicznie z salda (rok bieżący i 4 wstecz) — wartości tylko do odczytu. */}
                        <div className="flex items-baseline justify-between">
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Dni jeszcze do wybrania</p>
                            <span className="text-[10px] text-gray-600">z puli urlopowej pracownika</span>
                        </div>
                        {balance?.years?.length ? (
                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${balance.years.length}, minmax(0, 1fr))` }}>
                                {balance.years.map(y => (
                                    <div key={y.year} className="flex flex-col gap-1">
                                        <span className="text-[10px] text-gray-500">{y.year}</span>
                                        <span className={`px-2 py-1.5 rounded border border-white/10 text-sm ${y.remainingDays > 0 ? 'text-green-300 bg-green-500/5' : 'text-gray-600 bg-white/5'}`}>
                                            {y.remainingDays}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">Brak ustawionej puli dni urlopowych.</p>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={onClose} className="px-4 py-2 rounded bg-white/5 hover:bg-white/10 text-gray-300 transition-all">Anuluj</button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !!submitBlock}
                        title={submitBlock || undefined}
                        className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Zapisywanie...' : isEdit ? 'Zapisz' : 'Złóż wniosek'}
                    </button>
                </div>
            </div>
        </div>
    );
}
