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

(async () => {
    console.log(`Konto: ${email}\nKalendarz: ${calendarId}\n`);

    console.log('1) Token OAuth2…');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
        iss: email,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    })}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: `${unsigned}.${sig}`,
        }),
    });
    const tokenBody = await tokenRes.json();
    if (!tokenRes.ok) return console.error('   FAIL —', JSON.stringify(tokenBody));
    console.log('   OK — token wazny', tokenBody.expires_in, 's');
    const H = { Authorization: `Bearer ${tokenBody.access_token}` };
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;

    console.log('\n2) Odczyt kalendarza…');
    const readRes = await fetch(`${base}/events?maxResults=3&timeMin=${new Date().toISOString()}`, { headers: H });
    const readBody = await readRes.json();
    if (!readRes.ok) {
        console.error('   FAIL —', readBody.error?.message);
        if (readBody.error?.message?.includes('has not been used')) console.error('   => wlacz Google Calendar API w projekcie');
        if (readRes.status === 404) console.error('   => kalendarz nie jest udostepniony kontu serwisowemu');
        return;
    }
    console.log(`   OK — widac ${readBody.items?.length || 0} nadchodzacych wydarzen`);
    (readBody.items || []).forEach(e => console.log(`      • ${e.summary} (${e.start?.date || e.start?.dateTime})`));

    console.log('\n3) Zapis — wydarzenie probne…');
    const insRes = await fetch(`${base}/events`, {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            summary: 'TEST Ignite — do skasowania',
            start: { date: '2030-01-07' },
            end: { date: '2030-01-08' },
            extendedProperties: { private: { source: 'ignite-smoke-test' } },
        }),
    });
    const insBody = await insRes.json();
    if (!insRes.ok) {
        console.error('   FAIL —', insBody.error?.message);
        console.error('   => konto serwisowe nie ma uprawnienia "Wprowadzanie zmian w wydarzeniach"');
        return;
    }
    console.log('   OK — zalozono', insBody.id);

    const delRes = await fetch(`${base}/events/${insBody.id}`, { method: 'DELETE', headers: H });
    console.log(delRes.ok ? '   OK — wydarzenie probne skasowane' : `   UWAGA — nie udalo sie skasowac (${delRes.status}), skasuj recznie`);
    console.log('\nGotowe — integracja dziala.');
})();
