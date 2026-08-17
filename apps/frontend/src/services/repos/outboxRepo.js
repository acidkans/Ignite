import { db } from '../db';

export async function enqueue(type, payload) {
    return db.outbox.add({
        clientUuid: crypto.randomUUID(),
        type,
        payload,
        createdAt: new Date().toISOString(),
        retries: 0,
    });
}

// Wpisy `orphaned` są pomijane — to załączniki wskazujące na temp_ id markera,
// którego nie da się już rozwiązać. Retry ich nie naprawi (serwer zwraca 500 na
// FK), więc czekają na ręczne przypisanie w panelu znacznika.
export async function getAllPending() {
    const all = await db.outbox.orderBy('createdAt').toArray();
    return all.filter(i => !i.orphaned);
}

// Osierocone załączniki — pliki zakolejkowane pod martwym temp_ id markera.
// @anchor get-orphaned-attachments
export async function getOrphanedAttachments() {
    const items = await db.outbox.where('type').equals('ADD_ATTACHMENT').toArray();
    return items.filter(i => i.orphaned);
}

// Oznacza wpis jako osierocony — zdejmuje go z pętli synca, ale NIE kasuje pliku.
// @anchor mark-outbox-orphaned
export async function markOrphaned(id) {
    return db.outbox.update(id, { orphaned: true });
}

// Ręczne przypisanie osieroconego załącznika do wskazanego (realnego) markera.
// @anchor reassign-orphaned-attachment
export async function reassignOrphanedAttachment(id, markerId, { subtaskId, nodeId } = {}) {
    const item = await db.outbox.get(id);
    if (!item) return;
    await db.outbox.update(id, {
        orphaned: false,
        payload: {
            ...item.payload,
            markerId,
            subtaskId: subtaskId ?? item.payload?.subtaskId ?? null,
            nodeId: nodeId ?? item.payload?.nodeId ?? null,
        },
    });
}

export async function removeById(id) {
    return db.outbox.delete(id);
}

export async function countPending() {
    return db.outbox.count();
}

// @anchor get-pending-by-type
export async function getPendingByType(type) {
    return db.outbox.where('type').equals(type).toArray();
}

// Kolejkuje zapis Q&A węzła WBS (latest-wins: wcześniejszy wpis dla tego samego
// węzła jest zastępowany, żeby sync nie nadpisał nowszej edycji starszą).
// @anchor enqueue-wbs-qa
export async function enqueueWbsQa(wbsNodeId, qa) {
    const items = await db.outbox.where('type').equals('WBS_QA').toArray();
    for (const item of items) {
        if (item.payload?.wbsNodeId === wbsNodeId) await db.outbox.delete(item.id);
    }
    return enqueue('WBS_QA', { wbsNodeId, qa });
}

export async function updateTempMarkerPayload(tempId, updates) {
    const items = await db.outbox.where('type').equals('ADD_MARKER').toArray();
    const item = items.find(i => i.payload?.tempId === tempId);
    if (!item) return;
    await db.outbox.update(item.id, {
        payload: { ...item.payload, marker: { ...item.payload.marker, ...updates } },
    });
}
