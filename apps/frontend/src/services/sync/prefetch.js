import { API_URL } from '../../config';
import { setMeta } from '../db';
import { replaceAssignedSubtasks } from '../repos/subtasksRepo';
import { replaceSchematicsForSubtask } from '../repos/schematicsRepo';

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
            const subtasks = await fetchAssignedSubtasks(token);
            if (!subtasks) return { ok: false, reason: 'subtasks-fetch-failed' };

            await replaceAssignedSubtasks(subtasks);

            // Prefetch schematów dla każdego subtaska — równolegle, ale ograniczone do 4 naraz.
            await runWithConcurrency(subtasks, 4, async (task) => {
                const schematics = await fetchSchematicsFor(token, task.id);
                if (schematics) {
                    await replaceSchematicsForSubtask(task.id, schematics);
                    // Touch plików schematów żeby wpadły do SW runtime cache.
                    for (const s of schematics) {
                        if (s.fileUrl) {
                            // fire-and-forget; SW przechwyci i scache'uje
                            fetch(`${API_URL}/schematics/file/${s.fileUrl}`, {
                                headers: { Authorization: `Bearer ${token}` },
                                cache: 'no-store',
                            }).catch(() => {});
                        }
                    }
                }
            });

            await setMeta('lastPrefetchAt', new Date().toISOString());
            return { ok: true, count: subtasks.length };
        } catch (err) {
            console.warn('[prefetch] błąd:', err);
            return { ok: false, reason: String(err) };
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

async function fetchAssignedSubtasks(token) {
    try {
        const res = await fetch(`${API_URL}/subtasks/assigned/me`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function fetchSchematicsFor(token, subtaskId) {
    try {
        const res = await fetch(`${API_URL}/schematics/subtask/${subtaskId}`, {
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
