import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// @anchor offer-lock-util
// Blokada wartości OFERTOWYCH po akceptacji baseline (`ProcessNode.acceptedVersionId`).
// Zaakceptowana oferta jest zobowiązaniem wobec klienta: wolno pracować po stronie zakupu,
// nie wolno przepisywać tego, co zostało wycenione. Dotyczy WSZYSTKICH typów liści WBS
// (material, equipment, work, service, fuel, lodging…), nie tylko materiałowych.
//
// Reguła jest jedna dla całego backendu — każdy nowy endpoint zapisujący nośnik wartości
// ofertowej musi zawołać `assertOfferEditable` przed zapisem.

// @anchor offer-lock-user
export interface OfferLockUser {
    userId?: string;
    roles?: string[];
}

// @anchor offer-locked-wbs-fields — pola `WbsNode` niosące wartość ofertową
export const OFFER_LOCKED_WBS_FIELDS = ['unitCost', 'margin', 'discount', 'quantity', 'unitPrice'] as const;

// @anchor pick-offer-changes — zwraca tylko te pola ofertowe, które REALNIE zmieniają wartość.
// Bez tego porównania guard odpalałby na każdym zapisie budżetu (front wysyła komplet pól
// cenowych nawet gdy user zmienił jedno), zasypując AuditLog wpisami bez zmiany.
export function pickOfferChanges(
    existing: Record<string, any> | null | undefined,
    data: Record<string, any>,
    fields: readonly string[] = OFFER_LOCKED_WBS_FIELDS,
): Record<string, { old: any; new: any }> {
    const changes: Record<string, { old: any; new: any }> = {};
    for (const key of fields) {
        const raw = data?.[key];
        if (raw === undefined || raw === null || raw === '') continue;
        const next = typeof raw === 'number' ? raw : parseFloat(String(raw));
        if (!Number.isFinite(next)) continue;
        const prev = Number(existing?.[key] ?? 0);
        // Tolerancja groszowa — front przysyła wartości po własnym przeliczeniu (np. unitPrice
        // z marży), więc dosłowne !== dawałoby fałszywe „zmiany" na ostatnim miejscu po przecinku.
        if (Math.abs(prev - next) < 0.005) continue;
        changes[key] = { old: existing?.[key] ?? null, new: next };
    }
    return changes;
}

// @anchor assert-offer-editable — przepuszcza zapis albo rzuca 403.
// Brak akceptacji → przechodzi bez śladu. Po akceptacji: manager/admin przechodzi ale zostawia
// wpis w AuditLog, pozostali dostają 403 z informacją, że trzeba cofnąć akceptację.
export async function assertOfferEditable(
    prisma: PrismaService,
    params: {
        processNodeId?: string | null;
        user?: OfferLockUser;
        entity: string;
        entityId: string;
        changes: Record<string, unknown>;
    },
): Promise<void> {
    const { processNodeId, user, entity, entityId, changes } = params;
    if (!processNodeId) return;
    if (!changes || Object.keys(changes).length === 0) return;

    const node = await prisma.processNode.findUnique({
        where: { id: processNodeId },
        select: { acceptedVersionId: true, acceptedVersion: { select: { label: true } } },
    });
    if (!node?.acceptedVersionId) return;

    const roles = user?.roles ?? [];
    if (!roles.includes('ADMIN') && !roles.includes('MANAGER')) {
        throw new ForbiddenException(
            `Zamówienie ma zaakceptowany baseline „${node.acceptedVersion?.label ?? 'bez nazwy'}" — wartości ofertowe są zablokowane. Zmiana wymaga uprawnień managera albo cofnięcia akceptacji.`,
        );
    }

    await prisma.auditLog.create({
        data: {
            action: 'UPDATE',
            entity,
            entityId,
            diff: {
                context: 'edycja wartości ofertowej po akceptacji baseline',
                baselineVersionId: node.acceptedVersionId,
                changes,
            } as any,
            userId: user?.userId ?? null,
        },
    }).catch(() => { /* dziennik nie może blokować zapisu */ });
}
