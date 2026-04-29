import { API_URL } from '../../config';
import { getAllPending, removeById } from '../repos/outboxRepo';
import { db } from '../db';

let syncing = false;

export async function syncOutbox(token) {
    if (syncing) return;
    syncing = true;
    try {
        const items = await getAllPending();
        if (!items.length) return;
        for (const item of items) {
            try {
                await processItem(item, token);
                await removeById(item.id);
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
        const { schematicId, marker, subtaskId, nodeId } = item.payload;
        const res = await fetch(`${API_URL}/schematics/${schematicId}/markers`, {
            method: 'POST',
            headers,
            body: JSON.stringify(marker),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Refresh schematics in IDB so markers are current after sync
        const url = subtaskId
            ? `${API_URL}/schematics/subtask/${subtaskId}`
            : `${API_URL}/schematics/node/${nodeId}`;
        const schRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (schRes.ok) {
            const { upsertSchematics } = await import('../repos/schematicsRepo');
            await upsertSchematics(await schRes.json(), { subtaskId, nodeId });
        }
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
