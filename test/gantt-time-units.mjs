// Test przeliczania jednostek czasu na długość paska w Gantcie (GanttSection.jsx)
import fs from 'fs';
const src = fs.readFileSync('apps/frontend/src/components/shared/wbs/GanttSection.jsx', 'utf8');
const body = src.slice(src.indexOf('const DAY_MS'), src.indexOf('// branchWorkOnHolidays'));
const f = new Function(body + '\nreturn {nodeDurationDays,nodeDurationMonths,addCalendarMonths,isNonWorkingDay};')();
const w = (unit, quantity) => ({ type: 'work', unit, quantity });
for (const [u, q] of [['dni', 5], ['godziny', 20], ['tygodnie', 2], ['miesiące', 6], ['pakiet', 3]])
  console.log(u, q, '→ dni', f.nodeDurationDays(w(u, q)), '| mies', f.nodeDurationMonths(w(u, q)));
const monthWorkDays = (start, m) => { let n = 0; const e = f.addCalendarMonths(start, m); for (const c = new Date(start); c < e; c.setDate(c.getDate() + 1)) if (!f.isNonWorkingDay(c)) n++; return n; };
for (let i = 0; i < 12; i++) { const s = new Date(2026, i, 1); console.log(s.toISOString().slice(0, 7), '1 mies →', monthWorkDays(s, 1), 'dni rob.'); }
console.log('28.09.2026 + 6 mies →', monthWorkDays(new Date(2026, 8, 28), 6), 'dni rob.');
