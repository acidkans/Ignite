// Test kolejki załączników markera (outbox) — importuje PRAWDZIWE moduły z src/.
//
// Uruchomienie:
//   cd apps/frontend && npx vite --port 5174
//   http://localhost:5174/@fs/<abs-path-repo>/test/outbox-attachment-sync.html
//
// Scenariusze:
//   1. temp marker w kolejce  → ADD_MARKER nadaje realne id → załącznik trafia na nie
//   2. załącznik dodany JUŻ PO syncu markera → rozwiązany z markerIdMap (regresja z 2026-07-15)
//   3. brak mapowania         → wpis oznaczony orphaned, ZERO retry, plik zachowany

import { db, rememberMarkerId } from '/src/services/db.js';
import { enqueue, getAllPending, getOrphanedAttachments, reassignOrphanedAttachment } from '/src/services/repos/outboxRepo.js';
import { syncOutbox } from '/src/services/sync/syncOutbox.js';

const results = [];
const assert = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

// --- Stub sieci: rejestruje wszystkie POSTy załączników ---
const calls = [];
const REAL_MARKER = 'real-marker-0001';
const origFetch = window.fetch;

function installStub() {
    window.fetch = async (url, opts = {}) => {
        const u = String(url);
        calls.push({ url: u, method: opts.method || 'GET' });
        if (u.includes('/markers') && opts.method === 'POST' && !u.includes('/attachments')) {
            return new Response(JSON.stringify({ id: REAL_MARKER }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/attachments') && opts.method === 'POST') {
            // Serwer akceptuje wyłącznie realne id — temp_ leci FK violation (jak na produkcji)
            const markerId = u.split('/markers/')[1].split('/attachments')[0];
            if (markerId.startsWith('temp_')) return new Response('{"statusCode":500}', { status: 500 });
            return new Response(JSON.stringify({ id: 'att-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/schematics/')) {
            return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
}

async function reset() {
    await db.outbox.clear();
    await db.attachmentDrafts.clear();
    await db.markerIdMap.clear();
    calls.length = 0;
}

async function addDraft(outboxId) {
    await db.attachmentDrafts.add({
        outboxId,
        arrayBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
        fileName: 'foto.jpg',
        fileType: 'image/jpeg',
        createdAt: new Date().toISOString(),
    });
}

const attachmentPosts = () => calls.filter(c => c.url.includes('/attachments') && c.method === 'POST');

export async function run() {
    installStub();

    // ── 1. Marker offline + zdjęcie w tej samej kolejce ────────────────────────
    await reset();
    const tempId = 'temp_aaa';
    await enqueue('ADD_MARKER', { schematicId: 's1', marker: { x: 1, y: 2 }, subtaskId: 'sub1', nodeId: null, tempId });
    const ob1 = 'outbox-1';
    await addDraft(ob1);
    await enqueue('ADD_ATTACHMENT', { markerId: tempId, outboxId: ob1, fileName: 'foto.jpg', fileType: 'image/jpeg', subtaskId: 'sub1', nodeId: null });

    await syncOutbox('tok');
    const posts1 = attachmentPosts();
    assert('1. załącznik POSTowany na REALNE id (nie temp_)',
        posts1.length === 1 && posts1[0].url.includes(REAL_MARKER),
        JSON.stringify(posts1.map(p => p.url)));
    assert('1. kolejka pusta po syncu', (await getAllPending()).length === 0);
    assert('1. draft skasowany po wysłaniu', (await db.attachmentDrafts.count()) === 0);

    // ── 2. REGRESJA: zdjęcie dodane PO zsynchronizowaniu markera ───────────────
    // ADD_MARKER już zniknął z outboxa, panel nadal trzyma temp_ id.
    await reset();
    await rememberMarkerId('temp_bbb', REAL_MARKER); // mapa zapisana przy syncu markera
    const ob2 = 'outbox-2';
    await addDraft(ob2);
    await enqueue('ADD_ATTACHMENT', { markerId: 'temp_bbb', outboxId: ob2, fileName: 'foto.jpg', fileType: 'image/jpeg', subtaskId: 'sub1', nodeId: null });

    await syncOutbox('tok');
    const posts2 = attachmentPosts();
    assert('2. osierocony temp_ rozwiązany z markerIdMap',
        posts2.length === 1 && posts2[0].url.includes(REAL_MARKER),
        JSON.stringify(posts2.map(p => p.url)));
    assert('2. kolejka pusta (brak nieskończonego retry)', (await getAllPending()).length === 0);

    // ── 3. Brak mapowania → orphaned, plik NIE ginie ───────────────────────────
    await reset();
    const ob3 = 'outbox-3';
    await addDraft(ob3);
    await enqueue('ADD_ATTACHMENT', { markerId: 'temp_ccc', outboxId: ob3, fileName: 'foto.jpg', fileType: 'image/jpeg', subtaskId: 'sub1', nodeId: null });

    await syncOutbox('tok');
    assert('3. ZERO POSTów na martwe temp_ id (nie dobijamy serwera)', attachmentPosts().length === 0,
        JSON.stringify(attachmentPosts().map(p => p.url)));
    assert('3. wpis oznaczony orphaned', (await getOrphanedAttachments()).length === 1);
    assert('3. orphaned zdjęty z pętli synca', (await getAllPending()).length === 0);
    assert('3. plik zachowany w IndexedDB', (await db.attachmentDrafts.count()) === 1);

    // kolejny sync nie może nic zepsuć ani ponowić
    await syncOutbox('tok');
    assert('3. drugi sync nie ponawia orphaned', attachmentPosts().length === 0);
    assert('3. plik nadal zachowany', (await db.attachmentDrafts.count()) === 1);

    // ── 4. Ręczne przypisanie osieroconego do wskazanego markera ───────────────
    const orphan = (await getOrphanedAttachments())[0];
    await reassignOrphanedAttachment(orphan.id, REAL_MARKER, { subtaskId: 'sub1', nodeId: null });
    await syncOutbox('tok');
    const posts4 = attachmentPosts();
    assert('4. po przypisaniu załącznik idzie na wskazany marker',
        posts4.length === 1 && posts4[0].url.includes(REAL_MARKER),
        JSON.stringify(posts4.map(p => p.url)));
    assert('4. kolejka wyczyszczona', (await getAllPending()).length === 0 && (await getOrphanedAttachments()).length === 0);
    assert('4. draft skasowany', (await db.attachmentDrafts.count()) === 0);

    await reset();
    window.fetch = origFetch;
    return results;
}
