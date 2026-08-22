// Czysta logika podpowiadania nazw liści WBS — bez Reacta i JSX, żeby dała się
// odpalić i przetestować w Node (test/test-name-autocomplete.mjs).

// @anchor wbs-name-min-prefix
// Poniżej tylu znaków nie podpowiadamy — przy 1–2 literach trafień jest tyle, że
// podpowiedź częściej przeszkadza niż pomaga.
export const MIN_PREFIX = 3;

// @anchor normalize-name-key
// Klucz porównania nazw: bez różnicy wielkości liter i bez różnic w spacjach.
// Świadomie NIE ruszamy polskich znaków ani interpunkcji — tu chodzi o dosłowny
// prefiks, a nie o dopasowanie rozmyte (to jest osobny, późniejszy krok).
export const normalizeNameKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trimStart();

// @anchor build-name-suggestion-pool
// Pula nazw do autouzupełniania, zbudowana z całego drzewa WBS jednego projektu.
// Zwraca listę { name, ids } posortowaną wg częstości użycia (najczęściej powtarzana
// nazwa pierwsza), a przy remisie — od najkrótszej, żeby podpowiedź nie doklejała
// od razu długiego opisu. Dedup po nazwie znormalizowanej, ale wyświetlamy pisownię
// pierwszego wystąpienia.
export function buildNameSuggestionPool(items) {
    const byKey = new Map();
    const walk = (nodes) => (nodes || []).forEach(n => {
        const raw = String(n?.name || '').trim();
        if (raw.length >= MIN_PREFIX) {
            const key = normalizeNameKey(raw);
            const hit = byKey.get(key);
            if (hit) hit.ids.push(n.id);
            else byKey.set(key, { name: raw, ids: [n.id] });
        }
        walk(n?.children);
    });
    walk(items);
    return [...byKey.values()].sort((a, b) => b.ids.length - a.ids.length || a.name.length - b.name.length);
}

// @anchor find-name-suggestion
// Pierwsza nazwa z puli zaczynająca się od wpisanego prefiksu i dłuższa od niego.
// `excludeId` chroni przed podpowiadaniem węzłowi jego własnej nazwy — ale tylko gdy
// jest jedynym jej nosicielem; jeśli ta sama nazwa jest też gdzie indziej, podpowiedź
// jest sensowna. Zwraca null, gdy nie ma czego dopisać.
export function findNameSuggestion(pool, typed, excludeId) {
    const raw = String(typed || '');
    if (raw.trim().length < MIN_PREFIX) return null;
    const key = normalizeNameKey(raw);
    const hit = (pool || []).find(c => {
        if (c.name.length <= raw.length) return false;
        if (!normalizeNameKey(c.name).startsWith(key)) return false;
        return !(c.ids.length === 1 && c.ids[0] === excludeId);
    });
    // Doklejamy ogon do tego, co użytkownik faktycznie napisał — jego wielkość liter
    // zostaje nietknięta, dopisek bierze pisownię ze wzorca.
    return hit ? raw + hit.name.slice(raw.length) : null;
}
