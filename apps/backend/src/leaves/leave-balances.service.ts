import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeavesService } from './leaves.service';

// @anchor leave-balance-years-back
/// Okno lat, z których można wybierać urlop: rok bieżący i 4 lata wstecz.
/// Nazwy kolumn w UI liczone są z tego okna, nie zapisane na sztywno.
export const LEAVE_BALANCE_YEARS_BACK = 4;

// @anchor leave-balance-year-dto
export interface LeaveBalanceYear {
  year: number;
  entitlementDays: number;
  usedDays: number;
  remainingDays: number;
}

// @anchor set-entitlement-dto
export interface SetEntitlementDto {
  userId: string;
  year: number;
  entitlementDays: number;
}

// @anchor leave-balances-service
@Injectable()
export class LeaveBalancesService {
  constructor(
    private prisma: PrismaService,
    private leaves: LeavesService,
  ) {}

  // @anchor leave-balance-window
  /// Lista lat okna salda, od najstarszego do bieżącego — np. [2022, 2023, 2024, 2025, 2026].
  static window(now: Date = new Date()): number[] {
    const current = now.getUTCFullYear();
    const years: number[] = [];
    for (let y = current - LEAVE_BALANCE_YEARS_BACK; y <= current; y++) years.push(y);
    return years;
  }

  // @anchor get-leave-balance
  /// Saldo pracownika w oknie lat — lata bez wiersza w bazie zwracane jako zera.
  async getBalance(subjectId: string): Promise<{ years: LeaveBalanceYear[]; totalRemaining: number }> {
    const years = LeaveBalancesService.window();
    const rows = await this.prisma.leaveBalance.findMany({
      where: { userId: subjectId, year: { in: years } },
    });
    const byYear = new Map(rows.map(r => [r.year, r]));

    const list = years.map(year => {
      const row = byYear.get(year);
      const entitlementDays = row?.entitlementDays ?? 0;
      const usedDays = row?.usedDays ?? 0;
      return {
        year,
        entitlementDays,
        usedDays,
        remainingDays: Math.max(0, Math.round((entitlementDays - usedDays) * 100) / 100),
      };
    });

    return {
      years: list,
      totalRemaining: Math.round(list.reduce((s, y) => s + y.remainingDays, 0) * 100) / 100,
    };
  }

  // @anchor read-leave-balance
  /// Odczyt salda z kontrolą dostępu: swoje zawsze, cudze tylko role z podglądem
  /// wszystkich (ADMIN, DAK) albo przełożony.
  async read(userId: string, roles: string[], targetUserId?: string) {
    const access = await this.leaves.resolveAccess(userId, roles);
    if (!access.enabled) throw new ForbiddenException('Moduł Urlopy niedostępny dla tego użytkownika.');

    let subjectId = userId;
    if (targetUserId && targetUserId !== userId) {
      const allowed = access.canViewAll || (await this.isSupervisorOf(userId, targetUserId));
      if (!allowed) throw new ForbiddenException('Brak uprawnień do salda tego pracownika.');
      subjectId = targetUserId;
    }
    return { userId: subjectId, canEdit: access.canEdit, ...(await this.getBalance(subjectId)) };
  }

  // @anchor set-leave-entitlement
  /// Ustawienie puli dni za dany rok — wyłącznie ADMIN.
  async setEntitlement(userId: string, roles: string[], dto: SetEntitlementDto) {
    const access = await this.leaves.resolveAccess(userId, roles);
    if (!access.canEdit) throw new ForbiddenException('Pulę dni urlopowych może ustawiać tylko administrator.');
    if (!dto?.userId) throw new BadRequestException('Brak pracownika.');

    const year = Number(dto.year);
    if (!LeaveBalancesService.window().includes(year)) {
      throw new BadRequestException('Rok poza oknem salda (rok bieżący i 4 lata wstecz).');
    }
    const days = Number(dto.entitlementDays);
    if (!isFinite(days) || days < 0) throw new BadRequestException('Liczba dni musi być nieujemna.');

    const existing = await this.prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: dto.userId, year } },
    });
    if (existing && days < existing.usedDays) {
      throw new BadRequestException(
        `Pula za ${year} nie może być mniejsza niż już wykorzystane ${existing.usedDays} dni.`,
      );
    }

    await this.prisma.leaveBalance.upsert({
      where: { userId_year: { userId: dto.userId, year } },
      create: { userId: dto.userId, year, entitlementDays: days },
      update: { entitlementDays: days },
    });
    return this.getBalance(dto.userId);
  }

  // @anchor assert-days-available
  /// Blokada z wymagania: bez dostępnych dni w puli nie da się złożyć wniosku.
  async assertDaysAvailable(subjectId: string, days: number): Promise<void> {
    const { totalRemaining } = await this.getBalance(subjectId);
    if (totalRemaining <= 0) {
      throw new BadRequestException('Brak dostępnych dni urlopu — wniosku nie można złożyć.');
    }
    if (days > totalRemaining) {
      throw new BadRequestException(
        `Wniosek na ${days} dni przekracza dostępne ${totalRemaining} dni urlopu.`,
      );
    }
  }

  // @anchor apply-leave-deductions
  /// Zatwierdzenie wniosku: dni schodzą z NAJSTARSZEGO dostępnego rocznika,
  /// nadwyżka przechodzi na kolejny rok. Rozbicie zapisywane w leave_deductions.
  async applyDeductions(tx: any, requestId: string, subjectId: string, days: number): Promise<void> {
    if (!(days > 0)) return;
    const years = LeaveBalancesService.window();
    const rows = await tx.leaveBalance.findMany({ where: { userId: subjectId, year: { in: years } } });
    const byYear = new Map(rows.map((r: any) => [r.year, r]));

    const available = years.reduce((sum, y) => {
      const r: any = byYear.get(y);
      return sum + Math.max(0, (r?.entitlementDays ?? 0) - (r?.usedDays ?? 0));
    }, 0);
    if (days > Math.round(available * 100) / 100) {
      throw new BadRequestException(
        `Brak wystarczającej puli dni — do wybrania ${Math.round(available * 100) / 100}, wniosek na ${days}.`,
      );
    }

    let left = days;
    for (const year of years) {
      if (left <= 0) break;
      const row: any = byYear.get(year);
      const remaining = Math.max(0, (row?.entitlementDays ?? 0) - (row?.usedDays ?? 0));
      if (remaining <= 0) continue;

      const take = Math.round(Math.min(remaining, left) * 100) / 100;
      left = Math.round((left - take) * 100) / 100;

      await tx.leaveBalance.upsert({
        where: { userId_year: { userId: subjectId, year } },
        create: { userId: subjectId, year, entitlementDays: row?.entitlementDays ?? 0, usedDays: take },
        update: { usedDays: { increment: take } },
      });
      await tx.leaveDeduction.create({ data: { leaveRequestId: requestId, year, days: take } });
    }
  }

  // @anchor revert-leave-deductions
  /// Cofnięcie zatwierdzenia: dni wracają dokładnie do roczników, z których zeszły.
  async revertDeductions(tx: any, requestId: string, subjectId: string): Promise<void> {
    const deductions = await tx.leaveDeduction.findMany({ where: { leaveRequestId: requestId } });
    for (const d of deductions) {
      await tx.leaveBalance.updateMany({
        where: { userId: subjectId, year: d.year },
        data: { usedDays: { decrement: d.days } },
      });
    }
    await tx.leaveDeduction.deleteMany({ where: { leaveRequestId: requestId } });
  }

  // @anchor balance-is-supervisor-of
  private async isSupervisorOf(supervisorId: string, employeeId: string): Promise<boolean> {
    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
      select: { supervisorId: true },
    });
    return employee?.supervisorId === supervisorId;
  }
}
