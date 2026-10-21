import { isRejectedPlan } from './plan-status.util';

// @anchor exec-leaf-types-backend — lustro `EXEC_LEAF_TYPES` z `wbsConstants.js`: liście, przy
// których ktoś fizycznie coś robi (montaż materiału i sprzętu, wykonanie pracy i usługi).
export const EXEC_LEAF_TYPES_BACKEND = ['material', 'equipment', 'work', 'service'];

// @anchor order-closure-codes — kody osi wykonania, które ZAMYKAJĄ pozycję odbiorem,
// i kody zamknięte inaczej (nie blokują zamknięcia zamówienia). Lustro `ZAMKNIETE_KODY`
// i `NEUTRALNE_KODY` z `realizationBilans.js` — reguła musi być jedna dla ekranu i alertów.
export const CLOSED_EXEC_CODES = ['HANDED_OVER', 'INVOICED'];
export const NEUTRAL_EXEC_CODES = ['CANCELLED', 'UNFINISHED'];

// @anchor order-closure-state — lustro `stanZamkniecia()` z frontu. Zamówienie jest zamknięte,
// gdy każda liczona pozycja jest odebrana protokołem albo zafakturowana; zamówienie bez
// liczonych pozycji NIE jest zamknięte.
export function orderClosureState(leaves: { type?: string | null; status?: string | null; execStatus?: string | null }[]) {
    const counted = (leaves || []).filter(n =>
        EXEC_LEAF_TYPES_BACKEND.includes(String(n?.type || '').toLowerCase().trim())
        && !isRejectedPlan(n?.status)
        && !NEUTRAL_EXEC_CODES.includes(String(n?.execStatus || '')));
    const handedOver = counted.filter(n => CLOSED_EXEC_CODES.includes(String(n?.execStatus || ''))).length;
    return { closed: counted.length > 0 && handedOver === counted.length, handedOver, positions: counted.length };
}
