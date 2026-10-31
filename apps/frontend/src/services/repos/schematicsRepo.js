import { db } from '../db';

/**
 * Repository dla schematów (PDF/JPG + markery) w lokalnym IDB.
 * Sam plik PDF nie jest tu trzymany — leci z `/api/schematics/file/*` przez SW runtime cache.
 * Tu trzymamy tylko metadane + listę markerów (= odpowiedź endpointu listy).
 */

export async function getSchematicsByUserTask(userTaskId) {
    if (!userTaskId) return [];
    return db.schematics.where('userTaskId').equals(userTaskId).toArray();
}

export async function getSchematicsByNode(nodeId) {
    if (!nodeId) return [];
    return db.schematics.where('nodeId').equals(nodeId).toArray();
}

/**
 * Zastępuje schematy przypisane do konkretnego zadania (UserTask).
 * Backend zwraca pełną listę (z markerami) — replace, nie merge.
 */
export async function replaceSchematicsForUserTask(userTaskId, schematics) {
    return db.transaction('rw', db.schematics, async () => {
        const existing = await db.schematics.where('userTaskId').equals(userTaskId).toArray();
        const existingIds = existing.map((s) => s.id);
        if (existingIds.length) await db.schematics.bulkDelete(existingIds);
        if (schematics.length) {
            await db.schematics.bulkPut(
                schematics.map((s) => ({
                    ...s,
                    userTaskId,
                    nodeId: s.nodeId ?? null,
                    updatedAt: s.updatedAt ?? new Date().toISOString(),
                })),
            );
        }
    });
}

/**
 * Upsert schematów po pobraniu ich przez SchematicViewer (online flow).
 * Działa zarówno dla list per-zadanie, jak i per-node — bez kasowania innych.
 */
export async function upsertSchematics(schematics, { userTaskId, nodeId } = {}) {
    if (!schematics?.length) return;
    return db.schematics.bulkPut(
        schematics.map((s) => ({
            ...s,
            userTaskId: s.userTaskId ?? userTaskId ?? null,
            nodeId: s.nodeId ?? nodeId ?? null,
            updatedAt: s.updatedAt ?? new Date().toISOString(),
        })),
    );
}
