/**
 * Test synchronizacji statusu `EXTRA_ORDER` ("Dodatkowe zamówienie") między trzema widokami.
 *
 * Status pozycji mieszka w DWÓCH kolumnach — `WbsNode.status` (czytają WBS i Realizacja)
 * i `MaterialRequirement.status` (czyta panel Materiały) — więc każdy widok musi zapisać obie.
 * Skrypt odtwarza sekwencję żądań KAŻDEGO z trzech widoków i po każdej sprawdza obie kolumny
 * oraz to, co oddaje endpoint czytany przez pozostałe widoki (`/wbs-nodes/unified/:nodeId`).
 *
 * Uruchomienie (backend dev na 3001, baza lokalna 5433):
 *   node test/status-extra-order-sync.js <JWT>
 */

const API = 'http://localhost:3001/api';
const TOKEN = process.argv[2];
const NEW_STATUS = 'EXTRA_ORDER';
const NODE_ID = '9e046458-7e4b-406e-b20a-08a1a9f8743a'; // "Przychodnia Bojków"

if (!TOKEN) {
    console.error('Brak tokenu. Użycie: node test/status-extra-order-sync.js <JWT>');
    process.exit(1);
}

const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const patch = (path, body) =>
    fetch(`${API}${path}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
const get = (path) => fetch(`${API}${path}`, { headers: H });

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

// Odczyt jak w widokach: pozycja z `/wbs-nodes/unified/:nodeId` + jej karta materiałowa.
async function readBoth(wbsNodeId, reqId) {
    const [uniRes, reqRes] = await Promise.all([
        get(`/wbs-nodes/unified/${NODE_ID}`),
        get(`/material-requirements/${reqId}`),
    ]);
    const uni = await uniRes.json();
    const list = Array.isArray(uni) ? uni : (uni.items || uni.nodes || []);
    const node = list.find((n) => n.id === wbsNodeId);
    let card = null;
    if (reqRes.ok) {
        const body = await reqRes.json();
        card = Array.isArray(body) ? body.find((r) => r.id === reqId) : body;
    }
    return { nodeStatus: node?.status ?? null, cardStatus: card?.status ?? null };
}

async function main() {
    // Pozycja testowa: liść material/equipment z podpiętą kartą (relacja 1:1).
    const uni = await get(`/wbs-nodes/unified/${NODE_ID}`).then((r) => r.json());
    const list = Array.isArray(uni) ? uni : (uni.items || uni.nodes || []);
    const reqsBody = await get(`/material-requirements/node/${NODE_ID}`).then((r) => r.json());
    const reqs = Array.isArray(reqsBody) ? reqsBody : (reqsBody.items || reqsBody.requirements || []);
    const reqByNode = new Map(reqs.filter((r) => r.wbsNodeId).map((r) => [r.wbsNodeId, r]));
    const node = list.find((n) => ['material', 'equipment'].includes(n.type) && reqByNode.has(n.id));

    if (!node) {
        console.error('Nie znaleziono pozycji z podpiętą kartą — przerwane.');
        process.exit(1);
    }
    const card = reqByNode.get(node.id);
    const before = await readBoth(node.id, card.id);

    console.log(`Pozycja: "${node.name}"`);
    console.log(`  wbsNode ${node.id} = ${before.nodeStatus ?? '(brak)'}`);
    console.log(`  karta   ${card.id} = ${before.cardStatus ?? '(brak)'}\n`);

    // ── 1. WBS (WBSHybridTable) ──────────────────────────────────────────────
    // Zapis węzła (debounce 400 ms) + `handleHybridNodeStatusChange` → karta.
    console.log(`1) WBS → ustawiam ${NEW_STATUS}`);
    const r1a = await patch(`/wbs-nodes/${node.id}`, { status: NEW_STATUS });
    const r1b = await patch(`/material-requirements/${card.id}`, { status: NEW_STATUS });
    check('backend przyjął nieznany kod na /wbs-nodes', r1a.ok, `HTTP ${r1a.status}`);
    check('backend przyjął nieznany kod na /material-requirements', r1b.ok, `HTTP ${r1b.status}`);
    let s = await readBoth(node.id, card.id);
    check('Realizacja + WBS czytają nowy status (WbsNode.status)', s.nodeStatus === NEW_STATUS, s.nodeStatus);
    check('Materiały czytają nowy status (MaterialRequirement.status)', s.cardStatus === NEW_STATUS, s.cardStatus);

    // ── 2. Realizacja (RealizationTab.saveStatus) ────────────────────────────
    console.log('\n2) Realizacja → ORDERED, potem z powrotem ' + NEW_STATUS);
    await patch(`/wbs-nodes/${node.id}`, { status: 'ORDERED' });
    await patch(`/material-requirements/${card.id}`, { status: 'ORDERED' });
    s = await readBoth(node.id, card.id);
    check('obie kolumny zeszły na ORDERED', s.nodeStatus === 'ORDERED' && s.cardStatus === 'ORDERED',
        `${s.nodeStatus}/${s.cardStatus}`);

    await patch(`/wbs-nodes/${node.id}`, { status: NEW_STATUS });
    await patch(`/material-requirements/${card.id}`, { status: NEW_STATUS });
    s = await readBoth(node.id, card.id);
    check('Realizacja zapisała na OBU polach', s.nodeStatus === NEW_STATUS && s.cardStatus === NEW_STATUS,
        `${s.nodeStatus}/${s.cardStatus}`);

    // ── 3. Materiały (WbsMaterialsPanel.patchCard) ───────────────────────────
    console.log('\n3) Materiały → PENDING, potem ' + NEW_STATUS);
    await patch(`/material-requirements/${card.id}`, { status: 'PENDING' });
    await patch(`/wbs-nodes/${node.id}`, { status: 'PENDING' });
    s = await readBoth(node.id, card.id);
    check('obie kolumny zeszły na PENDING', s.nodeStatus === 'PENDING' && s.cardStatus === 'PENDING',
        `${s.nodeStatus}/${s.cardStatus}`);

    await patch(`/material-requirements/${card.id}`, { status: NEW_STATUS });
    await patch(`/wbs-nodes/${node.id}`, { status: NEW_STATUS });
    s = await readBoth(node.id, card.id);
    check('Materiały zapisały na OBU polach', s.nodeStatus === NEW_STATUS && s.cardStatus === NEW_STATUS,
        `${s.nodeStatus}/${s.cardStatus}`);

    // ── Sprzątanie: pozycja wraca do stanu sprzed testu ──────────────────────
    console.log('\n4) Przywracam stan sprzed testu');
    await patch(`/wbs-nodes/${node.id}`, { status: before.nodeStatus ?? '' });
    await patch(`/material-requirements/${card.id}`, { status: before.cardStatus ?? 'PENDING' });
    s = await readBoth(node.id, card.id);
    check('stan przywrócony', s.nodeStatus === before.nodeStatus && s.cardStatus === before.cardStatus,
        `${s.nodeStatus}/${s.cardStatus}`);

    console.log(failures ? `\n${failures} FAIL` : '\nWszystkie testy przeszły');
    process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
