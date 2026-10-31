import { db } from '../db';

/**
 * Repository dla „moich” zadań (UserTask) w lokalnym IDB.
 * Wyłącznie operacje read/bulk-replace — zmiany statusu idą przez outbox (`USER_TASK_STATUS`).
 */

/**
 * Zastępuje całą listę zadań zalogowanego (odpowiedź GET /my-tasks).
 * Bezpieczne w transakcji — clear+bulkPut atomowo. `node` / `wbsNode` zostają w wierszu
 * (to tylko id + nazwa), więc lista offline wygląda tak samo jak online.
 */
// @anchor replace-my-user-tasks
export async function replaceMyUserTasks(tasks) {
    return db.transaction('rw', db.userTasks, async () => {
        await db.userTasks.clear();
        if (tasks.length) await db.userTasks.bulkPut(tasks);
    });
}

// @anchor get-all-user-tasks
export async function getAllUserTasks() {
    return db.userTasks.toArray();
}
