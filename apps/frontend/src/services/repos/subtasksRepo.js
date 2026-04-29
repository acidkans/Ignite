import { db } from '../db';

/**
 * Repository dla subtasków w lokalnym IDB.
 * Wyłącznie operacje read/bulk-replace — mutacje pojedyncze idą przez outbox (Etap 3).
 */

export async function getAllSubtasks() {
    return db.subtasks.toArray();
}

export async function getSubtaskById(id) {
    return db.subtasks.get(id);
}

/**
 * Zastępuje całą listę subtasków przypisanych do bieżącego usera.
 * Bezpieczne w transakcji — clear+bulkPut atomowo.
 */
export async function replaceAssignedSubtasks(subtasks) {
    return db.transaction('rw', db.subtasks, db.nodes, async () => {
        await db.subtasks.clear();
        if (subtasks.length === 0) return;
        await db.subtasks.bulkPut(subtasks.map(normalize));

        // Wyciągnij unikalne nodes do tabeli nodes (denormalizacja name/customTypeLabel/type).
        const nodes = [];
        const seen = new Set();
        for (const t of subtasks) {
            if (t.node && !seen.has(t.node.id)) {
                seen.add(t.node.id);
                nodes.push({
                    id: t.node.id,
                    name: t.node.name,
                    type: t.node.type,
                    customTypeLabel: t.node.customTypeLabel,
                });
            }
        }
        if (nodes.length) await db.nodes.bulkPut(nodes);
    });
}

function normalize(task) {
    // Stripujemy zagnieżdżony node — przechowujemy go w osobnej tabeli, łączymy przy odczycie.
    const { node, ...rest } = task;
    return {
        ...rest,
        nodeId: rest.nodeId ?? node?.id ?? null,
        // Dexie indexuje string+null, ale Date jest przechowywany jako string ISO — bez konwersji.
    };
}

/**
 * Hydruje subtasks o powiązany node (tak jak zwracał backend).
 */
export async function getAllSubtasksWithNodes() {
    const [tasks, nodes] = await Promise.all([
        db.subtasks.toArray(),
        db.nodes.toArray(),
    ]);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    return tasks.map((t) => ({ ...t, node: t.nodeId ? nodeById.get(t.nodeId) ?? null : null }));
}
