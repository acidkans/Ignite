import Dexie from 'dexie';

/**
 * Lokalna baza offline-first dla Gigatel ERP.
 *
 * Etap 1: meta + outbox (szkielet).
 * Etap 2: subtasks, nodes, schematics — lustro encji potrzebnych mobilnie.
 *
 * Reguła: NIGDY nie modyfikujemy istniejącej `version(n)` po release —
 * dodajemy `version(n+1)` z nowym schematem żeby Dexie zrobił migrację.
 */
export const db = new Dexie('gigatel-erp');

db.version(1).stores({
    meta: '&key',
    outbox: '++id, clientUuid, type, createdAt',
});

db.version(2).stores({
    meta: '&key',
    outbox: '++id, clientUuid, type, createdAt',
    subtasks: 'id, status, plannedStart, plannedEnd, nodeId, updatedAt',
    nodes: 'id',
    schematics: 'id, subtaskId, nodeId, updatedAt',
});

db.version(3).stores({
    meta: '&key',
    outbox: '++id, clientUuid, type, createdAt',
    subtasks: 'id, status, plannedStart, plannedEnd, nodeId, updatedAt',
    nodes: 'id',
    schematics: 'id, subtaskId, nodeId, updatedAt',
    // Drafty załączników offline — blob + metadane. Czyszczone po syncu.
    attachmentDrafts: '++id, outboxId, createdAt',
});

db.version(4).stores({
    meta: '&key',
    outbox: '++id, clientUuid, type, createdAt',
    subtasks: 'id, status, plannedStart, plannedEnd, nodeId, updatedAt',
    nodes: 'id',
    schematics: 'id, subtaskId, nodeId, updatedAt',
    attachmentDrafts: '++id, outboxId, createdAt',
    // Mapa temp_<uuid> → realne id markera nadane przez serwer przy syncu
    // ADD_MARKER. Przeżywa usunięcie wpisu ADD_MARKER z outboxa — bez tego
    // załącznik zakolejkowany JUŻ PO zsynchronizowaniu markera zostaje z
    // martwym temp_ id i leci w nieskończoność w FK violation (HTTP 500).
    // @anchor marker-id-map
    markerIdMap: '&tempId, realId, createdAt',
});

// --- Mapa temp → real id markera ---

// @anchor remember-marker-id
export async function rememberMarkerId(tempId, realId) {
    if (!tempId || !realId) return;
    await db.markerIdMap.put({ tempId, realId, createdAt: new Date().toISOString() });
}

// @anchor resolve-marker-id
export async function resolveMarkerId(markerId) {
    if (!markerId || !String(markerId).startsWith('temp_')) return markerId;
    const row = await db.markerIdMap.get(markerId);
    return row?.realId ?? null;
}

// --- Helpery meta (proste KV) ---

export async function getMeta(key) {
    const row = await db.meta.get(key);
    return row?.value ?? null;
}

export async function setMeta(key, value) {
    await db.meta.put({ key, value });
}

export async function deleteMeta(key) {
    await db.meta.delete(key);
}
