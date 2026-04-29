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
    // Subtaski — render listy i widoku detalu offline.
    // Indeksy: status (filtry), plannedStart/plannedEnd (zakres dat), nodeId, updatedAt.
    subtasks: 'id, status, plannedStart, plannedEnd, nodeId, updatedAt',
    // Węzły procesu — kontekst nazwy projektu w mobile detail.
    nodes: 'id',
    // Schematy + ich markery (cały obiekt w polu `data`).
    // Composite indexes po subtaskId i nodeId, żeby SchematicViewer mógł zapytać tak jak teraz.
    schematics: 'id, subtaskId, nodeId, updatedAt',
});

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
