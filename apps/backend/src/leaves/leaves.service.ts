import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// @anchor leave-companies
/// Firmy, dla których moduł Urlopy jest dostępny.
export const LEAVE_COMPANIES = ['Airtel Services', 'Airtel Systems', 'LinkedTeam'];

// @anchor leave-view-all-roles
/// Role widzące w module Urlopy wszystkich pracowników. ADMIN — pełne uprawnienia,
/// DAK (dział administracyjno-księgowy) — wyłącznie podgląd (bez edycji i decyzji).
export const LEAVE_VIEW_ALL_ROLES = ['ADMIN', 'DAK'];

// @anchor leave-broadcast-trigger-roles
/// Role, ktorych zatwierdzony urlop jest informacja dla calego kierownictwa —
/// nieobecnosc logistyka albo managera trzeba obsadzic z wyprzedzeniem.
export const LEAVE_BROADCAST_TRIGGER_ROLES = ['LOGISTYK', 'MANAGER'];

// @anchor leave-manager-roles
/// Role odbierajace powiadomienie o zatwierdzonym urlopie osoby kluczowej.
/// Krag adresatow zawezaja dodatkowo firmy z LEAVE_COMPANIES.
export const LEAVE_MANAGER_ROLES = ['MANAGER'];

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

// @anchor calculate-work-experience-months
/// Staz pracy w miesiacach od podanego roku i miesiaca rozpoczecia pracy. Liczony
/// w runtime, wiec rosnie sam z kazdym miesiacem. Brak miesiaca => styczen.
export function calculateWorkExperienceMonths(
  workStartYear: number | null | undefined,
  workStartMonth?: number | null,
): number | null {
  if (workStartYear === null || workStartYear === undefined) return null;
  const year = Number(workStartYear);
  if (!Number.isInteger(year)) return null;
  const rawMonth = Number(workStartMonth);
  const month = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : 1;
  const now = new Date();
  const diff = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  return diff < 0 ? 0 : diff;
}

// @anchor calculate-work-experience-years
/// Staz pracy w latach (z dokladnoscia do miesiaca) — podstawa progu 10 lat z art. 154.
/// Brak roku rozpoczecia => fallback na recznie wpisany staz z bazy.
export function calculateWorkExperienceYears(
  workStartYear: number | null | undefined,
  workStartMonth?: number | null,
  fallbackYears: number | null | undefined = null,
): number | null {
  const months = calculateWorkExperienceMonths(workStartYear, workStartMonth);
  if (months === null) return fallbackYears ?? null;
  return Math.round((months / 12) * 100) / 100;
}

// @anchor leave-access-dto
export interface LeaveAccess {
  /// czy moduł Urlopy jest w ogóle dostępny dla usera
  enabled: boolean;
  /// czy user może edytować wpisy (tylko ADMIN)
  canEdit: boolean;
  // @anchor leave-access-can-view-all
  /// czy user widzi dane wszystkich pracowników (ADMIN i DAK) — sam podgląd,
  /// uprawnienia do edycji i decyzji nadal zależą od canEdit / bycia przełożonym
  canViewAll: boolean;
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

// @anchor monthly-breakdown-row-dto
/// Jeden urlop w raporcie dla DAK: dane pracownika, zakres i rozbicie dni na miesiace.
export interface MonthlyBreakdownRow {
  leaveId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  typeName: string;
  typeCode: string;
  dateFrom: string;
  dateTo: string;
  /// `daysCount` zapisany przy wpisie — zrodlo prawdy dla wyplaty
  daysCount: number;
  /// dni robocze (pn-pt) policzone z zakresu dat — do kontroli spojnosci
  workingDays: number;
  /// true = zapisany `daysCount` rozni sie od dni roboczych z zakresu (wpis reczny, urlop godzinowy)
  mismatch: boolean;
  note: string | null;
  /// { 'YYYY-MM': dni } — suma zawsze rowna `daysCount`
  months: Record<string, number>;
}

// @anchor monthly-breakdown-result-dto
export interface MonthlyBreakdownResult {
  /// pierwszy miesiac okna, format `YYYY-MM`
  from: string;
  /// ostatni miesiac okna wlacznie, format `YYYY-MM`
  to: string;
  /// wszystkie miesiace okna po kolei — naglowki kolumn tabeli
  months: string[];
  rows: MonthlyBreakdownRow[];
  /// suma dni w kazdym miesiacu okna
  totals: Record<string, number>;
}

// @anchor leaves-service
@Injectable()
export class LeavesService {
  constructor(private prisma: PrismaService) {}

  // @anchor resolve-leave-access
  async resolveAccess(userId: string, roles: string[]): Promise<LeaveAccess> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, company: true, subordinates: { select: { id: true } } },
    });
    const isAdmin = roles.includes('ADMIN');
    // DAK widzi wszystkich, ale nie edytuje wpisów ani nie rozpatruje wniosków —
    // dlatego osobna flaga zamiast scope 'ALL' (to ostatnie daje też prawo decyzji).
    const canViewAll = roles.some(r => LEAVE_VIEW_ALL_ROLES.includes(r));
    const company = user?.company ?? null;
    const companyAllowed = !!company && LEAVE_COMPANIES.includes(company);

    return {
      enabled: canViewAll || companyAllowed,
      canEdit: isAdmin,
      canViewAll,
      scope: isAdmin ? 'ALL' : (user?.subordinates?.length ? 'SUBORDINATES' : 'SELF'),
      company,
    };
  }

  // @anchor assert-leave-enabled
  private async assertEnabled(userId: string, roles: string[]): Promise<LeaveAccess> {
    const access = await this.resolveAccess(userId, roles);
    if (!access.enabled) throw new ForbiddenException('Nie masz dostępu do modułu Urlopy.');
    return access;
  }

  // @anchor visible-user-ids
  /// Zbiór userId, których wpisy urlopowe user może zobaczyć. null = wszyscy.
  private async visibleUserIds(userId: string, access: LeaveAccess): Promise<string[] | null> {
    if (access.scope === 'ALL' || access.canViewAll) return null;
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
    if (!access.canEdit) throw new ForbiddenException('Nie możesz dodawać wpisów urlopowych.');

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
    if (!access.canEdit) throw new ForbiddenException('Nie możesz edytować wpisów urlopowych.');

    const existing = await this.prisma.leave.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Nie ma takiego wpisu urlopowego.');

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
    if (!access.canEdit) throw new ForbiddenException('Nie możesz usuwać wpisów urlopowych.');
    return this.prisma.leave.delete({ where: { id } });
  }

  // @anchor month-key
  /// Klucz miesiaca `YYYY-MM` z daty UTC.
  private static monthKey(ms: number): string {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  // @anchor previous-month-key
  /// Domyslne okno raportu dla DAK: miesiac poprzedni, bo wyplaty licza sie wstecz.
  static previousMonthKey(now: Date = new Date()): string {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  // @anchor month-range
  /// Lista miesiecy `YYYY-MM` od `from` do `to` wlacznie.
  private static monthRange(from: string, to: string): string[] {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    const out: string[] = [];
    let y = fy;
    let m = fm;
    // twardy limit 120 miesiecy — bez niego blad w parametrach zapetla petle
    for (let guard = 0; guard < 120; guard++) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      if (y === ty && m === tm) break;
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }

  // @anchor split-days-into-months
  /// Rozbicie urlopu na miesiace. Podstawa sa dni robocze (pn-pt) w kazdym miesiacu,
  /// ale suma MUSI sie zgadzac z zapisanym `daysCount` — inaczej DAK dostalby inne
  /// liczby niz widnieja na wpisie. Gdy `daysCount` odbiega od dni roboczych
  /// (wpis reczny, urlop godzinowy), rozdzielamy go proporcjonalnie, a reszte
  /// z zaokraglen dopisujemy do ostatniego miesiaca.
  private static splitDaysIntoMonths(from: Date, to: Date, daysCount: number): {
    months: Record<string, number>;
    workingDays: number;
  } {
    const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    if (isNaN(start) || isNaN(end) || end < start) return { months: {}, workingDays: 0 };

    const perMonth: Record<string, number> = {};
    let workingDays = 0;
    for (let ms = start; ms <= end; ms += 86400000) {
      const dow = new Date(ms).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const key = LeavesService.monthKey(ms);
      perMonth[key] = (perMonth[key] || 0) + 1;
      workingDays++;
    }

    // urlop w calosci na weekendzie — bez dni roboczych rozbijamy po dniach kalendarzowych
    if (workingDays === 0) {
      for (let ms = start; ms <= end; ms += 86400000) {
        const key = LeavesService.monthKey(ms);
        perMonth[key] = (perMonth[key] || 0) + 1;
        workingDays++;
      }
    }

    const keys = Object.keys(perMonth);
    const months: Record<string, number> = {};
    let assigned = 0;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) {
        months[key] = Math.round((daysCount - assigned) * 100) / 100;
        return;
      }
      const share = Math.round((daysCount * perMonth[key] / workingDays) * 100) / 100;
      months[key] = share;
      assigned = Math.round((assigned + share) * 100) / 100;
    });

    return { months, workingDays };
  }

  // @anchor monthly-breakdown
  /// Raport dla DAK: kazdy urlop dotykajacy okna z rozpiska ile dni przypada na ktory miesiac.
  /// Widza go wylacznie role z LEAVE_VIEW_ALL_ROLES (ADMIN, DAK) — to dane placowe calej firmy.
  async monthlyBreakdown(
    userId: string,
    roles: string[],
    fromMonth?: string,
    toMonth?: string,
  ): Promise<MonthlyBreakdownResult> {
    const access = await this.assertEnabled(userId, roles);
    if (!access.canViewAll) {
      throw new ForbiddenException('Rozkład urlopów na miesiące jest dostępny dla administratora i DAK.');
    }

    const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
    const fallback = LeavesService.previousMonthKey();
    const from = monthPattern.test(fromMonth || '') ? (fromMonth as string) : fallback;
    const to = monthPattern.test(toMonth || '') ? (toMonth as string) : from;
    if (to < from) throw new BadRequestException('Miesiąc „do" jest wcześniejszy niż „od".');

    const months = LeavesService.monthRange(from, to);
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    const windowStart = new Date(Date.UTC(fy, fm - 1, 1));
    const windowEnd = new Date(Date.UTC(ty, tm, 0, 23, 59, 59));

    // urlop wchodzi do raportu, gdy zachodzi na okno choc jednym dniem
    const leaves = await this.prisma.leave.findMany({
      where: { dateFrom: { lte: windowEnd }, dateTo: { gte: windowStart } },
      include: {
        leaveType: { select: { name: true, code: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
      },
      orderBy: [{ dateFrom: 'asc' }],
    });

    const inWindow = new Set(months);
    const totals: Record<string, number> = {};
    months.forEach(m => { totals[m] = 0; });

    const rows: MonthlyBreakdownRow[] = leaves.map(l => {
      const { months: split, workingDays } = LeavesService.splitDaysIntoMonths(
        new Date(l.dateFrom),
        new Date(l.dateTo),
        l.daysCount,
      );
      // do tabeli trafiaja tylko miesiace z okna — czesc urlopu spoza okna zostaje pominieta
      const visible: Record<string, number> = {};
      for (const [key, value] of Object.entries(split)) {
        if (!inWindow.has(key) || !value) continue;
        visible[key] = value;
        totals[key] = Math.round((totals[key] + value) * 100) / 100;
      }
      return {
        leaveId: l.id,
        userId: l.user.id,
        firstName: l.user.firstName,
        lastName: l.user.lastName,
        email: l.user.email,
        company: l.user.company ?? null,
        typeName: l.leaveType.name,
        typeCode: l.leaveType.code,
        dateFrom: l.dateFrom.toISOString().slice(0, 10),
        dateTo: l.dateTo.toISOString().slice(0, 10),
        daysCount: l.daysCount,
        workingDays,
        mismatch: Math.abs(l.daysCount - workingDays) > 0.001,
        note: l.note ?? null,
        months: visible,
      };
    })
      // urlop moze zachodzic na okno, ale caly przypadac poza nim po odsianiu weekendow
      .filter(r => Object.keys(r.months).length > 0)
      .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'pl') || a.dateFrom.localeCompare(b.dateFrom));

    return { from, to, months, rows, totals };
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
