/**
 * Rozwiązywanie wersji projektu (ProjectVersion) dla zapytań wersjonowanych.
 *
 * Po przejściu na model "eager" (każde zamówienie ma realną wersję od startu)
 * baseline `versionId = null` przestaje być domyślnym magazynem treści.
 * Wiele wywołań z frontu idzie jednak BEZ versionId (np. panele schematu,
 * eksporty). Aby nie czytały pustego baseline, brak versionId rozwiązujemy do
 * AKTYWNEJ wersji danego węzła. Gdy aktywnej nie ma (np. dane jeszcze
 * niezmigrowane) — fallback do null, czyli zachowanie sprzed migracji.
 */

// Minimalny strukturalny typ klienta — pasuje zarówno do PrismaService,
// jak i do Prisma.TransactionClient (oba mają projectVersion.findFirst).
type VersionResolverClient = {
    projectVersion: {
        findFirst: (args: any) => Promise<{ id: string } | null>;
    };
};

// @anchor normalize-version-id
// Czysta normalizacja stringa wersji: 'null' / 'undefined' / '' → null.
export function normalizeVersionId(versionId?: string | null): string | null {
    return (!versionId || versionId === 'null' || versionId === 'undefined') ? null : versionId;
}

// @anchor resolve-version-id
// Zwraca docelowe versionId dla zapytania: jawne (jeśli podane) lub id aktywnej
// wersji węzła (fallback). Brak aktywnej → null (kompatybilność z baseline).
export async function resolveVersionId(
    prisma: VersionResolverClient,
    nodeId: string,
    versionId?: string | null,
): Promise<string | null> {
    const explicit = normalizeVersionId(versionId);
    if (explicit) return explicit;
    if (!nodeId) return null;
    const active = await prisma.projectVersion.findFirst({
        where: { nodeId, isActive: true },
        select: { id: true },
    });
    return active?.id ?? null;
}
