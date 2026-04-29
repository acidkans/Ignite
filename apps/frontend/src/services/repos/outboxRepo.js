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

export async function updateTempMarkerPayload(tempId, updates) {
    const items = await db.outbox.where('type').equals('ADD_MARKER').toArray();
    const item = items.find(i => i.payload?.tempId === tempId);
    if (!item) return;
    await db.outbox.update(item.id, {
        payload: { ...item.payload, marker: { ...item.payload.marker, ...updates } },
    });
}
