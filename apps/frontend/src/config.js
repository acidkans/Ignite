// Konfiguracja URL API
// Używamy relatywnej ścieżki /api, która będzie obsługiwana przez:
// 1. Nginx (na produkcji/w Dockerze) - proxy_pass do backendu
// 2. Vite Proxy (lokalnie npm run dev) - proxy do localhost:3001
// 3. Traefik (z zewnątrz) - routing po ścieżce

export const API_URL = '/api'; // Use relative path to leverage Vite Proxy (dev) and Nginx (prod)

// Twardy limit rozmiaru pojedynczego załącznika (zdjęcie / film / plik).
//
// Powód: erp.gigatel.org stoi za proxy Cloudflare, które na planach Free i Pro
// odrzuca żądania powyżej 100 MB własnym HTTP 413 — i robi to NA KRAWĘDZI, więc
// backend takiego uploadu w ogóle nie widzi: zero w logach, zero w bazie.
// Zmierzone na produkcji: 95 MB dochodzi do backendu, 105 MB wraca jako 413 po
// 0,48 s. Film z telefonu potrafi mieć 150–200 MB i wpadał w tę pułapkę po cichu:
// kolejka próbowała 6 razy, po czym parkowała plik jako "osierocony".
// 90 MiB (~94,4 MB) zostawia zapas na narzut multipart i na to, że nie wiadomo,
// czy Cloudflare liczy 100 MB czy 100 MiB.
// @anchor max-attachment-bytes
export const MAX_ATTACHMENT_BYTES = 90 * 1024 * 1024;

// Rozmiar po ludzku — do komunikatów o przekroczonym limicie.
// @anchor format-bytes
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
