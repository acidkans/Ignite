import { useState, useEffect } from 'react';
import { API_URL } from '../config';

const DB_NAME = 'schemat-local-sync';
const STORE = 'handles';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => reject(req.error);
    });
}

async function getStoredHandle() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get('dir');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
}

async function saveStoredHandle(handle) {
    try {
        const db = await openDB();
        await new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(handle, 'dir');
            tx.oncomplete = resolve;
        });
    } catch { /* ignore */ }
}

async function getServerFileSize(fileUrl, token) {
    try {
        const res = await fetch(`${API_URL}/schematics/file/${fileUrl}`, {
            method: 'HEAD',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const len = res.headers.get('Content-Length');
        return len ? parseInt(len, 10) : null;
    } catch { return null; }
}

async function getLocalFileSize(dirHandle, fileName) {
    try {
        const fh = await dirHandle.getFileHandle(fileName);
        const f = await fh.getFile();
        return f.size;
    } catch { return null; } // plik nie istnieje lokalnie
}

export function useLocalSchemaSync() {
    const [dirHandle, setDirHandle] = useState(null);
    const [dirName, setDirName] = useState(null);
    const [syncStatus, setSyncStatus] = useState('idle'); // 'idle'|'syncing'|'done'|'error'
    const [syncStats, setSyncStats] = useState(null);    // { downloaded, skipped, total }
    const [lastSync, setLastSync] = useState(null);
    const isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

    useEffect(() => {
        if (!isSupported) return;
        getStoredHandle().then(async (handle) => {
            if (!handle) return;
            try {
                const perm = await handle.queryPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    setDirHandle(handle);
                    setDirName(handle.name);
                }
            } catch { /* ignore */ }
        });
    }, []);

    const chooseFolder = async () => {
        if (!isSupported) return null;
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await saveStoredHandle(handle);
            setDirHandle(handle);
            setDirName(handle.name);
            return handle;
        } catch (e) {
            if (e.name !== 'AbortError') console.error('chooseFolder:', e);
            return null;
        }
    };

    const clearHandle = async () => {
        setDirHandle(null);
        setDirName(null);
        setSyncStatus('idle');
        setSyncStats(null);
        try {
            const db = await openDB();
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete('dir');
        } catch { /* ignore */ }
    };

    const syncFiles = async (schematics, token, handleOverride) => {
        const h = handleOverride || dirHandle;
        if (!h || !schematics?.length) return;
        setSyncStatus('syncing');
        setSyncStats(null);

        try {
            const perm = await h.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') { setSyncStatus('error'); return; }

            // Równoległe sprawdzenie rozmiarów (HEAD + lokalny)
            const checks = await Promise.all(schematics.map(async (sch) => {
                const localName = sch.fileName || sch.fileUrl;
                const [serverSize, localSize] = await Promise.all([
                    getServerFileSize(sch.fileUrl, token),
                    getLocalFileSize(h, localName),
                ]);
                const needsDownload = serverSize !== null && serverSize !== localSize;
                return { sch, localName, needsDownload };
            }));

            let downloaded = 0;
            let skipped = 0;

            // Pobieramy tylko pliki które się różnią
            for (const { sch, localName, needsDownload } of checks) {
                if (!needsDownload) { skipped++; continue; }

                const res = await fetch(`${API_URL}/schematics/file/${sch.fileUrl}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) continue;

                try {
                    const blob = await res.blob();
                    const fh = await h.getFileHandle(localName, { create: true });
                    const writable = await fh.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    downloaded++;
                } catch (writeErr) {
                    if (writeErr.name === 'NotFoundError') {
                        // Folder nie istnieje — wyczyść handle
                        await clearHandle();
                        setSyncStatus('error');
                        return;
                    }
                    console.error('syncFiles write error:', writeErr);
                }
            }

            setLastSync(new Date());
            setSyncStats({ downloaded, skipped, total: schematics.length });
            setSyncStatus('done');
        } catch (e) {
            console.error('syncFiles:', e);
            if (e.name === 'NotFoundError') {
                await clearHandle();
            }
            setSyncStatus('error');
        }
    };

    return { dirHandle, dirName, syncStatus, syncStats, lastSync, isSupported, chooseFolder, syncFiles };
}
