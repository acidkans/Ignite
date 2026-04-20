import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { AuditAction } from './audit.types';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  async log(
    action: AuditAction,
    entity: string,
    entityId: string,
    diff?: any,
  ) {
    const userId = this.cls.get('user.id');
    // In automated tasks/system actions userId might be null.

    console.log(`[AUDIT] ${action} on ${entity}:${entityId} by User:${userId || 'SYSTEM'}`);

    await this.prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        diff: diff || Prisma.JsonNull,
        userId: userId || null,
      },
    });
  }
}
