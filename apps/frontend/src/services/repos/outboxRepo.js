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

export async function getAllPending() {
    return db.outbox.orderBy('createdAt').toArray();
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
