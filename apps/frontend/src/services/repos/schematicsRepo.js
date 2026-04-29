import { db } from '../db';

/**
 * Repository dla schematów (PDF/JPG + markery) w lokalnym IDB.
 * Sam plik PDF nie jest tu trzymany — leci z `/api/schematics/file/*` przez SW runtime cache.
 * Tu trzymamy tylko metadane + listę markerów (= odpowiedź endpointu listy).
 */

export async function getSchematicsBySubtask(subtaskId) {
    if (!subtaskId) return [];
    return db.schematics.where('subtaskId').equals(subtaskId).toArray();
}

export async function getSchematicsByNode(nodeId) {
    if (!nodeId) return [];
    return db.schematics.where('nodeId').equals(nodeId).toArray();
}

/**
 * Zastępuje schematy przypisane do konkretnego subtaska/węzła.
 * Backend zwraca pełną listę (z markerami) — replace, nie merge.
 */
export async function replaceSchematicsForSubtask(subtaskId, schematics) {
    return db.transaction('rw', db.schematics, async () => {
        const existing = await db.schematics.where('subtaskId').equals(subtaskId).toArray();
        const existingIds = existing.map((s) => s.id);
        if (existingIds.length) await db.schematics.bulkDelete(existingIds);
        if (schematics.length) {
            await db.schematics.bulkPut(
                schematics.map((s) => ({
                    ...s,
                    subtaskId,
                    nodeId: s.nodeId ?? null,
                    updatedAt: s.updatedAt ?? new Date().toISOString(),
                })),
            );
        }
    });
}

/**
 * Upsert schematów po pobraniu ich przez SchematicViewer (online flow).
 * Działa zarówno dla list per-subtask, jak i per-node — bez kasowania innych.
 */
export async function upsertSchematics(schematics, { subtaskId, nodeId } = {}) {
    if (!schematics?.length) return;
    return db.schematics.bulkPut(
        schematics.map((s) => ({
            ...s,
            subtaskId: s.subtaskId ?? subtaskId ?? null,
            nodeId: s.nodeId ?? nodeId ?? null,
            updatedAt: s.updatedAt ?? new Date().toISOString(),
        })),
    );
}
