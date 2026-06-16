// Persistent upload queue using IndexedDB.
// Survives page reloads / mobile camera returns / powrót z pickera plików.
// Obsługuje dwa typy (kind):
//   'attachment' — załącznik markera  → POST /schematics/markers/:markerId/attachments
//   'schematic'  — plik schematu PDF/JPG → POST /schematics/upload (nodeId + opcj. subtaskId)
// Wsteczna zgodność: stare wpisy bez `kind` traktujemy jak 'attachment'.

const DB_NAME = 'erp_upload_queue';
const STORE = 'pending';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function genId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function putItem(record) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = () => resolve(record.id);
        tx.onerror = () => reject(tx.error);
    }));
}

export async function enqueueUpload({ markerId, fileName, fileType, blob }) {
    const data = await blob.arrayBuffer();
    return putItem({
        id: genId(markerId),
        kind: 'attachment',
        markerId,
        fileName,
        fileType,
        data,
        createdAt: Date.now(),
    });
}

export async function enqueueSchematicUpload({ nodeId, subtaskId, fileName, fileType, blob }) {
    const data = await blob.arrayBuffer();
    return putItem({
        id: genId(`schematic_${nodeId}`),
        kind: 'schematic',
        nodeId,
        subtaskId: subtaskId || null,
        fileName,
        fileType,
        data,
        createdAt: Date.now(),
    });
}

export async function removeFromQueue(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getPendingUploads() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

export async function flushPendingUploads(apiUrl, onUploaded) {
    const pending = await getPendingUploads();
    if (!pending.length) return 0;

    const token = sessionStorage.getItem('token');
    if (!token) return 0;

    let sent = 0;
    for (const item of pending) {
        // Skip items older than 24h
        if (Date.now() - item.createdAt > 24 * 60 * 60 * 1000) {
            await removeFromQueue(item.id);
            continue;
        }
        try {
            const blob = new Blob([item.data], { type: item.fileType });
            const file = new File([blob], item.fileName, { type: item.fileType });
            const formData = new FormData();
            formData.append('file', file);

            let url;
            if (item.kind === 'schematic') {
                formData.append('nodeId', item.nodeId);
                if (item.subtaskId) formData.append('subtaskId', item.subtaskId);
                url = `${apiUrl}/schematics/upload`;
            } else {
                // 'attachment' (lub stary wpis bez kind)
                url = `${apiUrl}/schematics/markers/${item.markerId}/attachments`;
            }

            const res = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            if (res.ok) {
                await removeFromQueue(item.id);
                sent++;
                let result = null;
                try { result = await res.json(); } catch (_) {}
                onUploaded?.(result, item);
            }
        } catch (e) {
            console.warn('[UploadQueue] retry failed for', item.id, e);
        }
    }
    return sent;
}
