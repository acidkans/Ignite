// Test roli DAK w module Urlopy: dostep do modulu, lista pracownikow, dashboard cudzego
// pracownika i brak prawa decyzji. Uruchamiac przy dzialajacym backendzie dev na :3001.
// node test/dak-leaves-access-check.js
const path = require('path');
const jwt = require(path.join(__dirname, '..', 'apps', 'backend', 'node_modules', 'jsonwebtoken'));
require(path.join(__dirname, '..', 'apps', 'backend', 'node_modules', 'dotenv')).config({
    path: path.join(__dirname, '..', 'apps', 'backend', '.env'),
});
const { PrismaClient } = require(path.join(__dirname, '..', 'apps', 'backend', 'node_modules', '@prisma/client'));
const prisma = new PrismaClient();

const API = 'http://localhost:3001/api';

async function call(url, token) {
    const res = await fetch(`${API}${url}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
}

async function main() {
    const dak = await prisma.user.findFirst({
        where: { userRoles: { some: { role: { name: 'DAK' } } } },
        select: { id: true, email: true, company: true },
    });
    if (!dak) throw new Error('Brak uzytkownika z rola DAK w bazie dev.');

    const other = await prisma.user.findFirst({
        where: { isActive: true, id: { not: dak.id }, company: { in: ['Airtel Services', 'Airtel Systems', 'LinkedTeam'] } },
        select: { id: true, email: true, supervisorId: true },
    });

    const token = jwt.sign({ email: dak.email, sub: dak.id, roles: ['DAK'] }, process.env.JWT_SECRET, { expiresIn: '10m' });

    console.log(`DAK: ${dak.email} (firma: ${dak.company})`);
    console.log(`Podglad pracownika: ${other.email} (przelozony: ${other.supervisorId || 'brak'})`);

    const access = await call('/leaves/access', token);
    console.log('\n/leaves/access ->', access.status, JSON.stringify(access.body));

    const employees = await call('/leaves/employees', token);
    console.log(`/leaves/employees -> ${employees.status}, pracownikow: ${Array.isArray(employees.body) ? employees.body.length : 'n/d'}`);

    const dash = await call(`/leave-requests/dashboard?userId=${other.id}`, token);
    console.log('/leave-requests/dashboard?userId=obcy ->', dash.status,
        dash.status === 200
            ? `subject=${dash.body.subject?.email}, canDecideSubject=${dash.body.canDecideSubject}, wnioskow=${dash.body.requests?.length}, saldo=${dash.body.balance?.totalRemaining}`
            : JSON.stringify(dash.body));

    const mine = await call('/leave-requests/mine', token);
    console.log(`/leave-requests/mine -> ${mine.status}, wnioskow: ${Array.isArray(mine.body) ? mine.body.length : 'n/d'} (powinny byc tylko wlasne)`);

    // proba decyzji na cudzym wniosku — powinna byc odrzucona (403)
    const someoneElsesPending = await prisma.leaveRequest.findFirst({
        where: { status: 'PENDING', userId: { not: dak.id } },
        select: { id: true },
    });
    if (someoneElsesPending) {
        const res = await fetch(`${API}/leave-requests/${someoneElsesPending.id}/decision`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'APPROVED' }),
        });
        const body = await res.json().catch(() => ({}));
        console.log(`PATCH decision cudzego wniosku -> ${res.status} ${body.message || ''} (oczekiwane 403)`);
    } else {
        console.log('PATCH decision — brak wniosku PENDING do testu');
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
