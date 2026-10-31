import { API_URL } from '../../config';
import { setMeta } from '../db';
import { replaceMyUserTasks } from '../repos/userTasksRepo';
import { replaceSchematicsForUserTask } from '../repos/schematicsRepo';

/**
 * Hurtowy pull danych mobilnych z backendu do IDB.
 *
 * Wołane po loginie i przy `online` event. W Etapie 3 zostanie zastąpione
 * delta-syncem (`/sync/mobile?since=...`) — na razie pełny pull.
 *
 * Strategia bezpieczeństwa:
 *   - Cicho ignorujemy błędy sieci (offline-tolerant). Ostatni udany prefetch
 *     siedzi w IDB i wystarcza.
 *   - `lastPrefetchAt` w meta — diagnostyka i UX (badge "ostatnia synchronizacja").
 */

let inflight = null;

export async function prefetchMobileData(token) {
    if (!token) return { ok: false, reason: 'no-token' };
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const tasks = await fetchMyUserTasks(token);
            if (!tasks) return { ok: false, reason: 'user-tasks-fetch-failed' };

            await replaceMyUserTasks(tasks);

            // Prefetch schematów — najpierw per zadanie, fallback per node (jak SchematicViewer online).
            // Bez node-fallbacku schematy przypisane do węzła nie trafiają do IDB.
            const seenNodeIds = new Set();
            await runWithConcurrency(tasks.filter(t => t.nodeId), 4, async (task) => {
                let schematics = await fetchSchematicsFor(token, 'user-task', task.id);
                if ((!schematics || schematics.length === 0) && task.nodeId && !seenNodeIds.has(task.nodeId)) {
                    seenNodeIds.add(task.nodeId);
                    schematics = await fetchSchematicsFor(token, 'node', task.nodeId);
                }
                if (schematics?.length) {
                    await replaceSchematicsForUserTask(task.id, schematics);
                    for (const s of schematics) {
                        if (s.fileUrl) {
                            fetch(`${API_URL}/schematics/file/${s.fileUrl}`, {
                                headers: { Authorization: `Bearer ${token}` },
                                cache: 'no-store',
                            }).catch(() => {});
                        }
                    }
                }
            });

            await setMeta('lastPrefetchAt', new Date().toISOString());
            return { ok: true, count: tasks.length };
        } catch (err) {
            console.warn('[prefetch] błąd:', err);
            return { ok: false, reason: String(err) };
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

// Otwarte zadania zalogowanego (odpowiedzialny) — GET /my-tasks.
async function fetchMyUserTasks(token) {
    try {
        const res = await fetch(`${API_URL}/my-tasks`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function fetchSchematicsFor(token, type, id) {
    try {
        const res = await fetch(`${API_URL}/schematics/${type}/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function runWithConcurrency(items, limit, worker) {
    const queue = [...items];
    const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
        while (queue.length) {
            const item = queue.shift();
            await worker(item);
        }
    });
    await Promise.all(runners);
}
