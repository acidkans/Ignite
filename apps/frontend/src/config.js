// Konfiguracja URL API
// Używamy relatywnej ścieżki /api, która będzie obsługiwana przez:
// 1. Nginx (na produkcji/w Dockerze) - proxy_pass do backendu
// 2. Vite Proxy (lokalnie npm run dev) - proxy do localhost:3001
// 3. Traefik (z zewnątrz) - routing po ścieżce

export const API_URL = '/api'; // Use relative path to leverage Vite Proxy (dev) and Nginx (prod)
