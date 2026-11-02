
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  MOVE = 'MOVE', // specific for tree operations
  ACCEPT = 'ACCEPT', // akceptacja wersji zamówienia (baseline) — F4
  REVOKE_ACCEPT = 'REVOKE_ACCEPT', // cofnięcie akceptacji z powodem — F4
  START_REALIZATION = 'START_REALIZATION', // uruchomienie realizacji (ZAAKCEPTOWANE → REALIZACJA)
  STOP_REALIZATION = 'STOP_REALIZATION', // cofnięcie uruchomienia (REALIZACJA → ZAAKCEPTOWANE)
}

export interface AuditContext {
  userId?: string;
  ip?: string;
  userAgent?: string;
}
