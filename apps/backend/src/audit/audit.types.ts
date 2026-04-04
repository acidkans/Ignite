
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  MOVE = 'MOVE', // specific for tree operations
}

export interface AuditContext {
  userId?: string;
  ip?: string;
  userAgent?: string;
}
