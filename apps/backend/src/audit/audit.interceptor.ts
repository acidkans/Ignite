import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AuditAction } from './audit.types';

export const AUDIT_KEY = 'audit';

export const Audit = (action: AuditAction, entity: string) =>
  Reflector.createDecorator<{ action: AuditAction; entity: string }>()({ action, entity });

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditMeta = this.reflector.get(Audit, context.getHandler());

    if (!auditMeta) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (response) => {
        // Assume response is the entity or contains ID.
        // For simpler MVP we try to extract ID.
        const id = response?.id;

        if (id) {
          // Simplified diff logging - in real world we would need 'before' state.
          // Here we just log the fact that it happened and potentially the payload.
          const req = context.switchToHttp().getRequest();
          const payload = this.sanitizePayload(req.body);

          await this.auditService.log(
            auditMeta.action,
            auditMeta.entity,
            id,
            payload // Saving the payload as simple diff
          );
        }
      }),
    );
  }

  private sanitizePayload(payload: any): any {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const sanitized = { ...payload };
    const sensitiveKeys = ['password', 'token', 'access_token', 'refresh_token', 'secret'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        sanitized[key] = '***MASKED***';
      } else if (typeof sanitized[key] === 'object') {
        // Recursive mask if needed, but for now simple level might suffice, or we can recurse.
        // Let's do simple recursion for safety.
        sanitized[key] = this.sanitizePayload(sanitized[key]);
      }
    }
    return sanitized;
  }
}
