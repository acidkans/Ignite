import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// @anchor leave-companies
/// Firmy, dla których moduł Urlopy jest dostępny.
export const LEAVE_COMPANIES = ['Airtel Services', 'Airtel Systems', 'LinkedTeam'];

// @anchor leave-entitlement-threshold-years
/// Prog stazu, od ktorego przysluguje 26 dni urlopu (Kodeks pracy art. 154).
export const LEAVE_ENTITLEMENT_THRESHOLD_YEARS = 10;

// @anchor leave-entitlement-days-below
/// Wymiar urlopu przy stazu krotszym niz 10 lat.
export const LEAVE_ENTITLEMENT_DAYS_BELOW = 20;

// @anchor leave-entitlement-days-above
/// Wymiar urlopu przy stazu co najmniej 10 lat.
export const LEAVE_ENTITLEMENT_DAYS_ABOVE = 26;

// @anchor calculate-leave-entitlement
/// Wymiar urlopu wypoczynkowego z ogolnego stazu pracy (Kodeks pracy art. 154 §1).
/// Brak podanego stazu => null, zeby UI nie pokazywal wyliczenia z powietrza.
/// Nie uwzglednia proporcji dla niepelnego etatu — wymaga osobnego pola z wymiarem etatu.
export function calculateLeaveEntitlement(years: number | null | undefined): number | null {
  if (years === null || years === undefined) return null;
  const value = Number(years);
  if (!isFinite(value) || value < 0) return null;
  return value >= LEAVE_ENTITLEMENT_THRESHOLD_YEARS
    ? LEAVE_ENTITLEMENT_DAYS_ABOVE
    : LEAVE_ENTITLEMENT_DAYS_BELOW;
}

// @anchor leave-access-dto
export interface LeaveAccess {
  /// czy moduł Urlopy jest w ogóle dostępny dla usera
  enabled: boolean;
  /// czy user może edytować wpisy (tylko ADMIN)
  canEdit: boolean;
  /// 'ALL' | 'SUBORDINATES' | 'SELF'
  scope: 'ALL' | 'SUBORDINATES' | 'SELF';
  company: string | null;
}

// @anchor create-leave-dto
export interface CreateLeaveDto {
  userId: string;
  leaveTypeId: string;
  dateFrom: string;
  dateTo: string;
  daysCount?: number;
  note?: string;
}

// @anchor update-leave-dto
export interface UpdateLeaveDto {
  userId?: string;
  leaveTypeId?: string;
  dateFrom?: string;
  dateTo?: string;
  daysCount?: number;
  note?: string;
}

// @anchor leaves-layout-entity-type
/// Klucz w `UserEntityConfig` pod ktorym trzymamy uklad kart zakladki „Moje dane".
export const LEAVES_LAYOUT_ENTITY = 'leaves-cards-layout';

// @anchor leaves-service
@Injectable()
export class LeavesService {
  constructor(private prisma: PrismaService) {}

  // @anchor get-leaves-layout
  /// Uklad kart zapisany per uzytkownik — wspolny dla kazdej przegladarki.
  async getLayout(userId: string) {
    const row = await this.prisma.userEntityConfig.findUnique({
      where: { userId_entityType: { userId, entityType: LEAVES_LAYOUT_ENTITY } },
    });
    return row?.config ?? null;
  }

  // @anchor save-leaves-layout
  async saveLayout(userId: string, config: any) {
    const row = await this.prisma.userEntityConfig.upsert({
      where: { userId_entityType: { userId, entityType: LEAVES_LAYOUT_ENTITY } },
      create: { userId, entityType: LEAVES_LAYOUT_ENTITY, config: config ?? {} },
      update: { config: config ?? {} },
    });
    return row.config;
  }

  // @anchor resolve-leave-access
  async resolveAccess(userId: string, roles: string[]): Promise<LeaveAccess> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, company: true, subordinates: { select: { id: true } } },
    });
    const isAdmin = roles.includes('ADMIN');
    const company = user?.company ?? null;
    const companyAllowed = !!company && LEAVE_COMPANIES.includes(company);

    return {
      enabled: isAdmin || companyAllowed,
      canEdit: isAdmin,
      scope: isAdmin ? 'ALL' : (user?.subordinates?.length ? 'SUBORDINATES' : 'SELF'),
      company,
    };
  }

  // @anchor assert-leave-enabled
  private async assertEnabled(userId: string, roles: string[]): Promise<LeaveAccess> {
    const access = await this.resolveAccess(userId, roles);
    if (!access.enabled) throw new ForbiddenException('Moduł Urlopy niedostępny dla tego użytkownika.');
    return access;
  }

  // @anchor visible-user-ids
  /// Zbiór userId, których wpisy urlopowe user może zobaczyć. null = wszyscy.
  private async visibleUserIds(userId: string, access: LeaveAccess): Promise<string[] | null> {
    if (access.scope === 'ALL') return null;
    if (access.scope === 'SELF') return [userId];
    const subs = await this.prisma.user.findMany({
      where: { supervisorId: userId },
      select: { id: true },
    });
    return [userId, ...subs.map(s => s.id)];
  }

  // @anchor list-leave-types
  async listTypes() {
    return this.prisma.leaveType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  // @anchor list-leaves
  async list(userId: string, roles: string[], leaveTypeId?: string) {
    const access = await this.assertEnabled(userId, roles);
    const ids = await this.visibleUserIds(userId, access);

    return this.prisma.leave.findMany({
      where: {
        ...(leaveTypeId ? { leaveTypeId } : {}),
        ...(ids ? { userId: { in: ids } } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
        leaveType: { select: { id: true, code: true, name: true, color: true } },
      },
      orderBy: [{ dateFrom: 'desc' }],
    });
  }

  // @anchor list-leave-employees
  /// Lista pracowników, dla których user może zakładać / oglądać wpisy (do selecta w UI).
  async listEmployees(userId: string, roles: string[]) {
    const access = await this.assertEnabled(userId, roles);
    const ids = await this.visibleUserIds(userId, access);
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        // sam pytający zawsze na liście — inaczej ADMIN bez firmy z LEAVE_COMPANIES
        // nie mógłby wskazać samego siebie w zakładce „Moje dane"
        ...(ids ? { id: { in: ids } } : { OR: [{ company: { in: LEAVE_COMPANIES } }, { id: userId }] }),
      },
      select: { id: true, firstName: true, lastName: true, email: true, company: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  // @anchor create-leave
  async create(userId: string, roles: string[], dto: CreateLeaveDto) {
    const access = await this.assertEnabled(userId, roles);
    if (!access.canEdit) throw new ForbiddenException('Brak uprawnień do dodawania wpisów urlopowych.');

    return this.prisma.leave.create({
      data: {
        userId: dto.userId,
        leaveTypeId: dto.leaveTypeId,
        dateFrom: new Date(dto.dateFrom),
        dateTo: new Date(dto.dateTo),
        daysCount: dto.daysCount ?? this.workingDaysBetween(new Date(dto.dateFrom), new Date(dto.dateTo)),
        note: dto.note ?? null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
        leaveType: { select: { id: true, code: true, name: true, color: true } },
      },
    });
  }

  // @anchor update-leave
  async update(userId: string, roles: string[], id: string, dto: UpdateLeaveDto) {
    const access = await this.assertEnabled(userId, roles);
    if (!access.canEdit) throw new ForbiddenException('Brak uprawnień do edycji wpisów urlopowych.');

    const existing = await this.prisma.leave.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Wpis urlopowy nie istnieje.');

    const data: any = {};
    if (dto.userId !== undefined) data.userId = dto.userId;
    if (dto.leaveTypeId !== undefined) data.leaveTypeId = dto.leaveTypeId;
    if (dto.dateFrom !== undefined) data.dateFrom = new Date(dto.dateFrom);
    if (dto.dateTo !== undefined) data.dateTo = new Date(dto.dateTo);
    if (dto.daysCount !== undefined) data.daysCount = dto.daysCount;
    if (dto.note !== undefined) data.note = dto.note;

    return this.prisma.leave.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
        leaveType: { select: { id: true, code: true, name: true, color: true } },
      },
    });
  }

  // @anchor remove-leave
  async remove(userId: string, roles: string[], id: string) {
    const access = await this.assertEnabled(userId, roles);
    if (!access.canEdit) throw new ForbiddenException('Brak uprawnień do usuwania wpisów urlopowych.');
    return this.prisma.leave.delete({ where: { id } });
  }

  // @anchor working-days-between
  /// Liczba dni roboczych (pn–pt) w zakresie włącznie — domyślna wartość daysCount.
  private workingDaysBetween(from: Date, to: Date): number {
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return 1;
    let days = 0;
    const cursor = new Date(from.getTime());
    while (cursor <= to) {
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6) days++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days || 1;
  }
}
