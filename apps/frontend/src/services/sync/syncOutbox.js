import { API_URL } from '../../config';
import { getAllPending, removeById, markOrphaned } from '../repos/outboxRepo';
import { db, rememberMarkerId, resolveMarkerId } from '../db';

let syncing = false;

// Zwracany przez processItem gdy wpis ma ZOSTAĆ w kolejce mimo braku błędu
// (np. osierocony załącznik czekający na ręczne przypisanie).
// @anchor outbox-keep
const KEEP = Symbol('keep');

export async function syncOutbox(token) {
    if (syncing) return;
    syncing = true;
    try {
        const items = await getAllPending();
        if (!items.length) return;
        for (const item of items) {
            try {
                // Wpis czytamy ze świeża tuż przed wysyłką — poprzednie iteracje
                // (np. ADD_MARKER podmieniający tempId→realId) mogły zmienić
                // payload już PO pobraniu snapshotu listy.
                const fresh = await db.outbox.get(item.id);
                if (!fresh || fresh.orphaned) continue;
                const result = await processItem(fresh, token);
                if (result !== KEEP) await removeById(fresh.id);
            } catch (err) {
                console.warn('[Outbox] Sync failed for', item.type, err.message);
            }
        }
    } finally {
        syncing = false;
    }
}

async function processItem(item, token) {
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };

    if (item.type === 'SUBTASK_STATUS') {
        const { subtaskId, status } = item.payload;
        const res = await fetch(`${API_URL}/subtasks/${subtaskId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        await db.subtasks.put({ ...data, updatedAt: data.updatedAt ?? new Date().toISOString() });
    }

    if (item.type === 'ADD_MARKER') {
        const { schematicId, marker, subtaskId, nodeId, tempId } = item.payload;
        const res = await fetch(`${API_URL}/schematics/${schematicId}/markers`, {
            method: 'POST',
            headers,
            body: JSON.stringify(marker),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Podmień tempId na realny markerId w pending ADD_ATTACHMENT wpisach
        const realMarker = await res.json().catch(() => null);
        if (realMarker?.id && tempId) {
            // Mapa temp→real MUSI być zapisana trwale: załącznik dodany do panelu
            // otwartego już po zsynchronizowaniu markera nie ma tu żadnego wpisu
            // ADD_ATTACHMENT do podmiany, a mimo to niesie martwe temp_ id.
            await rememberMarkerId(tempId, realMarker.id);
            const attItems = await db.outbox.where('type').equals('ADD_ATTACHMENT').toArray();
            for (const att of attItems) {
                if (att.payload?.markerId === tempId) {
                    await db.outbox.update(att.id, { payload: { ...att.payload, markerId: realMarker.id }, orphaned: false });
                }
            }
        }
        // Refresh schematics in IDB so markers are current after sync
        const url = subtaskId
            ? `${API_URL}/schematics/subtask/${subtaskId}`
            : `${API_URL}/schematics/node/${nodeId}`;
        const schRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (schRes.ok) {
            const data = await schRes.json();
            const { upsertSchematics } = await import('../repos/schematicsRepo');
            await upsertSchematics(data, { subtaskId, nodeId });
            // Powiadom SchematicViewer żeby odświeżył stan (zastąpi temp marker
            // prawdziwym). tempId+realId pozwalają przepiąć TAKŻE otwarty panel
            // znacznika — bez tego zostaje on z martwym temp_ id.
            window.dispatchEvent(new CustomEvent('schematic-synced', {
                detail: { subtaskId, nodeId, schematics: data, tempId, realId: realMarker?.id || null },
            }));
        }
    }

    if (item.type === 'ADD_ATTACHMENT') {
        const { markerId, outboxId, fileName, fileType, subtaskId, nodeId } = item.payload;
        const draft = await db.attachmentDrafts.where('outboxId').equals(outboxId).first();
        if (!draft) {
            // Blob zniknął (wyczyszczony storage / ręczne usunięcie) — pliku nie
            // odzyskamy, ale nie chowamy tego pod dywan: wpis leci z kolejki
            // dopiero po głośnym zalogowaniu.
            console.error('[Outbox] ADD_ATTACHMENT bez draftu — plik utracony, usuwam wpis', outboxId);
            return;
        }

        // Marker mógł powstać offline. Zanim wyślemy, tłumaczymy temp_ id na
        // realne — inaczej serwer odbija FK violation (HTTP 500) w kółko.
        let targetMarkerId = markerId;
        if (String(markerId).startsWith('temp_')) {
            targetMarkerId = await resolveMarkerId(markerId);
            if (!targetMarkerId) {
                // Brak mapowania: marker albo jeszcze nie zsynchronizowany, albo
                // jego wpis ADD_MARKER dawno zniknął. Zdejmujemy z pętli, żeby nie
                // dobijać serwera, i oddajemy użytkownikowi do przypisania ręcznego.
                const stillQueued = await db.outbox
                    .where('type').equals('ADD_MARKER').toArray()
                    .then(list => list.some(m => m.payload?.tempId === markerId));
                if (stillQueued) throw new Error('Marker jeszcze niezsynchronizowany');
                await markOrphaned(item.id);
                window.dispatchEvent(new CustomEvent('attachment-orphaned', { detail: { markerId } }));
                console.warn('[Outbox] Osierocony załącznik — brak mapowania dla', markerId);
                return KEEP;
            }
            await db.outbox.update(item.id, { payload: { ...item.payload, markerId: targetMarkerId } });
        }

        const blob = new Blob([draft.arrayBuffer], { type: fileType });
        const formData = new FormData();
        formData.append('file', new File([blob], fileName, { type: fileType }));
        const res = await fetch(`${API_URL}/schematics/markers/${targetMarkerId}/attachments`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await db.attachmentDrafts.where('outboxId').equals(outboxId).delete();
        // Odśwież schematy w IDB i powiadom SchematicViewer
        const schUrl = subtaskId
            ? `${API_URL}/schematics/subtask/${subtaskId}`
            : nodeId ? `${API_URL}/schematics/node/${nodeId}` : null;
        if (schUrl) {
            const schRes = await fetch(schUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (schRes.ok) {
                const data = await schRes.json();
                const { upsertSchematics } = await import('../repos/schematicsRepo');
                await upsertSchematics(data, { subtaskId, nodeId });
                window.dispatchEvent(new CustomEvent('schematic-synced', { detail: { subtaskId, nodeId, schematics: data } }));
            }
        }
        window.dispatchEvent(new CustomEvent('attachment-synced', { detail: { markerId: targetMarkerId } }));
    }

    // @anchor wbs-qa-outbox-type
    // 'WBS_QA' — offline'owy zapis pytań/odpowiedzi węzła WBS z QaTreeView
    if (item.type === 'WBS_QA') {
        const { wbsNodeId, qa } = item.payload;
        const res = await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ qa }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        window.dispatchEvent(new CustomEvent('wbs-qa-synced', { detail: { wbsNodeId } }));
        window.dispatchEvent(new CustomEvent('wbs-qa-imported'));
    }

    if (item.type === 'DELETE_MARKER') {
        const { markerId } = item.payload;
        const res = await fetch(`${API_URL}/schematics/markers/${markerId}`, {
            method: 'DELETE',
            headers,
        });
        if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    }
}
