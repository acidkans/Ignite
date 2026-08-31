// Test polaczenia z realnym kalendarzem Google — sprawdza po kolei:
//  1. czy da sie wymienic JWT konta serwisowego na token OAuth2,
//  2. czy Calendar API jest wlaczone i kalendarz udostepniony (odczyt),
//  3. czy konto ma prawo zapisu (zaklada wydarzenie probne i od razu je kasuje).
// Uruchomienie: node test/gcal-smoke-test.js
const fs = require('fs');
const path = require('path');
const { createSign } = require('crypto');

const ENV = path.join(__dirname, '..', 'apps', 'backend', '.env');
const env = {};
for (const line of fs.readFileSync(ENV, 'utf8').split('\n')) {
    const m = line.trim().match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').split(String.fromCharCode(92) + 'n').join(String.fromCharCode(10));
const calendarId = env.GOOGLE_CALENDAR_ID;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');

// Inwentaryzacja istniejacych wpisow AppSheet w kalendarzu urlopowym — potrzebna przed
// przelaczeniem zapisu na Ignite (jak wygladaja tytuly, czy sa calodniowe, jakie sufiksy).
// Uruchomienie: node test/gcal-inwentaryzacja.js
(async () => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
        iss: email,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    })}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url');
    const tokenBody = await (await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    })).json();
    const H = { Authorization: `Bearer ${tokenBody.access_token}` };
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;

    let pageToken, items = [];
    do {
        const u = new URL(`${base}/events`);
        u.searchParams.set('timeMin', '2026-01-01T00:00:00Z');
        u.searchParams.set('timeMax', '2027-01-01T00:00:00Z');
        u.searchParams.set('maxResults', '2500');
        u.searchParams.set('singleEvents', 'true');
        if (pageToken) u.searchParams.set('pageToken', pageToken);
        const b = await (await fetch(u, { headers: H })).json();
        items = items.concat(b.items || []);
        pageToken = b.nextPageToken;
    } while (pageToken);

    const allDay = items.filter(e => e.start && e.start.date).length;
    console.log(`Wydarzen w 2026: ${items.length} | calodniowych: ${allDay} | z godzina: ${items.length - allDay}`);

    const RE = /^([A-Za-zÀ-ſ]{2,6})(\.?)\s*-\s*(.+)$/;
    const sufiksy = {}, dlugosci = {}, kropki = { 'z kropka': 0, 'bez kropki': 0 };
    let nieprzystajace = [];
    items.forEach(e => {
        const s = (e.summary || '').trim();
        const m = s.match(RE);
        if (!m) { nieprzystajace.push(s); return; }
        sufiksy[m[3].trim()] = (sufiksy[m[3].trim()] || 0) + 1;
        dlugosci[m[1].length] = (dlugosci[m[1].length] || 0) + 1;
        kropki[m[2] ? 'z kropka' : 'bez kropki']++;
    });

    console.log('\nSufiksy po mysliku (liczba wystapien):');
    Object.entries(sufiksy).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  "${k}"`));
    console.log('\nDlugosc inicjalow:', JSON.stringify(dlugosci), '| kropki:', JSON.stringify(kropki));
    console.log(`\nWpisy spoza schematu (${nieprzystajace.length}):`);
    [...new Set(nieprzystajace)].slice(0, 25).forEach(s => console.log(`  • ${s}`));
})();
