
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  MOVE = 'MOVE', // specific for tree operations
  ACCEPT = 'ACCEPT', // akceptacja wersji zamówienia (baseline) — F4
  REVOKE_ACCEPT = 'REVOKE_ACCEPT', // cofnięcie akceptacji z powodem — F4
}

export interface AuditContext {
  userId?: string;
  ip?: string;
  userAgent?: string;
}
