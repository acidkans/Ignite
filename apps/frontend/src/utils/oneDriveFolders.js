import { useState, useEffect } from 'react';
import { API_URL } from '../config';

// Struktura katalogów zamówienia na OneDrive (ORDER_FOLDERS z backendu) — pobierana raz na sesję strony.
// Źródło prawdy jest w `apps/backend/src/onedrive/order-folders.ts`; front tylko z niej czyta.

let cache = null;

// @anchor load-onedrive-folders
export function loadOneDriveFolders() {
  if (!cache) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    cache = fetch(`${API_URL}/onedrive/folders`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => { if (!d) cache = null; return d; });
  }
  return cache;
}

// @anchor use-onedrive-folders
export function useOneDriveFolders() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    loadOneDriveFolders().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

// @anchor resolve-onedrive-folder
// Katalog zapisu: wprost `folderKey` albo — dla istniejącego dokumentu — katalog wynikający z jego kategorii.
export function resolveOneDriveFolder(folders, { folderKey, documentCategory } = {}) {
  const key = documentCategory !== undefined
    ? (folders?.categoryFolders?.[documentCategory ?? 'standard'] || 'clientDocs')
    : folderKey;
  const path = folders?.folders?.find((f) => f.key === key)?.path || null;
  return { key, path };
}
