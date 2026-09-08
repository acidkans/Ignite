// Reset hasła użytkownika w BAZIE DEWELOPERSKIEJ (kontener `erp-db`).
//
// Po przeniesieniu zrzutu produkcji na dev hasła w bazie pochodzą z produkcji — lokalne
// przestają pasować i logowanie wywala „Błędny email lub hasło". Ten skrypt ustawia nowe
// hasło TYLKO na devie.
//
// Hasło wpisujesz sam, w swoim terminalu, bez echa na ekranie: nie przechodzi przez argumenty
// (byłoby w historii powłoki), nie jest nigdzie logowane i nie opuszcza tej maszyny. Do bazy
// idzie wyłącznie skrót argon2 — ten sam algorytm, którego używa `users.service.ts`.
//
// Użycie:  node test/reset-hasla-dev.cjs andrzej@gigatel.app
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');
const { createRequire } = require('module');

const KONTENER = 'erp-db';
const BAZA = 'erp_db';
const UZYTKOWNIK_BAZY = 'postgres';

const BACKEND = path.resolve(__dirname, '../apps/backend');
const wymagaj = createRequire(path.join(BACKEND, 'package.json'));
const argon2 = wymagaj('argon2');

const email = process.argv[2];
if (!email) {
    console.error('Podaj e-mail: node test/reset-hasla-dev.cjs uzytkownik@example.com');
    process.exit(1);
}

const psql = (sql) => execFileSync(
    'docker', ['exec', '-i', KONTENER, 'psql', '-U', UZYTKOWNIK_BAZY, '-d', BAZA, '-t', '-A', '-f', '-'],
    { input: sql, encoding: 'utf8' },
).trim();

// Pytanie o hasło bez wyświetlania znaków.
function zapytajOHaslo(pytanie) {
    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        const wyjscie = rl.output;
        let pierwsze = true;
        wyjscie.write(pytanie);
        rl._writeToOutput = (s) => {
            // Echo tylko dla samego pytania, nigdy dla wpisywanych znaków.
            if (pierwsze && s.includes(pytanie)) { pierwsze = false; return; }
            if (s.includes('\n')) wyjscie.write('\n');
        };
        rl.question('', (odp) => { rl.close(); resolve(odp); });
        rl.on('SIGINT', () => { rl.close(); reject(new Error('przerwane')); });
    });
}

(async () => {
    const istnieje = psql(`SELECT email FROM users WHERE email = '${email.replace(/'/g, "''")}';`);
    if (!istnieje) {
        console.error(`W bazie ${BAZA} nie ma użytkownika ${email}. Dostępni:`);
        console.error(psql('SELECT email FROM users ORDER BY email;'));
        process.exit(1);
    }

    const haslo = await zapytajOHaslo(`Nowe hasło dla ${email} (dev): `);
    const powtorz = await zapytajOHaslo('Powtórz hasło: ');
    if (!haslo || haslo !== powtorz) {
        console.error('Hasła nie są takie same albo są puste — nic nie zmieniono.');
        process.exit(1);
    }
    if (haslo.length < 8) {
        console.error('Hasło musi mieć co najmniej 8 znaków — nic nie zmieniono.');
        process.exit(1);
    }

    const skrot = await argon2.hash(haslo);
    psql(`UPDATE users SET password = '${skrot}', "updatedAt" = now() WHERE email = '${email.replace(/'/g, "''")}';`);
    console.log(`Zmienione. Zaloguj się na ${email} nowym hasłem na http://localhost:5174`);
})().catch((e) => { console.error('Nie udało się:', e.message); process.exit(1); });
