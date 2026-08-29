import ExcelJS from 'exceljs';

// @anchor user-role-labels
// Etykiety ról w arkuszu — te same napisy co w gridzie i w modalu dodawania użytkownika.
export const USER_ROLE_LABELS = {
    USER: 'Pracownik',
    LOGISTYK: 'Logistyk',
    MANAGER: 'Menadżer',
    DAK: 'DAK',
    ADMIN: 'Administrator',
};

// @anchor user-role-by-label
// Odwrotna mapa (etykieta → kod roli). Klucze bez ogonków i wielkości liter,
// żeby „menadzer" wpisany ręcznie w Excelu też trafił we właściwą rolę.
export const USER_ROLE_BY_LABEL = Object.entries(USER_ROLE_LABELS).reduce((acc, [code, label]) => {
    acc[normalizeKey(label)] = code;
    acc[normalizeKey(code)] = code;
    return acc;
}, {});

// @anchor normalize-key
// Wspólna normalizacja tekstu do porównań: bez ogonków, bez gwiazdek, małe litery.
export function normalizeKey(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[*()]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

// @anchor users-excel-columns
// Struktura arkusza — ta sama dla eksportu i importu. `required` pilnuje kolumn,
// bez których nie da się założyć konta, `readOnly` oznacza kolumny wyliczane
// (import je pomija, są tylko po to, żeby admin widział skutek swoich wpisów).
export const USERS_EXCEL_COLUMNS = [
    { key: 'firstName', header: 'Imię', width: 18, required: true, hint: 'np. Jan' },
    { key: 'lastName', header: 'Nazwisko', width: 20, required: true, hint: 'np. Kowalski' },
    { key: 'email', header: 'Email (login)', width: 30, required: true, hint: 'jan.kowalski@firma.pl — klucz, po nim rozpoznajemy konto' },
    { key: 'password', header: 'Hasło tymczasowe', width: 20, hint: 'Wypełnij tylko dla nowych osób. Puste = system wylosuje hasło' },
    { key: 'phone', header: 'Telefon', width: 16, hint: 'np. 600100200' },
    { key: 'company', header: 'Firma', width: 18, hint: 'Moduł Urlopy działa dla firm z arkusza „Podpowiedzi"' },
    { key: 'roleLabel', header: 'Uprawnienia', width: 16, hint: 'Pracownik / Logistyk / Menadżer / DAK / Administrator' },
    { key: 'supervisorEmail', header: 'Przełożony (email)', width: 30, hint: 'Email innej osoby z tego arkusza albo już istniejącej' },
    { key: 'teams', header: 'Zespoły', width: 26, hint: 'Nazwy zespołów po przecinku — muszą już istnieć' },
    { key: 'workStartMonth', header: 'Rozpoczęcie pracy — miesiąc', width: 26, hint: 'Liczba 1–12' },
    { key: 'workStartYear', header: 'Rozpoczęcie pracy — rok', width: 24, hint: 'np. 2015 — z tego liczy się staż i wymiar urlopu' },
    { key: 'workExperienceYears', header: 'Staż pracy (lata)', width: 18, hint: 'Wpisuj tylko gdy nie znasz daty rozpoczęcia pracy' },
    { key: 'leaveEntitlementDays', header: 'Wymiar urlopu (dni)', width: 20, readOnly: true, hint: 'Wyliczane ze stażu — import pomija tę kolumnę' },
];

// @anchor users-excel-header-map
// Nagłówek z pliku → klucz kolumny. Poza pełnym nagłówkiem przyjmujemy też samą
// nazwę pola, żeby arkusz przygotowany „po swojemu" nadal się wczytał.
const HEADER_TO_KEY = USERS_EXCEL_COLUMNS.reduce((acc, col) => {
    acc[normalizeKey(col.header)] = col.key;
    acc[normalizeKey(col.key)] = col.key;
    return acc;
}, {});

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function cellText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        if (value.text) return String(value.text).trim();
        if (value.result !== undefined) return String(value.result).trim();
        if (Array.isArray(value.richText)) return value.richText.map(t => t.text).join('').trim();
        return '';
    }
    return String(value).trim();
}

// @anchor export-users-workbook
// Eksport tabeli użytkowników do XLSX — arkusz „Użytkownicy" (dane + nagłówki gotowe
// do uzupełnienia) i arkusz „Podpowiedzi" (co wolno wpisać w każdej kolumnie).
export async function exportUsersWorkbook(users, { companies = [], teams = [] } = {}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ERP Ignite';
    wb.created = new Date();

    const ws = wb.addWorksheet('Użytkownicy', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = USERS_EXCEL_COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width }));

    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.height = 32;
    USERS_EXCEL_COLUMNS.forEach((col, i) => {
        const cell = header.getCell(i + 1);
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: col.readOnly ? 'FF6B7280' : col.required ? 'FF1D4ED8' : 'FF334155' },
        };
        cell.note = `${col.required ? 'Pole wymagane. ' : ''}${col.hint || ''}`.trim();
    });

    (users || []).forEach(u => {
        ws.addRow({
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            email: u.email || '',
            password: '',
            phone: u.phone || '',
            company: u.company || '',
            roleLabel: (u.userRoles || [])
                .map(r => USER_ROLE_LABELS[r.role?.name] || r.role?.name)
                .filter(Boolean)
                .join(', ') || USER_ROLE_LABELS.USER,
            supervisorEmail: u.supervisor?.email || '',
            teams: Array.isArray(u.teams) ? u.teams.map(t => t.name).join(', ') : '',
            workStartMonth: u.workStartMonth ?? '',
            workStartYear: u.workStartYear ?? '',
            workExperienceYears: u.workStartYear ? '' : (u.workExperienceYears ?? ''),
            leaveEntitlementDays: u.leaveEntitlementDays ?? '',
        });
    });

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: USERS_EXCEL_COLUMNS.length } };

    const help = wb.addWorksheet('Podpowiedzi');
    help.columns = [
        { header: 'Kolumna', key: 'col', width: 30 },
        { header: 'Wymagana', key: 'req', width: 12 },
        { header: 'Co wpisać', key: 'hint', width: 90 },
    ];
    help.getRow(1).font = { bold: true };
    USERS_EXCEL_COLUMNS.forEach(col => {
        help.addRow({
            col: col.header,
            req: col.required ? 'tak' : col.readOnly ? 'nie (wyliczane)' : 'nie',
            hint: col.hint || '',
        });
    });
    help.addRow({});
    help.addRow({ col: 'Firmy w systemie', hint: companies.filter(c => c && c !== 'Brak').join(', ') });
    help.addRow({ col: 'Zespoły w systemie', hint: (teams || []).map(t => t.name).join(', ') });
    help.addRow({ col: 'Uprawnienia', hint: Object.values(USER_ROLE_LABELS).join(', ') });
    help.addRow({});
    help.addRow({
        col: 'Jak to działa',
        hint: 'Import rozpoznaje osobę po emailu: jest w systemie — zaktualizujemy jej dane, nie ma — założymy konto. '
            + 'Przełożonego i zespoły podpinamy na końcu, więc możesz w jednym pliku dodać szefa i jego zespół naraz.',
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: XLSX_MIME });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `uzytkownicy_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// @anchor parse-users-workbook
// Wczytanie pliku z importu. Zwraca { rows, errors } — wiersz bez emaila albo bez
// imienia/nazwiska trafia do errors i nie idzie dalej, reszta jedzie normalnie.
export async function parseUsersWorkbook(file) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());

    const ws = wb.getWorksheet('Użytkownicy') || wb.worksheets[0];
    if (!ws) return { rows: [], errors: ['Plik nie zawiera żadnego arkusza.'] };

    const headerRow = ws.getRow(1);
    const keyByCol = {};
    headerRow.eachCell((cell, colNumber) => {
        const key = HEADER_TO_KEY[normalizeKey(cellText(cell.value))];
        if (key) keyByCol[colNumber] = key;
    });

    const mapped = Object.values(keyByCol);
    if (!mapped.includes('email')) {
        return { rows: [], errors: ['W pierwszym wierszu nie ma kolumny „Email (login)". Użyj pliku z eksportu.'] };
    }

    const rows = [];
    const errors = [];
    const seen = new Set();

    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const raw = {};
        Object.entries(keyByCol).forEach(([colNumber, key]) => {
            raw[key] = cellText(row.getCell(Number(colNumber)).value);
        });
        if (!Object.values(raw).some(v => v !== '')) return; // pusty wiersz

        const email = (raw.email || '').toLowerCase();
        if (!email) { errors.push(`Wiersz ${rowNumber}: brak emaila — pomijam.`); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`Wiersz ${rowNumber}: „${raw.email}" to nie jest adres email — pomijam.`); return; }
        if (seen.has(email)) { errors.push(`Wiersz ${rowNumber}: email ${email} powtarza się w pliku — biorę pierwsze wystąpienie.`); return; }
        if (!raw.firstName || !raw.lastName) { errors.push(`Wiersz ${rowNumber}: brakuje imienia albo nazwiska — pomijam.`); return; }
        seen.add(email);

        const roleLabel = normalizeKey((raw.roleLabel || '').split(',')[0]);
        const month = raw.workStartMonth === '' ? null : Number(String(raw.workStartMonth).replace(',', '.'));
        const year = raw.workStartYear === '' ? null : Number(String(raw.workStartYear).replace(',', '.'));
        const experience = raw.workExperienceYears === '' ? null : Number(String(raw.workExperienceYears).replace(',', '.'));

        if (roleLabel && !USER_ROLE_BY_LABEL[roleLabel]) {
            errors.push(`Wiersz ${rowNumber}: nie znam uprawnień „${raw.roleLabel}" — zostawiam dotychczasowe.`);
        }
        if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
            errors.push(`Wiersz ${rowNumber}: miesiąc rozpoczęcia pracy musi być liczbą 1–12 — pomijam to pole.`);
        }
        if (year !== null && (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear())) {
            errors.push(`Wiersz ${rowNumber}: rok rozpoczęcia pracy wygląda podejrzanie — pomijam to pole.`);
        }

        const monthOk = month !== null && Number.isInteger(month) && month >= 1 && month <= 12;
        const yearOk = year !== null && Number.isInteger(year) && year >= 1950 && year <= new Date().getFullYear();

        rows.push({
            rowNumber,
            email,
            firstName: raw.firstName,
            lastName: raw.lastName,
            password: raw.password || null,
            phone: raw.phone || null,
            company: raw.company || null,
            roleName: USER_ROLE_BY_LABEL[roleLabel] || null,
            supervisorEmail: (raw.supervisorEmail || '').toLowerCase() || null,
            teamNames: (raw.teams || '').split(',').map(t => t.trim()).filter(Boolean),
            workStartMonth: monthOk ? month : null,
            workStartYear: yearOk ? year : null,
            workExperienceYears: experience !== null && isFinite(experience) && experience >= 0 ? experience : null,
        });
    });

    return { rows, errors };
}
