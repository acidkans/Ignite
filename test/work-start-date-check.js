// Test pola „Rozpoczecie pracy" (rok + miesiac) i wyliczanego z niego stazu.
// Patchuje testowego uzytkownika, sprawdza wynik w GET /users i przywraca stan poczatkowy.
// node test/work-start-date-check.js
const path = require('path');
const base = path.join(__dirname, '..', 'apps', 'backend');
const jwt = require(path.join(base, 'node_modules', 'jsonwebtoken'));
require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
const { PrismaClient } = require(path.join(base, 'node_modules', '@prisma/client'));
const prisma = new PrismaClient();

const API = process.env.API_BASE || 'http://localhost:3001/api';

async function main() {
    const admin = await prisma.user.findFirst({
        where: { userRoles: { some: { role: { name: 'ADMIN' } } } },
        select: { id: true, email: true },
    });
    const token = jwt.sign({ email: admin.email, sub: admin.id, roles: ['ADMIN'] }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const target = await prisma.user.findFirst({
        where: { email: 'a.wlodarczyk@airtel.com.pl' },
        select: { id: true, email: true, workStartYear: true, workStartMonth: true, workExperienceYears: true },
    });
    console.log('Stan przed:', JSON.stringify(target));

    const patch = async (body) => {
        const res = await fetch(`${API}/users/${target.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json().catch(() => ({})) };
    };
    const readUser = async () => {
        const res = await fetch(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } });
        const list = await res.json();
        return list.find(u => u.id === target.id);
    };

    // 1. marzec 2014 -> staz liczony co do miesiaca
    const r1 = await patch({ workStartYear: 2014, workStartMonth: 3 });
    console.log('PATCH 03.2014 ->', r1.status);
    let u = await readUser();
    console.log(`   GET /users -> rok=${u.workStartYear}, miesiac=${u.workStartMonth}, stazLat=${u.workExperienceYears}, stazMies=${u.workExperienceMonths}, wymiar=${u.leaveEntitlementDays} dni`);

    // 2. ten sam rok, ale grudzien — staz musi byc krotszy o 9 miesiecy
    const r2 = await patch({ workStartYear: 2014, workStartMonth: 12 });
    console.log('PATCH 12.2014 ->', r2.status);
    u = await readUser();
    console.log(`   GET /users -> rok=${u.workStartYear}, miesiac=${u.workStartMonth}, stazLat=${u.workExperienceYears}, stazMies=${u.workExperienceMonths}, wymiar=${u.leaveEntitlementDays} dni`);

    // 3. walidacja bledow
    const bad1 = await patch({ workStartYear: 2014, workStartMonth: 13 });
    console.log('PATCH miesiac=13 ->', bad1.status, bad1.body.message || '');
    const bad2 = await patch({ workStartYear: 1800, workStartMonth: 1 });
    console.log('PATCH rok=1800 ->', bad2.status, bad2.body.message || '');

    // 4. wyczyszczenie roku czysci tez miesiac
    const r4 = await patch({ workStartYear: null });
    console.log('PATCH rok=null ->', r4.status);
    u = await readUser();
    console.log(`   GET /users -> rok=${u.workStartYear}, miesiac=${u.workStartMonth}, stazLat=${u.workExperienceYears}, stazMies=${u.workExperienceMonths}`);

    // przywrocenie stanu poczatkowego
    await prisma.user.update({
        where: { id: target.id },
        data: {
            workStartYear: target.workStartYear,
            workStartMonth: target.workStartMonth,
            workExperienceYears: target.workExperienceYears,
        },
    });
    const after = await prisma.user.findUnique({
        where: { id: target.id },
        select: { workStartYear: true, workStartMonth: true, workExperienceYears: true },
    });
    console.log('Stan przywrocony:', JSON.stringify(after));
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
