// Round-trip eksport → import arkusza uzytkownikow.
// Uruchomienie: node test/users-excel-roundtrip.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'users-export-test.xlsx');

// eksport konczy sie pobraniem pliku w przegladarce — podstawiamy minimalne DOM API
let captured = null;
globalThis.Blob = class { constructor(parts) { captured = Buffer.from(parts[0]); } };
globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => { } };
globalThis.document = { createElement: () => ({ click() { }, set href(v) { }, set download(v) { } }) };

const { exportUsersWorkbook, parseUsersWorkbook } = await import('../apps/frontend/src/utils/usersExcel.js');

const users = [
    {
        id: '1', email: 'Anna.Nowak@firma.pl', firstName: 'Anna', lastName: 'Nowak', phone: '600100200',
        company: 'Airtel Systems', workStartYear: 2015, workStartMonth: 3, workExperienceYears: 11.5,
        leaveEntitlementDays: 26, userRoles: [{ role: { name: 'MANAGER' } }],
        supervisor: null, teams: [{ id: 't1', name: 'Serwis' }],
    },
    {
        id: '2', email: 'jan.kowalski@firma.pl', firstName: 'Jan', lastName: 'Kowalski', phone: null,
        company: 'LinkedTeam', workStartYear: null, workStartMonth: null, workExperienceYears: 4,
        leaveEntitlementDays: 20, userRoles: [{ role: { name: 'USER' } }],
        supervisor: { email: 'Anna.Nowak@firma.pl' }, teams: [],
    },
];

await exportUsersWorkbook(users, { companies: ['Brak', 'Airtel Systems', 'LinkedTeam'], teams: [{ id: 't1', name: 'Serwis' }] });
fs.writeFileSync(OUT, captured);
console.log('zapisano', OUT, captured.length, 'B');

const { rows, errors } = await parseUsersWorkbook({ arrayBuffer: async () => captured });
console.log('bledy:', errors);
console.log(JSON.stringify(rows, null, 2));

const ok =
    rows.length === 2 &&
    rows[0].email === 'anna.nowak@firma.pl' &&
    rows[0].roleName === 'MANAGER' &&
    rows[0].workStartMonth === 3 && rows[0].workStartYear === 2015 &&
    rows[0].teamNames.join() === 'Serwis' &&
    rows[1].supervisorEmail === 'anna.nowak@firma.pl' &&
    rows[1].workExperienceYears === 4 &&
    errors.length === 0;

console.log(ok ? 'ROUND-TRIP OK' : 'ROUND-TRIP FAIL');
process.exit(ok ? 0 : 1);
