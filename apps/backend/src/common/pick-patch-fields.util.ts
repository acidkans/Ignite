import { Logger } from '@nestjs/common';

const logger = new Logger('PickPatchFields');

// @anchor pick-patch-fields
// Z body PATCH-a zostawia tylko pola z listy dozwolonych i tylko wartości skalarne
// (string / number / boolean / null). Obiekt albo tablica w wartości to dla Prismy zagnieżdżony
// zapis relacji (`material: { update: {...} }`, `proposals: { create: [...] }`) — odrzucamy go.
// Pominięte klucze trafiają do logu, żeby nowe pole wysyłane z frontu nie ginęło po cichu.
// Powód: `@Body() body: any` + `data: { ...rest }` pozwalał nadpisać dowolną kolumnę
// (`imageUrl`, `budgetedPriceNetto`, `nodeId`) — audyt 2026-11-10.
export function pickPatchFields(
    body: Record<string, any> | null | undefined,
    allowed: readonly string[],
    context: string,
): Record<string, any> {
    const out: Record<string, any> = {};
    const dropped: string[] = [];
    for (const [key, value] of Object.entries(body ?? {})) {
        if (value === undefined) continue;
        const scalar = value === null || ['string', 'number', 'boolean'].includes(typeof value);
        if (!allowed.includes(key) || !scalar) {
            dropped.push(key);
            continue;
        }
        out[key] = value;
    }
    if (dropped.length > 0) logger.warn(`[${context}] pominięte pola PATCH: ${dropped.join(', ')}`);
    return out;
}
