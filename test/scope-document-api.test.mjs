// Test API „Opis zakresu prac" na DEV (backend localhost:3001, konto claude-test).
//   node test/scope-document-api.test.mjs <orderId> [--pdf]
// Kroki: GET → detect-layout → zatwierdzenie → suggest-items → generate → PATCH → preview → (opcjonalnie) PDF.
import fs from 'fs';
const API = 'http://localhost:3001/api';
const orderId = process.argv[2];
const doPdf = process.argv.includes('--pdf');
if (!orderId) { console.error('podaj orderId'); process.exit(1); }

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'claude-test@ignite.test', password: 'BEyE-uNo7p5x' }) }).then(r => r.json());
const H = { Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' };
const call = async (method, path, body) => {
    const t0 = Date.now();
    const r = await fetch(`${API}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, json, ms: Date.now() - t0 };
};

const g0 = await call('GET', `/scope-documents/${orderId}`);
check('GET dokumentu', g0.status === 200 && g0.json.document?.nodeId === orderId, `pakiety domyślne: ${g0.json.layout?.packages?.length}, pozycji w zakresie: ${g0.json.scopeItemsCount}`);

const det = await call('POST', `/scope-documents/${orderId}/detect-layout`, {});
check('AI rozpoznaje układ', det.status === 201 && det.json.layout?.packages?.length > 0, `(${det.ms} ms) mode=${det.json.layout?.mode} pakiety=${det.json.layout?.packages?.length} lokalizacje=${det.json.layout?.locations?.length} — ${det.json.reason || JSON.stringify(det.json).slice(0, 200)}`);
console.log('   pakiety:', det.json.layout?.packages?.map(p => `${p.name}(${p.wbsNodeIds.length})`).join(' | '));
console.log('   lokalizacje:', det.json.layout?.locations?.map(p => `${p.name}(${p.wbsNodeIds.length})`).join(' | ') || '—');

const conf = await call('PATCH', `/scope-documents/${orderId}`, { layoutConfirmed: true, validityDays: 45, warrantyMonths: 36 });
check('PATCH: zatwierdzenie układu, ważność, gwarancja', conf.status === 200 && conf.json.layoutConfirmed && conf.json.validityDays === 45 && conf.json.warrantyMonths === 36);

const sug = await call('POST', `/scope-documents/${orderId}/suggest-items`, {});
check('AI proponuje pozycje zakresu', sug.status === 201 && sug.json.selected > 0, `(${sug.ms} ms) zaznaczono ${sug.json.selected}`);

const gen = await call('POST', `/scope-documents/${orderId}/generate`, {});
check('AI generuje sekcje', gen.status === 201 && gen.json.generated?.length > 0 && String(gen.json.sections?.goal || '').length > 50, `(${gen.ms} ms) ${gen.json.generated?.join(',')}`);
const pk = Object.keys(gen.json.sections?.packages || {});
check('opisy pakietów', pk.length > 0, `${pk.length} pakietów`);

const gen2 = await call('POST', `/scope-documents/${orderId}/generate`, {});
check('ponowne generowanie nie nadpisuje zapisanych', gen2.status === 201 && gen2.json.generated?.length === 0);

const edit = await call('PATCH', `/scope-documents/${orderId}`, { sections: { supplies: '- Konstrukcje masztowe\n- Szafy teletechniczne', exclusions: '- Dostawa urządzeń radiowych 5G' }, workDuration: 'ok. 10 tygodni' });
check('PATCH: sekcje 6/7 i czas prac', edit.status === 200 && edit.json.sections.supplies.includes('Konstrukcje') && edit.json.sections.goal === gen.json.sections.goal && edit.json.workDuration === 'ok. 10 tygodni');

const regen = await call('POST', `/scope-documents/${orderId}/generate`, { only: ['assumptions'] });
check('wygeneruj ponownie tylko sekcję 2', regen.status === 201 && regen.json.generated?.join() === 'assumptions', `(${regen.ms} ms)`);

const g1 = await call('GET', `/scope-documents/${orderId}`);
const m = g1.json.model;
check('model: tabela ilościowa', m.quantities.length > 0, `${m.quantities.length} wierszy; lokalizacje: ${m.locations.join(', ') || '—'}`);
for (const q of m.quantities.slice(0, 8)) console.log(`   ${q.name} [${q.unit}] ${q.perLocation.join(' / ')} = ${q.total}`);
check('model: macierz pakiet × lokalizacja', m.matrix.length === m.packages.length);

const pv = await fetch(`${API}/scope-documents/${orderId}/preview`, { headers: H });
const html = await pv.text();
fs.writeFileSync('test/scope-document-preview.html', html);
check('preview HTML', pv.status === 200 && html.includes('Przedmiot i cel projektu') && html.includes('Poza zakresem'), `${html.length} B → test/scope-document-preview.html`);

if (doPdf) {
    const p1 = await call('POST', `/scope-documents/${orderId}/pdf`, {});
    check('PDF 1. zapis: numer oferty, wersja 1.0', p1.status === 201 && /^[A-Z]{3}\/\d+\/\d{4}$/.test(p1.json.offerNumber) && p1.json.revisionLabel === '1.0', `${p1.json.offerNumber} ${p1.json.filename} (${p1.ms} ms) ${p1.status !== 201 ? JSON.stringify(p1.json) : ''}`);
    const p2 = await call('POST', `/scope-documents/${orderId}/pdf`, {});
    check('PDF 2. zapis: ten sam numer, wersja 1.1', p2.status === 201 && p2.json.offerNumber === p1.json.offerNumber && p2.json.revisionLabel === '1.1' && p2.json.documentId === p1.json.documentId);
}
console.log(`\n${ok} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
