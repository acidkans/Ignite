// Test podpisu tokenu decyzji z maila — bez uruchamiania Nest.
const { createHmac, timingSafeEqual } = require('crypto');
const SECRET = 'testsecret';
const b64 = b => b.toString('base64url');
const sign = body => createHmac('sha256', SECRET).update(body).digest();
const issue = (p, ttl = 14) => {
    const full = { ...p, exp: Math.floor(Date.now() / 1000) + ttl * 86400 };
    const body = b64(Buffer.from(JSON.stringify(full), 'utf8'));
    return `${body}.${b64(sign(body))}`;
};
const verify = token => {
    if (!token) return null;
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const exp = sign(body);
    let given; try { given = Buffer.from(sig, 'base64url'); } catch { return null; }
    if (given.length !== exp.length || !timingSafeEqual(given, exp)) return null;
    let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
    if (!p.requestId || !p.deciderId || !p.deciderEmail) return null;
    if (p.decision !== 'APPROVED' && p.decision !== 'REJECTED') return null;
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
};

const base = { requestId: 'r1', deciderId: 'u1', deciderEmail: 'szef@airtel.com.pl', decision: 'APPROVED' };
let fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`); if (!cond) fail++; };

const good = issue(base);
check('poprawny token przechodzi', JSON.stringify(verify(good)).includes('szef@airtel.com.pl'));
check('podmiana akcji w payloadzie lamie podpis', verify(
    b64(Buffer.from(JSON.stringify({ ...base, decision: 'REJECTED', exp: 9e9 }), 'utf8')) + '.' + good.split('.')[1]
) === null);
check('podmiana adresu lamie podpis', verify(
    b64(Buffer.from(JSON.stringify({ ...base, deciderEmail: 'obcy@x.pl', exp: 9e9 }), 'utf8')) + '.' + good.split('.')[1]
) === null);
check('obciety podpis odrzucony', verify(good.split('.')[0] + '.AAAA') === null);
check('wygasly token odrzucony', verify(issue(base, -1)) === null);
check('token bez adresu odrzucony', verify(issue({ requestId: 'r1', deciderId: 'u1', decision: 'APPROVED' })) === null);
check('smieci odrzucone', verify('abc') === null && verify('') === null && verify(undefined) === null);

console.log(fail ? `\n${fail} testow nie przeszlo` : '\nwszystkie testy przeszly');
process.exit(fail ? 1 : 0);
