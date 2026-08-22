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
// Zwraca listę { name, ids, twins } posortowaną wg częstości użycia (najczęściej powtarzana
// nazwa pierwsza), a przy remisie — od najkrótszej, żeby podpowiedź nie doklejała
// od razu długiego opisu. Dedup po nazwie znormalizowanej, ale wyświetlamy pisownię
// pierwszego wystąpienia. `twins` trzyma ustawienia każdego bliźniaka (typ, jednostka,
// cena, narzut) — z nich `pickTwinDefaults` wybiera wartości do skopiowania.
export function buildNameSuggestionPool(items) {
    const byKey = new Map();
    const walk = (nodes) => (nodes || []).forEach(n => {
        const raw = String(n?.name || '').trim();
        if (raw.length >= MIN_PREFIX) {
            const key = normalizeNameKey(raw);
            const twin = {
                id: n.id,
                type: n.type || '',
                unit: n.unit || '',
                unitCost: Number(n.unitCost) || 0,
                margin: Number(n.margin) || 0,
            };
            const hit = byKey.get(key);
            if (hit) { hit.ids.push(n.id); hit.twins.push(twin); }
            else byKey.set(key, { name: raw, ids: [n.id], twins: [twin] });
        }
        walk(n?.children);
    });
    walk(items);
    return [...byKey.values()].sort((a, b) => b.ids.length - a.ids.length || a.name.length - b.name.length);
}

// @anchor pick-twin-defaults
// Ustawienia do przepisania na węzeł, który właśnie dostał nazwę istniejącą już w drzewie.
// Dla każdego pola OSOBNO bierzemy wartość najczęstszą wśród bliźniaków — jeden węzeł
// z niedokończoną konfiguracją nie psuje wtedy podpowiedzi dla pozostałych. Pola puste
// (typ '', jednostka '', cena 0, narzut 0) nie niosą informacji i nie są kandydatami,
// więc brak zwycięzcy = `null` dla tego pola, czyli „nie mam czego skopiować".
// Węzeł docelowy (`excludeId`) nigdy nie głosuje na samego siebie.
export function pickTwinDefaults(pool, name, excludeId) {
    const key = normalizeNameKey(String(name || '').trim());
    if (!key) return null;
    const hit = (pool || []).find(c => normalizeNameKey(c.name) === key);
    const twins = (hit?.twins || []).filter(t => t.id !== excludeId);
    if (!twins.length) return null;
    const mode = (field) => {
        const counts = new Map();
        twins.forEach(t => {
            const v = t[field];
            if (v === '' || v === 0 || v == null) return;
            counts.set(v, (counts.get(v) || 0) + 1);
        });
        let best = null, bestN = 0;
        counts.forEach((n, v) => { if (n > bestN) { best = v; bestN = n; } });
        return best;
    };
    const out = { type: mode('type'), unit: mode('unit'), unitCost: mode('unitCost'), margin: mode('margin') };
    return (out.type == null && out.unit == null && out.unitCost == null && out.margin == null) ? null : out;
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
