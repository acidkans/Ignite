// Dni ustawowo wolne od pracy — odpowiednik `back-funkcja` HolidaysService.holidayKeys()
// z apps/backend/src/leaves/holidays.service.ts. Frontend potrzebuje tej samej listy,
// zeby formularz wniosku nie pozwalal ustawic urlopu na dzien wolny, a backend liczyl
// z niej segmenty w kalendarzu Google. Zmiana w jednym miejscu = zmiana w drugim.

// @anchor polish-fixed-holidays-frontend
/// Swieta o stalej dacie. Ruchome licza sie od Wielkanocy — patrz `easter-sunday-frontend`.
export const POLISH_FIXED_HOLIDAYS = [
    { month: 1, day: 1, name: 'Nowy Rok' },
    { month: 1, day: 6, name: 'Święto Trzech Króli' },
    { month: 5, day: 1, name: 'Święto Pracy' },
    { month: 5, day: 3, name: 'Święto Konstytucji 3 Maja' },
    { month: 8, day: 15, name: 'Wniebowzięcie NMP / Święto Wojska Polskiego' },
    { month: 11, day: 1, name: 'Wszystkich Świętych' },
    { month: 11, day: 11, name: 'Narodowe Święto Niepodległości' },
    { month: 12, day: 25, name: 'Boże Narodzenie (pierwszy dzień)' },
    { month: 12, day: 26, name: 'Boże Narodzenie (drugi dzień)' },
];

// @anchor easter-sunday-frontend
/// Niedziela wielkanocna (algorytm Meeusa/Jonesa/Butchera, w UTC).
export const easterSunday = (year) => {
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
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
};

// @anchor polish-holiday-names-frontend
/// Mapa 'YYYY-MM-DD' -> nazwa swieta dla jednego roku. Nazwa trafia do komunikatu
/// w formularzu („to Boże Ciało"), wiec trzymamy ja razem z data.
const cache = new Map();
export const holidayNames = (year) => {
    if (cache.has(year)) return cache.get(year);
    const key = (dt) => dt.toISOString().slice(0, 10);
    const easter = easterSunday(year);
    const shift = (days) => key(new Date(easter.getTime() + days * 86400000));
    const map = new Map();
    POLISH_FIXED_HOLIDAYS.forEach(h => map.set(key(new Date(Date.UTC(year, h.month - 1, h.day))), h.name));
    map.set(key(easter), 'Wielkanoc');
    map.set(shift(1), 'Poniedziałek Wielkanocny');
    map.set(shift(49), 'Zielone Świątki');
    map.set(shift(60), 'Boże Ciało');
    cache.set(year, map);
    return map;
};

// @anchor non-working-day-reason
/// Dlaczego danego dnia nie da sie wziac urlopu: 'sobota' / 'niedziela' / nazwa swieta.
/// null = zwykly dzien roboczy. `day` w formacie 'YYYY-MM-DD'.
export const nonWorkingDayReason = (day) => {
    if (!day) return null;
    const [y, m, d] = day.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (isNaN(dt.getTime())) return null;
    const dow = dt.getUTCDay();
    if (dow === 6) return 'sobota';
    if (dow === 0) return 'niedziela';
    return holidayNames(y).get(day) || null;
};

// @anchor next-working-day-from
/// Pierwszy dzien roboczy poczawszy od `day` (wlacznie). Uzywane, gdy uzytkownik wskaze
/// weekend albo swieto — formularz przesuwa wybor do przodu zamiast blokowac zapis.
export const nextWorkingDayFrom = (day) => {
    if (!day) return day;
    const [y, m, d] = day.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const pad = n => String(n).padStart(2, '0');
    for (let i = 0; i < 30; i++) {
        const key = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
        if (!nonWorkingDayReason(key)) return key;
        dt.setUTCDate(dt.getUTCDate() + 1);
    }
    return day;
};

// @anchor previous-working-day-from
/// Ostatni dzien roboczy do `day` wlacznie, czyli lustro `next-working-day-from`.
/// Uzywane dla daty „do": zamkniecie urlopu w sobote cofa sie do piatku, zamiast
/// przesuwac na poniedzialek i wydluzac nieobecnosc o dzien pracy.
export const previousWorkingDayFrom = (day) => {
    if (!day) return day;
    const [y, m, d] = day.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const pad = n => String(n).padStart(2, '0');
    for (let i = 0; i < 30; i++) {
        const key = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
        if (!nonWorkingDayReason(key)) return key;
        dt.setUTCDate(dt.getUTCDate() - 1);
    }
    return day;
};
