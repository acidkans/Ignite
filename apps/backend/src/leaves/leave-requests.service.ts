import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  LeavesService,
  LEAVE_COMPANIES,
  LEAVE_BROADCAST_TRIGGER_ROLES,
  LEAVE_MANAGER_ROLES,
} from './leaves.service';
import { LeaveBalancesService } from './leave-balances.service';
import { MailService, OverlappingAbsence } from '../mail/mail.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { HolidaysService } from './holidays.service';
import { LeaveDecisionTokenService } from './leave-decision-token.service';

// @anchor create-leave-request-dto
export interface CreateLeaveRequestDto {
  userId?: string; // tylko ADMIN / przełożony może wskazać innego usera
  leaveTypeId?: string | null; // rodzaj_urlopu — FK do słownika leave_types
  daysCount?: number; // dni_urlopu
  dependentId?: string | null; // podopieczny — wymagany dla rodzaju OPIEKA
  holidayDayOffId?: string | null; // swieto w sobote — wymagane dla rodzaju ZA_SWIETO_SOB
  dateStart: string;
  timeStart?: string;
  dateEnd: string;
  timeEnd?: string;
  officeFrom?: string;
  officeTo?: string;
  comment?: string;
}

// @anchor update-leave-request-dto
export interface UpdateLeaveRequestDto extends Partial<CreateLeaveRequestDto> {
  submittedAt?: string | null;
}

// @anchor decide-leave-request-dto
export interface DecideLeaveRequestDto {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decisionComment?: string | null;
}

// @anchor request-withdrawal-dto
export interface RequestWithdrawalDto {
  /// powod wycofania — nieobowiazkowy, trafia do maila przelozonego
  reason?: string | null;
}

// @anchor decide-withdrawal-dto
export interface DecideWithdrawalDto {
  /// true = przelozony potwierdza wycofanie, false = urlop zostaje w mocy
  confirmed: boolean;
}

const REQUEST_INCLUDE = {
  user: {
    select: { id: true, firstName: true, lastName: true, email: true, company: true, supervisorId: true },
  },
  leaveType: { select: { id: true, code: true, name: true, color: true, consumesBalance: true } },
  dependent: { select: { id: true, firstName: true, lastName: true, birthDate: true } },
  holidayDayOff: { select: { id: true, date: true, name: true } },
  decidedBy: { select: { id: true, firstName: true, lastName: true } },
  withdrawalDecidedBy: { select: { id: true, firstName: true, lastName: true } },
};

// @anchor care-leave-code
/// Kod rodzaju urlopu wymagajacego wskazania podopiecznego.
export const CARE_LEAVE_CODE = 'OPIEKA';

// @anchor leave-comment-min-length
/// Minimalna dlugosc uzasadnienia — kilka slow, zeby "x" albo "." nie przeszlo za przyczyne.
export const LEAVE_COMMENT_MIN_LENGTH = 20;

// @anchor leave-types-requiring-comment
/// Rodzaje urlopu, dla ktorych ustawa wymaga uzasadnienia we wniosku.
/// OPIEKA — art. 173(1) par. 5 KP: wniosek wskazuje przyczyne koniecznosci zapewnienia
/// osobistej opieki lub wsparcia oraz stopien pokrewienstwa (albo adres zamieszkania osoby
/// spoza rodziny). Imie i nazwisko podopiecznego niesie osobne pole `dependentId`.
/// Pozostale rodzaje sprawdzone i swiadomie bez wymogu: WYPOCZYNKOWY (art. 152 — bez
/// uzasadnienia), NA_ZADANIE (art. 167(2) — bez uzasadnienia), BEZPLATNY (art. 174 —
/// wniosek pisemny, ustawa nie zada przyczyny), ZA_SWIETO_SOB (art. 130 par. 2 — dzien
/// oddawany z rozkladu), L4 (zwolnienie lekarskie, nie wniosek pracownika).
export const LEAVE_TYPES_REQUIRING_COMMENT: string[] = [CARE_LEAVE_CODE];

// @anchor care-leave-comment-hint
/// Tresc podpowiedzi i komunikatu bledu — jedno zrodlo dla backendu i tekstu w modalu.
export const CARE_LEAVE_COMMENT_HINT =
  'Urlop opiekunczy wymaga uzasadnienia: przyczyna koniecznosci zapewnienia osobistej opieki ' +
  'lub wsparcia oraz stopien pokrewienstwa z pracownikiem (dla osoby spoza rodziny — adres zamieszkania).';

// @anchor hourly-leave-codes
/// Rodzaje urlopu, ktore prawo pozwala dzielic na godziny — zrodlo wartosci startowej
/// kolumny `LeaveType.allowsHourly` (migracja 20260823130000). Zrodlem prawdy w runtime
/// jest kolumna w bazie, ta lista dokumentuje podstawe prawna kazdego rodzaju:
///   WYPOCZYNKOWY  — art. 154(2) par. 4 KP: urlop w wymiarze godzinowym odpowiadajacym
///                   czesci dobowego wymiaru czasu pracy (gdy reszta puli < pelny dzien). GODZINOWY.
///   NA_ZADANIE    — art. 167(2) KP: czesc urlopu wypoczynkowego, ale udzielana na dzien;
///                   pracownik nie zada czesci dnia (stanowisko PIP). PELNODNIOWY.
///   OPIEKA        — art. 173(1) par. 3 KP: „udziela sie w dni, ktore sa dla pracownika
///                   dniami pracy". PELNODNIOWY.
///   BEZPLATNY     — art. 174 KP: udzielany w dniach, ustawa nie przewiduje godzin. PELNODNIOWY.
///   ZA_SWIETO_SOB — art. 130 par. 2 KP: za swieto w sobote nalezy sie caly dzien wolny. PELNODNIOWY.
///   L4            — zwolnienie lekarskie w dniach kalendarzowych, nie wniosek. PELNODNIOWY.
export const HOURLY_LEAVE_CODES: string[] = ['WYPOCZYNKOWY'];

// @anchor leave-requests-service
@Injectable()
export class LeaveRequestsService {
  constructor(
    private prisma: PrismaService,
    private leaves: LeavesService,
    private balances: LeaveBalancesService,
    private mail: MailService,
    private config: ConfigService,
    private holidays: HolidaysService,
    private decisionTokens: LeaveDecisionTokenService,
    private googleCalendar: GoogleCalendarService,
  ) {}

  // @anchor list-own-leave-requests
  /// Zakładka „Wnioski": ADMIN widzi wnioski wszystkich, pozostali wyłącznie swoje.
  async listOwn(userId: string, roles: string[]) {
    const access = await this.assertEnabled(userId, roles);
    return this.prisma.leaveRequest.findMany({
      where: access.scope === 'ALL' ? {} : { userId },
      include: REQUEST_INCLUDE,
      orderBy: [{ dateStart: 'desc' }],
    });
  }

  // @anchor list-subordinate-leave-requests
  /// Wnioski podwładnych (zakładka „Wnioski moich podwładnych"); ADMIN widzi wszystkie cudze.
  async listSubordinates(userId: string, roles: string[]) {
    const access = await this.assertEnabled(userId, roles);
    const where =
      access.scope === 'ALL'
        ? { userId: { not: userId } }
        : { user: { supervisorId: userId } };

    return this.prisma.leaveRequest.findMany({
      where,
      include: REQUEST_INCLUDE,
      orderBy: [{ dateStart: 'desc' }],
    });
  }

  // @anchor create-leave-request
  async create(userId: string, roles: string[], dto: CreateLeaveRequestDto) {
    const access = await this.assertEnabled(userId, roles);
    const targetUserId = dto.userId && dto.userId !== userId ? dto.userId : userId;

    if (targetUserId !== userId) {
      // wniosek za kogoś innego — tylko ADMIN albo bezpośredni przełożony
      if (!access.canEdit && !(await this.isSupervisorOf(userId, targetUserId))) {
        throw new ForbiddenException('Możesz składać wnioski tylko za siebie.');
      }
    }

    this.assertRequestFieldsValid(dto.leaveTypeId, dto.dateStart, dto.dateEnd);
    await this.assertDependentValid(targetUserId, dto.leaveTypeId, dto.dependentId);
    await this.assertCommentValid(dto.leaveTypeId, dto.comment);
    await this.assertHoursValid(dto.leaveTypeId, dto.timeStart, dto.timeEnd);
    await this.assertHolidayDayOffValid(targetUserId, dto.leaveTypeId, dto.holidayDayOffId);

    const daysCount =
      dto.daysCount ?? LeaveRequestsService.workingDaysBetween(new Date(dto.dateStart), new Date(dto.dateEnd));

    // wymaganie: bez dostępnych dni w puli nie da się złożyć wniosku o urlop konsumujący saldo
    if (await this.consumesBalance(dto.leaveTypeId)) {
      await this.balances.assertDaysAvailable(targetUserId, daysCount);
    }

    await this.assertSaturdayHolidayDaysAvailable(targetUserId, dto.leaveTypeId, dto.dateStart, daysCount);
    await this.assertStatutoryLimit(targetUserId, dto.leaveTypeId, dto.dateStart, daysCount);
    await this.assertNoSelfOverlap(targetUserId, dto.dateStart, dto.dateEnd);

    const created = await this.prisma.leaveRequest.create({
      data: {
        userId: targetUserId,
        leaveTypeId: dto.leaveTypeId || null,
        dependentId: dto.dependentId || null,
        holidayDayOffId: dto.holidayDayOffId || null,
        daysCount,
        dateStart: new Date(dto.dateStart),
        dateEnd: new Date(dto.dateEnd),
        timeStart: dto.timeStart ?? null,
        timeEnd: dto.timeEnd ?? null,
        officeFrom: dto.officeFrom ? new Date(dto.officeFrom) : null,
        officeTo: dto.officeTo ? new Date(dto.officeTo) : null,
        comment: dto.comment ?? null,
        submittedAt: new Date(),
        // migawka salda z chwili złożenia — do wydruku formularza
        ...(await this.balanceSnapshot(targetUserId)),
      },
      include: REQUEST_INCLUDE,
    });

    await this.notifySupervisor(created);
    return created;
  }

  // @anchor list-holiday-days-for-request
  /// Lista swiat w sobote do wyboru we wniosku ZA_SWIETO_SOB — zatwierdzone przez
  /// administratora, z oznaczeniem dni juz odebranych przez tego pracownika.
  async holidayDaysForRequest(
    userId: string,
    roles: string[],
    targetUserId?: string,
    year?: number,
    excludeRequestId?: string,
  ) {
    const access = await this.assertEnabled(userId, roles);
    let subjectId = userId;
    if (targetUserId && targetUserId !== userId) {
      if (access.scope === 'ALL' || (await this.isSupervisorOf(userId, targetUserId))) {
        subjectId = targetUserId;
      } else {
        throw new ForbiddenException('Brak uprawnień do danych tego pracownika.');
      }
    }
    return this.holidays.listApprovedForUser(subjectId, year || new Date().getFullYear(), excludeRequestId);
  }

  // @anchor leave-type-usage
  /// Zużycie dni w roku dla każdego rodzaju urlopu: ile wybrano (wnioski PENDING + APPROVED)
  /// i ile zostało. Limit zależy od rodzaju: pula `LeaveBalance` (wypoczynkowy i na żądanie),
  /// `LeaveType.maxDaysPerYear` (limit ustawowy) albo zatwierdzone `HolidayDayOff`.
  async typeUsage(userId: string, roles: string[], targetUserId?: string, year?: number) {
    const access = await this.assertEnabled(userId, roles);
    let subjectId = userId;
    if (targetUserId && targetUserId !== userId) {
      if (access.scope === 'ALL' || (await this.isSupervisorOf(userId, targetUserId))) {
        subjectId = targetUserId;
      } else {
        throw new ForbiddenException('Brak uprawnień do danych tego pracownika.');
      }
    }

    const y = year || new Date().getFullYear();
    const yearStart = new Date(Date.UTC(y, 0, 1));
    const yearEnd = new Date(Date.UTC(y, 11, 31, 23, 59, 59));

    const [types, requests, balance, holidayDays] = await Promise.all([
      this.prisma.leaveType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          userId: subjectId,
          status: { in: ['PENDING', 'APPROVED'] },
          dateStart: { gte: yearStart, lte: yearEnd },
        },
        select: { leaveTypeId: true, daysCount: true, status: true },
      }),
      this.balances.getBalance(subjectId),
      this.holidays.approvedDaysCount(y),
    ]);

    return {
      year: y,
      userId: subjectId,
      items: types.map(t => {
        const mine = requests.filter(r => r.leaveTypeId === t.id);
        const used = mine.reduce((s, r) => s + (r.daysCount || 0), 0);
        const pending = mine
          .filter(r => r.status === 'PENDING')
          .reduce((s, r) => s + (r.daysCount || 0), 0);

        let limit: number | null = t.maxDaysPerYear ?? null;
        let source: string | null = limit ? 'limit ustawowy' : null;

        if (t.code === LeaveRequestsService.SATURDAY_HOLIDAY_CODE) {
          limit = holidayDays;
          source = 'dni wolne za święta w sobotę';
        } else if (t.consumesBalance && !t.maxDaysPerYear) {
          // wypoczynkowy — pula z zaległymi latami, więc „zostało" bierzemy wprost z salda
          limit = (balance.totalRemaining ?? 0) + used;
          source = 'pula dni urlopowych';
        }

        return {
          leaveTypeId: t.id,
          code: t.code,
          name: t.name,
          color: t.color,
          used,
          pending,
          limit,
          remaining: limit === null ? null : Math.max(0, limit - used),
          source,
        };
      }),
    };
  }

  // @anchor leave-request-balance-snapshot
  /// Saldo z chwili złożenia przepisane na pola remaining* (najstarszy rok → remainingY4).
  private async balanceSnapshot(subjectId: string) {
    const { years } = await this.balances.getBalance(subjectId);
    const [y4, y3, y2, y1, current] = years.map(y => y.remainingDays);
    return {
      remainingY4: y4 ?? 0,
      remainingY3: y3 ?? 0,
      remainingY2: y2 ?? 0,
      remainingY1: y1 ?? 0,
      remainingCurrentYear: current ?? 0,
    };
  }

  // @anchor saturday-holiday-leave-code
  /// Rodzaj urlopu odbieranego za święto wypadające w sobotę.
  private static readonly SATURDAY_HOLIDAY_CODE = 'ZA_SWIETO_SOB';

  // @anchor assert-saturday-holiday-days
  /// Wniosek „Do wyboru za święto w sobotę" wolno złożyć tylko do wysokości dni
  /// zatwierdzonych przez administratora na dany rok, pomniejszonych o już wybrane.
  private async assertSaturdayHolidayDaysAvailable(
    userId: string,
    leaveTypeId: string | null | undefined,
    dateStart: string,
    daysCount: number,
  ): Promise<void> {
    if (!leaveTypeId) return;
    const type = await this.prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { code: true },
    });
    if (type?.code !== LeaveRequestsService.SATURDAY_HOLIDAY_CODE) return;

    const year = Number(LeaveRequestsService.warsawDayKey(new Date(dateStart)).slice(0, 4));
    const entitlement = await this.holidays.approvedDaysCount(year);
    if (!entitlement) {
      throw new BadRequestException(
        `Na ${year} rok administrator nie zatwierdził jeszcze dni wolnych za święta wypadające w sobotę.`,
      );
    }

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const taken = await this.prisma.leaveRequest.findMany({
      where: {
        userId,
        leaveTypeId,
        status: { in: ['PENDING', 'APPROVED'] },
        dateStart: { gte: yearStart, lte: yearEnd },
      },
      select: { daysCount: true },
    });
    const used = taken.reduce((s, r) => s + (r.daysCount || 0), 0);

    if (used + daysCount > entitlement) {
      throw new BadRequestException(
        `Za święta w sobotę przysługuje w ${year} roku ${entitlement} dni, wykorzystano lub złożono wnioski na ${used}.`,
      );
    }
  }

  // @anchor assert-no-self-overlap
  /// Ten sam pracownik nie moze miec dwoch nieobecnosci w tym samym terminie.
  /// Kolizja liczy sie wzgledem wnioskow PENDING i APPROVED — nierozpatrzony wniosek
  /// tez blokuje, bo inaczej dwa rownolegle wnioski przeszlyby oba.
  /// Warunek nakladania: nowy start <= istniejacy koniec ORAZ nowy koniec >= istniejacy start.
  private async assertNoSelfOverlap(
    userId: string,
    dateStart: string | Date,
    dateEnd: string | Date,
    excludeRequestId?: string,
  ): Promise<void> {
    const start = dateStart instanceof Date ? dateStart : new Date(dateStart);
    const end = dateEnd instanceof Date ? dateEnd : new Date(dateEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const clash = await this.prisma.leaveRequest.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'APPROVED'] },
        dateStart: { lte: end },
        dateEnd: { gte: start },
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      },
      orderBy: { dateStart: 'asc' },
      include: { leaveType: { select: { name: true } } },
    });
    if (!clash) return;

    const okres = `${LeaveRequestsService.warsawDayKey(clash.dateStart)} — ${LeaveRequestsService.warsawDayKey(clash.dateEnd)}`;
    const rodzaj = clash.leaveType?.name ? `„${clash.leaveType.name}"` : 'nieobecność';
    const stan = clash.status === 'APPROVED' ? 'zatwierdzony' : 'nierozpatrzony';
    throw new BadRequestException(
      `Termin nachodzi na inny wniosek tego pracownika: ${rodzaj} ${okres} (${stan}). ` +
        'Skoryguj daty albo wycofaj tamten wniosek.',
    );
  }

  // @anchor assert-statutory-limit
  /// Ustawowy limit dni w roku kalendarzowym z `LeaveType.maxDaysPerYear`
  /// (na żądanie 4, opiekuńczy 5). Liczymy wnioski PENDING i APPROVED z tego samego roku.
  private async assertStatutoryLimit(
    userId: string,
    leaveTypeId: string | null | undefined,
    dateStart: string,
    daysCount: number,
  ): Promise<void> {
    if (!leaveTypeId) return;
    const type = await this.prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { name: true, maxDaysPerYear: true },
    });
    const limit = type?.maxDaysPerYear;
    if (!limit) return;

    const year = Number(LeaveRequestsService.warsawDayKey(new Date(dateStart)).slice(0, 4));
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const taken = await this.prisma.leaveRequest.findMany({
      where: {
        userId,
        leaveTypeId,
        status: { in: ['PENDING', 'APPROVED'] },
        dateStart: { gte: yearStart, lte: yearEnd },
      },
      select: { daysCount: true },
    });
    const used = taken.reduce((s, r) => s + (r.daysCount || 0), 0);

    if (used + daysCount > limit) {
      throw new BadRequestException(
        `Limit ustawowy: „${type.name}" to ${limit} dni w ${year} roku, wykorzystano lub złożono wnioski na ${used}.`,
      );
    }
  }

  // @anchor leave-type-consumes-balance-check
  private async consumesBalance(leaveTypeId?: string | null): Promise<boolean> {
    if (!leaveTypeId) return false;
    const type = await this.prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { consumesBalance: true },
    });
    return !!type?.consumesBalance;
  }

  // @anchor find-overlapping-absences
  /// Kto jeszcze bedzie nieobecny w terminie wniosku — po to, zeby przelozony
  /// decydowal widzac obsade, a nie na slepo. Zakres: wszystkie firmy z LEAVE_COMPANIES
  /// (Airtel Systems, Airtel Services, LinkedTeam dzialaja jako jedna grupa),
  /// wnioski PENDING i APPROVED, bez biezacego wniosku.
  /// Wnioskodawcy NIE wycinamy: jego wlasna nieobecnosc w tym terminie to najwazniejsza
  /// kolizja, jaka moze byc — nowe wnioski blokuje assertNoSelfOverlap, ale dane historyczne
  /// takie pary maja i przelozony musi je zobaczyc, a nie zgadywac.
  /// Warunek nakladania sie okresow: start <= cudzy koniec ORAZ koniec >= cudzy start.
  private async findOverlappingAbsences(request: any): Promise<OverlappingAbsence[]> {
    try {
      const rows = await this.prisma.leaveRequest.findMany({
        where: {
          id: { not: request.id },
          status: { in: ['PENDING', 'APPROVED'] },
          dateStart: { lte: request.dateEnd },
          dateEnd: { gte: request.dateStart },
          user: { isActive: true, company: { in: LEAVE_COMPANIES } },
        },
        orderBy: { dateStart: 'asc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
          leaveType: { select: { name: true } },
        },
      });
      return rows
        .map(r => ({
          name: [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ') || r.user?.email || '',
          company: r.user?.company ?? null,
          leaveTypeName: r.leaveType?.name ?? null,
          dateStart: r.dateStart,
          dateEnd: r.dateEnd,
          pending: r.status === 'PENDING',
          self: r.userId === request.userId,
        }))
        // kolizja z wlasna nieobecnoscia wnioskodawcy na gorze listy
        .sort((a, b) => Number(b.self) - Number(a.self));
    } catch {
      // zestawienie jest dodatkiem do maila — jego brak nie moze wstrzymac powiadomienia
      return [];
    }
  }

  // @anchor notify-supervisor-leave-request
  /// Mail do przełożonego wnioskodawcy. Brak SMTP / brak przełożonego nie wywraca zapisu wniosku.
  private async notifySupervisor(request: any): Promise<void> {
    try {
      const applicant = await this.prisma.user.findUnique({
        where: { id: request.userId },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          supervisor: { select: { id: true, email: true } },
        },
      });
      const supervisorId = applicant?.supervisor?.id;
      if (!supervisorId) return;
      const to = applicant?.supervisor?.email;
      if (!to) return;

      const baseUrl = this.config.get('FRONTEND_URL') || 'http://localhost:5174';
      const appUrl = `${baseUrl}/urlopy`;
      // @anchor leave-decision-link-urls
      // Przyciski w mailu — token imienny dla przelozonego, akcja wpisana w podpis.
      const decisionUrl = (decision: 'APPROVED' | 'REJECTED') =>
        `${baseUrl}/api/leave-requests/decision-link?token=${encodeURIComponent(
          this.decisionTokens.issue({
            requestId: request.id,
            deciderId: supervisorId!,
            deciderEmail: to,
            decision,
          }),
        )}`;

      await this.mail.sendLeaveRequest({
        to,
        approveUrl: decisionUrl('APPROVED'),
        rejectUrl: decisionUrl('REJECTED'),
        overlapping: await this.findOverlappingAbsences(request),
        applicantName:
          [applicant?.firstName, applicant?.lastName].filter(Boolean).join(' ') || applicant?.email || 'Pracownik',
        leaveTypeName: request.leaveType?.name ?? null,
        dateStart: request.dateStart,
        dateEnd: request.dateEnd,
        comment: request.comment,
        appUrl,
      });
    } catch {
      /* powiadomienie jest best-effort — wniosek jest już zapisany */
    }
  }

  // @anchor update-leave-request
  async update(userId: string, roles: string[], id: string, dto: UpdateLeaveRequestDto) {
    const access = await this.assertEnabled(userId, roles);
    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: { select: { supervisorId: true } } },
    });
    if (!existing) throw new NotFoundException('Wniosek nie istnieje.');

    const isOwner = existing.userId === userId;
    const isSupervisor = existing.user?.supervisorId === userId;

    if (!access.canEdit && !isSupervisor) {
      if (!isOwner) throw new ForbiddenException('Brak uprawnień do edycji tego wniosku.');
      if (existing.status !== 'PENDING') {
        throw new ForbiddenException('Rozpatrzonego wniosku nie można już edytować.');
      }
    }
    // zmiana treści zatwierdzonego wniosku rozjechałaby odjęte dni z pulą
    if (existing.status === 'APPROVED') {
      throw new BadRequestException('Cofnij zatwierdzenie, zanim zmienisz treść wniosku.');
    }

    if (dto.leaveTypeId !== undefined && !dto.leaveTypeId) {
      throw new BadRequestException('Rodzaj urlopu jest wymagany.');
    }
    if ((dto.dateStart !== undefined && !dto.dateStart) || (dto.dateEnd !== undefined && !dto.dateEnd)) {
      throw new BadRequestException('Data od i data do sa wymagane.');
    }
    {
      const from = new Date(dto.dateStart ?? existing.dateStart);
      const to = new Date(dto.dateEnd ?? existing.dateEnd);
      if (to < from) throw new BadRequestException('Data do nie moze byc wczesniejsza niz data od.');
    }

    if (dto.leaveTypeId !== undefined || dto.dependentId !== undefined) {
      await this.assertDependentValid(
        dto.userId ?? existing.userId,
        dto.leaveTypeId !== undefined ? dto.leaveTypeId : existing.leaveTypeId,
        dto.dependentId !== undefined ? dto.dependentId : existing.dependentId,
      );
    }

    // zmiana rodzaju albo komentarza nie moze zostawic wniosku bez wymaganego uzasadnienia
    if (dto.leaveTypeId !== undefined || dto.comment !== undefined) {
      await this.assertCommentValid(
        dto.leaveTypeId !== undefined ? dto.leaveTypeId : existing.leaveTypeId,
        dto.comment !== undefined ? dto.comment : existing.comment,
      );
    }

    if (dto.leaveTypeId !== undefined || dto.timeStart !== undefined || dto.timeEnd !== undefined) {
      await this.assertHoursValid(
        dto.leaveTypeId !== undefined ? dto.leaveTypeId : existing.leaveTypeId,
        dto.timeStart !== undefined ? dto.timeStart : existing.timeStart,
        dto.timeEnd !== undefined ? dto.timeEnd : existing.timeEnd,
      );
    }

    if (dto.leaveTypeId !== undefined || dto.holidayDayOffId !== undefined) {
      await this.assertHolidayDayOffValid(
        dto.userId ?? existing.userId,
        dto.leaveTypeId !== undefined ? dto.leaveTypeId : existing.leaveTypeId,
        dto.holidayDayOffId !== undefined ? dto.holidayDayOffId : existing.holidayDayOffId,
        id,
      );
    }

    const data: any = {};
    if (dto.holidayDayOffId !== undefined) data.holidayDayOffId = dto.holidayDayOffId || null;
    if (dto.dependentId !== undefined) data.dependentId = dto.dependentId || null;
    if (dto.leaveTypeId !== undefined) data.leaveTypeId = dto.leaveTypeId || null;
    if (dto.daysCount !== undefined) data.daysCount = dto.daysCount;
    if (dto.dateStart !== undefined) data.dateStart = new Date(dto.dateStart);
    if (dto.dateEnd !== undefined) data.dateEnd = new Date(dto.dateEnd);
    // zmiana dat bez jawnego daysCount — liczba dni przeliczana z nowego zakresu
    if (dto.daysCount === undefined && (dto.dateStart !== undefined || dto.dateEnd !== undefined)) {
      data.daysCount = LeaveRequestsService.workingDaysBetween(
        data.dateStart ?? existing.dateStart,
        data.dateEnd ?? existing.dateEnd,
      );
    }
    if (dto.timeStart !== undefined) data.timeStart = dto.timeStart || null;
    if (dto.timeEnd !== undefined) data.timeEnd = dto.timeEnd || null;
    if (dto.officeFrom !== undefined) data.officeFrom = dto.officeFrom ? new Date(dto.officeFrom) : null;
    if (dto.officeTo !== undefined) data.officeTo = dto.officeTo ? new Date(dto.officeTo) : null;
    if (dto.comment !== undefined) data.comment = dto.comment || null;
    if (dto.submittedAt !== undefined) data.submittedAt = dto.submittedAt ? new Date(dto.submittedAt) : null;

    // po zmianie zakresu / rodzaju sprawdzamy pulę ponownie
    // zmiana terminu tez nie moze wejsc w inny wniosek tego samego pracownika
    if (data.dateStart !== undefined || data.dateEnd !== undefined) {
      await this.assertNoSelfOverlap(
        existing.userId,
        data.dateStart ?? existing.dateStart,
        data.dateEnd ?? existing.dateEnd,
        id,
      );
    }

    const newTypeId = dto.leaveTypeId !== undefined ? dto.leaveTypeId : existing.leaveTypeId;
    const newDays = data.daysCount ?? existing.daysCount;
    if ((data.daysCount !== undefined || dto.leaveTypeId !== undefined) && (await this.consumesBalance(newTypeId))) {
      await this.balances.assertDaysAvailable(existing.userId, newDays);
    }

    const updated = await this.prisma.leaveRequest.update({ where: { id }, data, include: REQUEST_INCLUDE });
    // edycja zatwierdzonego wniosku (np. przesuniecie terminu) musi przestawic zdarzenie w kalendarzu
    if (updated.status === 'APPROVED') await this.syncGoogleCalendar(updated);
    return updated;
  }

  // @anchor decide-leave-request
  /// Decyzja przełożonego: zatwierdzenie odejmuje dni od najstarszego dostępnego rocznika,
  /// odrzucenie / cofnięcie decyzji oddaje je z powrotem.
  async decide(userId: string, roles: string[], id: string, dto: DecideLeaveRequestDto) {
    const access = await this.assertEnabled(userId, roles);
    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: { select: { supervisorId: true } },
        leaveType: { select: { consumesBalance: true } },
      },
    });
    if (!existing) throw new NotFoundException('Wniosek nie istnieje.');

    const isSupervisor = existing.user?.supervisorId === userId;
    if (!access.canEdit && !isSupervisor) {
      throw new ForbiddenException('Wnioski rozpatruje przełożony albo administrator.');
    }

    const status = dto?.status;
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('Nieprawidłowy status wniosku.');
    }
    if (status === existing.status) {
      return this.prisma.leaveRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async tx => {
      // wyjście ze stanu APPROVED zawsze najpierw oddaje dni do puli
      if (existing.status === 'APPROVED') {
        await this.balances.revertDeductions(tx, id, existing.userId);
      }
      if (status === 'APPROVED' && existing.leaveType?.consumesBalance) {
        await this.balances.applyDeductions(tx, id, existing.userId, existing.daysCount || 0);
      }

      // @anchor sync-leave-from-request
      /// Zatwierdzony wniosek zakłada wpis urlopowy — to on zasila tabelę „Moje urlopy"
      /// i liczniki wykorzystanych dni. Wyjście ze stanu APPROVED kasuje ten wpis.
      if (status === 'APPROVED') {
        if (existing.leaveTypeId) {
          await tx.leave.upsert({
            where: { leaveRequestId: id },
            create: {
              userId: existing.userId,
              leaveTypeId: existing.leaveTypeId,
              dateFrom: existing.dateStart,
              dateTo: existing.dateEnd,
              daysCount: existing.daysCount || 0,
              note: existing.comment || null,
              leaveRequestId: id,
            },
            update: {
              leaveTypeId: existing.leaveTypeId,
              dateFrom: existing.dateStart,
              dateTo: existing.dateEnd,
              daysCount: existing.daysCount || 0,
              note: existing.comment || null,
            },
          });
        }
      } else {
        await tx.leave.deleteMany({ where: { leaveRequestId: id } });
      }

      return tx.leaveRequest.update({
        where: { id },
        data: {
          status: status as any,
          approvedAt: status === 'APPROVED' ? now : null,
          rejectedAt: status === 'REJECTED' ? now : null,
          decidedById: status === 'PENDING' ? null : userId,
          decisionComment: status === 'PENDING' ? null : dto.decisionComment || null,
        },
        include: REQUEST_INCLUDE,
      });
    });

    // Kalendarz i maile sa skutkiem ubocznym decyzji — poza transakcja i best-effort,
    // zeby awaria Google/SMTP nie cofala zapisanego rozstrzygniecia.
    await this.syncGoogleCalendar(updated);
    // cofnięcie decyzji nie jest rozstrzygnięciem — wnioskodawcy nie zawiadamiamy
    if (status !== 'PENDING') await this.notifyApplicant(updated, status === 'APPROVED');
    if (status === 'APPROVED') await this.notifyManagers(updated);
    return updated;
  }

  // @anchor decide-by-token
  /// Decyzja z przycisku w mailu — bez logowania, tozsamosc bierze sie z podpisu tokenu.
  /// Zwraca opis wyniku dla strony potwierdzenia; nie rzuca wyjatkow na bledny token,
  /// zeby przelozony dostal czytelny komunikat zamiast surowego 401.
  async decideByToken(token: string | undefined): Promise<{
    ok: boolean;
    title: string;
    message: string;
    applicantName?: string;
    period?: string;
  }> {
    const payload = this.decisionTokens.verify(token);
    // token wycofania ma wlasny endpoint — tu go nie przyjmujemy, zeby jeden podpis
    // nie dzialal na dwie rozne akcje
    if (!payload || (payload.kind && payload.kind !== 'DECISION')) {
      return {
        ok: false,
        title: 'Link nieważny',
        message: 'Link wygasł albo jest nieprawidłowy. Otwórz moduł Urlopy i rozpatrz wniosek w aplikacji.',
      };
    }

    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id: payload.requestId },
      include: REQUEST_INCLUDE,
    });
    if (!existing) {
      return { ok: false, title: 'Wniosek nie istnieje', message: 'Wniosek został w międzyczasie usunięty.' };
    }

    const applicantName =
      [existing.user?.firstName, existing.user?.lastName].filter(Boolean).join(' ') || existing.user?.email || '';
    const period = `${existing.dateStart.toISOString().slice(0, 10)} — ${existing.dateEnd.toISOString().slice(0, 10)}`;

    // link dziala tylko na wniosku nierozpatrzonym — to jest jego jednorazowosc
    if (existing.status !== 'PENDING') {
      const label = existing.status === 'APPROVED' ? 'zatwierdzony' : 'odrzucony';
      return {
        ok: false,
        title: 'Wniosek już rozpatrzony',
        message: `Ten wniosek został wcześniej ${label}. Nic nie zmieniono.`,
        applicantName,
        period,
      };
    }

    // @anchor decision-token-identity-check
    // Trzy warunki naraz, sprawdzane na biezaco (nie na stanie z chwili wyslania maila):
    //  1. konto decydenta istnieje,
    //  2. adres wpisany w podpis tokenu to nadal adres tego konta,
    //  3. to konto jest nadal przelozonym wnioskodawcy.
    // Zmiana adresu albo przelozonego uniewaznia wszystkie wczesniej wyslane linki.
    const decider = await this.prisma.user.findUnique({
      where: { id: payload.deciderId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    const denied = {
      ok: false,
      title: 'Brak uprawnień',
      message: 'Ten link nie należy już do przełożonego tego pracownika. Rozpatrz wniosek w aplikacji.',
      applicantName,
      period,
    };
    if (!decider) return denied;

    const norm = (v: string | null | undefined) => (v || '').trim().toLowerCase();
    if (!norm(decider.email) || norm(decider.email) !== norm(payload.deciderEmail)) return denied;

    const applicant = await this.prisma.user.findUnique({
      where: { id: existing.userId },
      select: { supervisorId: true },
    });
    if (applicant?.supervisorId !== decider.id) return denied;

    const roles = decider.userRoles.map(r => r.role.name);

    try {
      await this.decide(decider.id, roles, existing.id, { status: payload.decision });
    } catch (err: any) {
      return {
        ok: false,
        title: 'Nie udało się zapisać decyzji',
        message: err?.message || 'Spróbuj rozpatrzyć wniosek w aplikacji.',
        applicantName,
        period,
      };
    }

    return {
      ok: true,
      title: payload.decision === 'APPROVED' ? 'Wniosek zatwierdzony' : 'Wniosek odrzucony',
      message:
        payload.decision === 'APPROVED'
          ? 'Dni zostały odjęte z puli pracownika, a wpis urlopowy trafił do kalendarza.'
          : 'Wniosek został odrzucony, pula dni pracownika pozostaje bez zmian.',
      applicantName,
      period,
    };
  }

  // @anchor sync-google-calendar-leave
  /// Zatwierdzony wniosek trafia do wspolnego kalendarza Google, cofniety albo odrzucony
  /// znika z niego. Id zdarzenia zapisujemy przy wniosku, zeby kolejna zmiana terminu
  /// aktualizowala to samo zdarzenie zamiast mnozyc duplikaty.
  private async syncGoogleCalendar(request: any): Promise<void> {
    if (!this.googleCalendar.isEnabled()) return;
    try {
      if (request.status !== 'APPROVED') {
        if (!request.googleEventId) return;
        await this.googleCalendar.deleteLeaveEvent(request.googleEventId, request.id);
        await this.prisma.leaveRequest.update({ where: { id: request.id }, data: { googleEventId: null } });
        return;
      }

      const name =
        [request.user?.firstName, request.user?.lastName].filter(Boolean).join(' ') || request.user?.email || 'Pracownik';
      const typeName = request.leaveType?.name || 'Urlop';
      const eventId = await this.googleCalendar.upsertLeaveEvent({
        leaveRequestId: request.id,
        googleEventId: request.googleEventId,
        summary: `${name} — ${typeName}`,
        description: [
          request.user?.company ? `Firma: ${request.user.company}` : null,
          request.daysCount ? `Dni: ${request.daysCount}` : null,
          request.comment ? `Komentarz: ${request.comment}` : null,
          'Wpis wygenerowany z modułu Urlopy — nie edytuj ręcznie.',
        ]
          .filter(Boolean)
          .join('\n'),
        dateStart: request.dateStart,
        dateEnd: request.dateEnd,
      });
      if (eventId && eventId !== request.googleEventId) {
        await this.prisma.leaveRequest.update({ where: { id: request.id }, data: { googleEventId: eventId } });
      }
    } catch {
      /* kalendarz jest best-effort — decyzja jest juz zapisana */
    }
  }

  // @anchor notify-managers-leave-approved
  /// Zatwierdzony urlop logistyka albo managera idzie do wiadomosci pozostalych managerow
  /// w Airtel Systems, Airtel Services i LinkedTeam — ich nieobecnosc trzeba obsadzic.
  /// Wnioskodawca i osoba podejmujaca decyzje sa z listy wylaczeni: oboje juz wiedza.
  private async notifyManagers(request: any): Promise<void> {
    try {
      const applicant = await this.prisma.user.findUnique({
        where: { id: request.userId },
        select: { userRoles: { select: { role: { select: { name: true } } } } },
      });
      const applicantRoles = (applicant?.userRoles || []).map(r => r.role.name);
      if (!applicantRoles.some(r => LEAVE_BROADCAST_TRIGGER_ROLES.includes(r))) return;

      const excluded = [request.userId, request.decidedById].filter(Boolean) as string[];
      const managers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          id: { notIn: excluded },
          company: { in: LEAVE_COMPANIES },
          userRoles: { some: { role: { name: { in: LEAVE_MANAGER_ROLES } } } },
        },
        select: { email: true },
      });
      const recipients = managers.map(m => m.email).filter(e => !!e && e.includes('@'));
      if (!recipients.length) return;

      const appUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:5174'}/urlopy`;
      await this.mail.sendLeaveApprovalBroadcast({
        recipients,
        employeeName:
          [request.user?.firstName, request.user?.lastName].filter(Boolean).join(' ') || request.user?.email || 'Pracownik',
        employeeCompany: request.user?.company ?? null,
        // etykieta roli w mailu — pierwsza z rol, ktore wyzwolily powiadomienie
        employeeRoleLabel: applicantRoles.find(r => LEAVE_BROADCAST_TRIGGER_ROLES.includes(r)) || null,
        deciderName: request.decidedBy
          ? [request.decidedBy.firstName, request.decidedBy.lastName].filter(Boolean).join(' ') || null
          : null,
        leaveTypeName: request.leaveType?.name ?? null,
        dateStart: request.dateStart,
        dateEnd: request.dateEnd,
        daysCount: request.daysCount ?? null,
        appUrl,
        overlapping: await this.findOverlappingAbsences(request),
      });
    } catch {
      /* powiadomienie jest best-effort — decyzja jest juz zapisana */
    }
  }

  // @anchor notify-applicant-leave-decision
  /// Mail do wnioskodawcy o decyzji przełożonego. Best-effort — błąd SMTP nie cofa decyzji.
  private async notifyApplicant(request: any, approved: boolean): Promise<void> {
    try {
      const to = request.user?.email;
      if (!to) return;

      const appUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:5174'}/urlopy`;
      await this.mail.sendLeaveDecision({
        to,
        applicantName:
          [request.user?.firstName, request.user?.lastName].filter(Boolean).join(' ') || to,
        deciderName: request.decidedBy
          ? [request.decidedBy.firstName, request.decidedBy.lastName].filter(Boolean).join(' ') || null
          : null,
        approved,
        leaveTypeName: request.leaveType?.name ?? null,
        dateStart: request.dateStart,
        dateEnd: request.dateEnd,
        decisionComment: request.decisionComment,
        appUrl,
      });
    } catch {
      /* powiadomienie jest best-effort — decyzja jest już zapisana */
    }
  }

  // @anchor request-leave-withdrawal
  /// Prosba pracownika o wycofanie ZATWIERDZONEGO urlopu. Sama prosba niczego nie cofa —
  /// wniosek zostaje APPROVED, dni dalej sa odjete, wpis w kalendarzu zostaje.
  /// Dopiero potwierdzenie przelozonego (`decideWithdrawal`) faktycznie kasuje urlop.
  async requestWithdrawal(userId: string, roles: string[], id: string, dto?: RequestWithdrawalDto) {
    await this.assertEnabled(userId, roles);
    const existing = await this.prisma.leaveRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
    if (!existing) throw new NotFoundException('Wniosek nie istnieje.');
    if (existing.userId !== userId) {
      throw new ForbiddenException('O wycofanie urlopu prosi sam pracownik.');
    }
    if (existing.status !== 'APPROVED') {
      throw new BadRequestException('Wycofać można tylko zatwierdzony urlop. Nierozpatrzony wniosek usuń.');
    }
    if (existing.withdrawalRequestedAt) {
      throw new BadRequestException('Prośba o wycofanie tego urlopu już czeka na decyzję przełożonego.');
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { withdrawalRequestedAt: new Date(), withdrawalDecidedAt: null, withdrawalDecidedById: null },
      include: REQUEST_INCLUDE,
    });
    await this.notifySupervisorWithdrawalRequest(updated, dto?.reason ?? null);
    return updated;
  }

  // @anchor decide-leave-withdrawal
  /// Decyzja przelozonego o prosbie o wycofanie. Potwierdzenie przechodzi ta sama sciezka
  /// co wyjscie ze stanu APPROVED: dni wracaja do puli, wpis urlopowy znika, zdarzenie
  /// w kalendarzu jest kasowane. Odmowa tylko czysci prosbe — urlop zostaje w mocy.
  async decideWithdrawal(userId: string, roles: string[], id: string, dto: DecideWithdrawalDto) {
    const access = await this.assertEnabled(userId, roles);
    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: { select: { supervisorId: true } } },
    });
    if (!existing) throw new NotFoundException('Wniosek nie istnieje.');

    const isSupervisor = existing.user?.supervisorId === userId;
    if (!access.canEdit && !isSupervisor) {
      throw new ForbiddenException('Wycofanie urlopu potwierdza przełożony albo administrator.');
    }
    if (!existing.withdrawalRequestedAt) {
      throw new BadRequestException('Ten urlop nie ma prośby o wycofanie.');
    }
    if (existing.status !== 'APPROVED') {
      throw new BadRequestException('Urlop nie jest już zatwierdzony — nie ma czego wycofywać.');
    }

    const confirmed = !!dto?.confirmed;
    const now = new Date();
    const updated = await this.prisma.$transaction(async tx => {
      if (confirmed) {
        // ta sama kolejnosc co przy cofnieciu decyzji: najpierw dni wracaja do puli
        await this.balances.revertDeductions(tx, id, existing.userId);
        await tx.leave.deleteMany({ where: { leaveRequestId: id } });
      }
      return tx.leaveRequest.update({
        where: { id },
        data: confirmed
          ? {
              status: 'WITHDRAWN' as any,
              withdrawalDecidedAt: now,
              withdrawalDecidedById: userId,
              approvedAt: null,
            }
          : { withdrawalRequestedAt: null, withdrawalDecidedAt: now, withdrawalDecidedById: userId },
        include: REQUEST_INCLUDE,
      });
    });

    // status inny niz APPROVED — syncGoogleCalendar sam skasuje zdarzenie i wyczysci googleEventId
    if (confirmed) await this.syncGoogleCalendar(updated);
    await this.notifyApplicantWithdrawalDecision(updated, confirmed);
    return updated;
  }

  // @anchor withdraw-by-token
  /// Decyzja o wycofaniu z przycisku w mailu — bez logowania, tozsamosc z podpisu tokenu.
  /// Zwraca opis wyniku dla strony potwierdzenia; nie rzuca wyjatkow na bledny token.
  async withdrawByToken(token: string | undefined): Promise<{
    ok: boolean;
    title: string;
    message: string;
    applicantName?: string;
    period?: string;
  }> {
    const payload = this.decisionTokens.verify(token);
    if (!payload || payload.kind !== 'WITHDRAWAL') {
      return {
        ok: false,
        title: 'Link nieważny',
        message: 'Link wygasł albo jest nieprawidłowy. Otwórz moduł Urlopy i rozpatrz prośbę w aplikacji.',
      };
    }

    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id: payload.requestId },
      include: REQUEST_INCLUDE,
    });
    if (!existing) {
      return { ok: false, title: 'Wniosek nie istnieje', message: 'Wniosek został w międzyczasie usunięty.' };
    }

    const applicantName =
      [existing.user?.firstName, existing.user?.lastName].filter(Boolean).join(' ') || existing.user?.email || '';
    const period = `${LeaveRequestsService.warsawDayKey(existing.dateStart)} — ${LeaveRequestsService.warsawDayKey(existing.dateEnd)}`;

    if (!existing.withdrawalRequestedAt || existing.status !== 'APPROVED') {
      return {
        ok: false,
        title: 'Prośba już rozpatrzona',
        message:
          existing.status === 'WITHDRAWN'
            ? 'Ten urlop został już wycofany. Nic nie zmieniono.'
            : 'Ta prośba o wycofanie została już rozpatrzona albo urlop nie jest zatwierdzony. Nic nie zmieniono.',
        applicantName,
        period,
      };
    }

    // te same trzy warunki tozsamosci co przy decyzji o wniosku
    const decider = await this.prisma.user.findUnique({
      where: { id: payload.deciderId },
      select: {
        id: true,
        email: true,
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    const denied = {
      ok: false,
      title: 'Brak uprawnień',
      message: 'Ten link nie należy już do przełożonego tego pracownika. Rozpatrz prośbę w aplikacji.',
      applicantName,
      period,
    };
    if (!decider) return denied;
    const norm = (v: string | null | undefined) => (v || '').trim().toLowerCase();
    if (!norm(decider.email) || norm(decider.email) !== norm(payload.deciderEmail)) return denied;
    const applicant = await this.prisma.user.findUnique({
      where: { id: existing.userId },
      select: { supervisorId: true },
    });
    if (applicant?.supervisorId !== decider.id) return denied;

    const roles = decider.userRoles.map(r => r.role.name);
    const confirmed = payload.decision === 'APPROVED';
    try {
      await this.decideWithdrawal(decider.id, roles, existing.id, { confirmed });
    } catch (err: any) {
      return {
        ok: false,
        title: 'Nie udało się zapisać decyzji',
        message: err?.message || 'Spróbuj rozpatrzyć prośbę w aplikacji.',
        applicantName,
        period,
      };
    }

    return {
      ok: true,
      title: confirmed ? 'Urlop wycofany' : 'Urlop zostaje w mocy',
      message: confirmed
        ? 'Dni wróciły do puli pracownika, wpis urlopowy i zdarzenie w kalendarzu zostały skasowane.'
        : 'Prośba została odrzucona — urlop obowiązuje bez zmian.',
      applicantName,
      period,
    };
  }

  // @anchor notify-supervisor-withdrawal-request
  /// Mail do przelozonego z przyciskiem nazywajacym akcje i pracownika wprost.
  private async notifySupervisorWithdrawalRequest(request: any, reason: string | null): Promise<void> {
    try {
      const supervisorId = request.user?.supervisorId;
      if (!supervisorId) return;
      const supervisor = await this.prisma.user.findUnique({
        where: { id: supervisorId },
        select: { email: true },
      });
      const to = supervisor?.email;
      if (!to) return;

      const baseUrl = this.config.get('FRONTEND_URL') || 'http://localhost:5174';
      // @anchor leave-withdrawal-link-urls
      const withdrawalUrl = (decision: 'APPROVED' | 'REJECTED') =>
        `${baseUrl}/api/leave-requests/withdrawal-link?token=${encodeURIComponent(
          this.decisionTokens.issue({
            requestId: request.id,
            deciderId: supervisorId,
            deciderEmail: to,
            decision,
            kind: 'WITHDRAWAL',
          }),
        )}`;

      await this.mail.sendLeaveWithdrawalRequest({
        to,
        applicantName:
          [request.user?.firstName, request.user?.lastName].filter(Boolean).join(' ') ||
          request.user?.email ||
          'Pracownik',
        leaveTypeName: request.leaveType?.name ?? null,
        dateStart: request.dateStart,
        dateEnd: request.dateEnd,
        daysCount: request.daysCount ?? null,
        reason,
        appUrl: `${baseUrl}/urlopy`,
        confirmUrl: withdrawalUrl('APPROVED'),
        rejectUrl: withdrawalUrl('REJECTED'),
      });
    } catch {
      /* powiadomienie jest best-effort — prosba jest juz zapisana */
    }
  }

  // @anchor notify-applicant-withdrawal-decision
  private async notifyApplicantWithdrawalDecision(request: any, confirmed: boolean): Promise<void> {
    try {
      const to = request.user?.email;
      if (!to) return;
      await this.mail.sendLeaveWithdrawalDecision({
        to,
        applicantName: [request.user?.firstName, request.user?.lastName].filter(Boolean).join(' ') || to,
        deciderName: request.withdrawalDecidedBy
          ? [request.withdrawalDecidedBy.firstName, request.withdrawalDecidedBy.lastName].filter(Boolean).join(' ') || null
          : null,
        confirmed,
        leaveTypeName: request.leaveType?.name ?? null,
        dateStart: request.dateStart,
        dateEnd: request.dateEnd,
        appUrl: `${this.config.get('FRONTEND_URL') || 'http://localhost:5174'}/urlopy`,
      });
    } catch {
      /* powiadomienie jest best-effort — decyzja jest juz zapisana */
    }
  }

  // @anchor remove-leave-request
  async remove(userId: string, roles: string[], id: string) {
    const access = await this.assertEnabled(userId, roles);
    const existing = await this.prisma.leaveRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
    if (!existing) throw new NotFoundException('Wniosek nie istnieje.');

    const isOwner = existing.userId === userId;
    if (!access.canEdit && !(isOwner && existing.status === 'PENDING')) {
      throw new ForbiddenException('Brak uprawnień do usunięcia tego wniosku.');
    }
    const removed = await this.prisma.$transaction(async tx => {
      // usunięcie zatwierdzonego wniosku musi oddać dni do puli — kaskada sama tego nie zrobi
      if (existing.status === 'APPROVED') {
        await this.balances.revertDeductions(tx, id, existing.userId);
      }
      return tx.leaveRequest.delete({ where: { id } });
    });
    // wniosku juz nie ma w bazie, wiec zdarzenie w kalendarzu tez musi zniknac
    if (existing.googleEventId || existing.status === 'APPROVED') {
      await this.googleCalendar.deleteLeaveEvent(existing.googleEventId, id).catch(() => undefined);
    }
    // kasujacy sam siebie nie zawiadamia — wie, co zrobil przed chwila;
    // w druga strone o wycofaniu dowiaduje sie przelozony, bo ma w mailu martwe juz przyciski decyzji
    if (isOwner) await this.notifySupervisorWithdrawn(existing);
    else await this.notifyApplicantDeleted(existing, userId);
    return removed;
  }

  // @anchor notify-applicant-request-deleted
  /// Mail do wnioskodawcy o usunieciu jego wniosku przez administratora albo przelozonego.
  /// Usuniecie nie zostawia sladu w module — bez maila pracownik zobaczylby tylko, ze
  /// wniosek zniknal. Best-effort: blad SMTP nie cofa usuniecia, ktore juz sie stalo.
  private async notifyApplicantDeleted(request: any, deletedById: string): Promise<void> {
    try {
      const to = request.user?.email;
      if (!to) return;

      const deleter = await this.prisma.user.findUnique({
        where: { id: deletedById },
        select: { firstName: true, lastName: true, email: true },
      });
      const appUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:5174'}/urlopy`;
      await this.mail.sendLeaveRequestDeleted({
        to,
        applicantName: [request.user?.firstName, request.user?.lastName].filter(Boolean).join(' ') || to,
        deletedByName:
          [deleter?.firstName, deleter?.lastName].filter(Boolean).join(' ') || deleter?.email || null,
        leaveTypeName: request.leaveType?.name ?? null,
        dateStart: request.dateStart,
        dateEnd: request.dateEnd,
        wasApproved: request.status === 'APPROVED',
        appUrl,
      });
    } catch {
      /* powiadomienie jest best-effort — wniosek jest juz usuniety */
    }
  }

  // @anchor notify-supervisor-request-withdrawn
  /// Mail do przelozonego, gdy pracownik sam wycofal swoj wniosek. Bez tego przelozony
  /// zostaje z mailem, ktorego przyciski Zatwierdz / Odrzuc prowadza donikad.
  /// Best-effort: blad SMTP nie cofa usuniecia, ktore juz sie stalo.
  private async notifySupervisorWithdrawn(request: any): Promise<void> {
    try {
      const supervisorId = request.user?.supervisorId;
      if (!supervisorId) return;
      const supervisor = await this.prisma.user.findUnique({
        where: { id: supervisorId },
        select: { email: true },
      });
      const to = supervisor?.email;
      if (!to) return;

      const appUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:5174'}/urlopy`;
      await this.mail.sendLeaveRequestWithdrawn({
        to,
        applicantName:
          [request.user?.firstName, request.user?.lastName].filter(Boolean).join(' ') ||
          request.user?.email ||
          'Pracownik',
        leaveTypeName: request.leaveType?.name ?? null,
        dateStart: request.dateStart,
        dateEnd: request.dateEnd,
        wasApproved: request.status === 'APPROVED',
        appUrl,
      });
    } catch {
      /* powiadomienie jest best-effort — wniosek jest juz usuniety */
    }
  }

  // @anchor leave-dashboard-summary
  /// Dane zakładki Dashboard — saldo dni, wnioski oczekujące, urlopy wg rodzaju w bieżącym roku.
  async dashboard(userId: string, roles: string[], targetUserId?: string) {
    const access = await this.assertEnabled(userId, roles);
    // podgląd innego pracownika — role z LEAVE_VIEW_ALL_ROLES (ADMIN, DAK) albo jego przełożony
    let subjectId = userId;
    if (targetUserId && targetUserId !== userId) {
      if (access.canViewAll || (await this.isSupervisorOf(userId, targetUserId))) {
        subjectId = targetUserId;
      } else {
        throw new ForbiddenException('Brak uprawnień do danych tego pracownika.');
      }
    }
    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const yearEnd = new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31, 23, 59, 59));

    // saldo — pula dni z LeaveBalance (rok bieżący i 4 lata wstecz)
    const balance = await this.balances.getBalance(subjectId);

    const myLeaves = await this.prisma.leave.findMany({
      where: { userId: subjectId, dateFrom: { gte: yearStart, lte: yearEnd } },
      include: { leaveType: { select: { id: true, name: true, color: true } } },
    });

    const byType = new Map<string, { name: string; color: string; days: number; count: number }>();
    for (const l of myLeaves) {
      const key = l.leaveType.id;
      const entry = byType.get(key) || { name: l.leaveType.name, color: l.leaveType.color, days: 0, count: 0 };
      entry.days += l.daysCount || 0;
      entry.count += 1;
      byType.set(key, entry);
    }

    const pendingOwn = await this.prisma.leaveRequest.count({
      where: { userId: subjectId, status: 'PENDING' },
    });

    // wnioski wybranego pracownika — tabela w panelu Dashboard
    const subjectRequests = await this.prisma.leaveRequest.findMany({
      where: { userId: subjectId },
      include: REQUEST_INCLUDE,
      orderBy: [{ dateStart: 'desc' }],
      take: 100,
    });

    const subject = await this.prisma.user.findUnique({
      where: { id: subjectId },
      select: {
        id: true, firstName: true, lastName: true, email: true, company: true,
        supervisor: { select: { id: true, firstName: true, lastName: true } },
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });

    const pendingSubordinates = await this.prisma.leaveRequest.count({
      where: access.scope === 'ALL'
        ? { userId: { not: userId }, status: 'PENDING' }
        : { user: { supervisorId: userId }, status: 'PENDING' },
    });

    // czy oglądający może rozpatrywać wnioski wyświetlanego pracownika —
    // DAK ma sam podgląd (canViewAll bez canEdit), więc decyzji nie dostaje
    const canDecideSubject =
      access.canEdit || (subjectId !== userId && (await this.isSupervisorOf(userId, subjectId)));

    return {
      subject: subject
        ? {
            ...subject,
            roles: subject.userRoles.map(r => r.role.name),
            supervisorName: subject.supervisor
              ? `${subject.supervisor.firstName || ''} ${subject.supervisor.lastName || ''}`.trim()
              : null,
          }
        : null,
      requests: subjectRequests,
      balance: {
        // lata liczone dynamicznie względem roku bieżącego — front tylko renderuje tę listę
        years: balance.years,
        totalRemaining: balance.totalRemaining,
        source: 'pula dni urlopowych',
      },
      canDecideSubject,
      currentYear: {
        year: yearStart.getUTCFullYear(),
        totalDays: myLeaves.reduce((s, l) => s + (l.daysCount || 0), 0),
        byType: Array.from(byType.values()),
      },
      pendingOwn,
      pendingSubordinates,
      scope: access.scope,
    };
  }

  // @anchor warsaw-day-key
  /// Dzien kalendarzowy wg strefy Europe/Warsaw ('YYYY-MM-DD').
  /// Klient wysyla ISO w UTC (11.08 00:00 lokalnie = 10.08 22:00Z), wiec liczenie po UTC
  /// przesunęłoby zakres o dobę.
  private static warsawDayKey(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Warsaw',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  // @anchor working-days-between-requests
  /// Dni urlopu we wniosku: dni kalendarzowe od poczatku do konca wlacznie,
  /// z pominieciem sobot i niedziel.
  static workingDaysBetween(from: Date, to: Date): number {
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return 0;
    const [fy, fm, fd] = LeaveRequestsService.warsawDayKey(from).split('-').map(Number);
    const [ty, tm, td] = LeaveRequestsService.warsawDayKey(to).split('-').map(Number);
    const start = Date.UTC(fy, fm - 1, fd);
    const end = Date.UTC(ty, tm - 1, td);
    if (end < start) return 0;

    let days = 0;
    for (let ms = start; ms <= end; ms += 86400000) {
      const dow = new Date(ms).getUTCDay(); // 0 = niedziela, 6 = sobota
      if (dow !== 0 && dow !== 6) days++;
    }
    return days;
  }

  // @anchor assert-request-fields-valid
  /// Rodzaj urlopu i obie daty sa obowiazkowe; zakres musi byc chronologiczny.
  private assertRequestFieldsValid(leaveTypeId?: string | null, dateStart?: string, dateEnd?: string): void {
    if (!leaveTypeId) throw new BadRequestException('Rodzaj urlopu jest wymagany.');
    if (!dateStart || !dateEnd) throw new BadRequestException('Data od i data do sa wymagane.');
    const from = new Date(dateStart);
    const to = new Date(dateEnd);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new BadRequestException('Nieprawidlowy format daty.');
    if (to < from) throw new BadRequestException('Data do nie moze byc wczesniejsza niz data od.');
  }

  // @anchor assert-dependent-valid
  /// Dla rodzaju OPIEKA wniosek musi wskazywac podopiecznego, i to podopiecznego wnioskodawcy.
  private async assertDependentValid(
    applicantId: string,
    leaveTypeId: string | null | undefined,
    dependentId: string | null | undefined,
  ): Promise<void> {
    const type = leaveTypeId
      ? await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId }, select: { code: true } })
      : null;
    const isCareLeave = type?.code === CARE_LEAVE_CODE;

    if (isCareLeave && !dependentId) {
      throw new BadRequestException('Urlop opiekunczy wymaga wskazania podopiecznego.');
    }
    if (!dependentId) return;

    const dependent = await this.prisma.dependent.findUnique({
      where: { id: dependentId },
      select: { userId: true },
    });
    if (!dependent) throw new BadRequestException('Wskazany podopieczny nie istnieje.');
    if (dependent.userId !== applicantId) {
      throw new BadRequestException('Wskazany podopieczny nie nalezy do tego pracownika.');
    }
  }

  // @anchor assert-holiday-day-off-valid
  /// Wniosek „Do wyboru za swieto w sobote" musi wskazywac konkretne swieto z listy
  /// zatwierdzonej przez administratora, i to swieto jeszcze przez tego pracownika nieodebrane.
  /// Dla pozostalych rodzajow powiazanie jest zawsze puste.
  private async assertHolidayDayOffValid(
    applicantId: string,
    leaveTypeId: string | null | undefined,
    holidayDayOffId: string | null | undefined,
    excludeRequestId?: string,
  ): Promise<void> {
    const type = leaveTypeId
      ? await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId }, select: { code: true } })
      : null;
    const isSaturdayHoliday = type?.code === LeaveRequestsService.SATURDAY_HOLIDAY_CODE;

    if (!isSaturdayHoliday) {
      if (holidayDayOffId) {
        throw new BadRequestException('Swieto w sobote wskazuje sie tylko we wniosku „Do wyboru za swieto w sobote".');
      }
      return;
    }

    if (!holidayDayOffId) {
      throw new BadRequestException('Wskaz, za ktore swieto wypadajace w sobote odbierasz dzien wolny.');
    }

    const holiday = await this.prisma.holidayDayOff.findUnique({
      where: { id: holidayDayOffId },
      select: { approved: true, date: true, name: true },
    });
    if (!holiday) throw new BadRequestException('Wskazane swieto nie istnieje.');
    if (!holiday.approved) {
      throw new BadRequestException('Za to swieto administrator nie zatwierdzil dnia wolnego.');
    }

    const alreadyTaken = await this.prisma.leaveRequest.findFirst({
      where: {
        userId: applicantId,
        holidayDayOffId,
        status: { in: ['PENDING', 'APPROVED'] },
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      },
      select: { id: true },
    });
    if (alreadyTaken) {
      const label = `${holiday.date.toISOString().slice(0, 10)} ${holiday.name}`;
      throw new BadRequestException(`Dzien wolny za swieto ${label} zostal juz przez Ciebie odebrany.`);
    }
  }

  // @anchor assert-hours-valid
  /// Rodzaj pelnodniowy — wniosek nie niesie godzin (caly dzien pracy).
  /// Rodzaj godzinowy — dopuszczamy wylacznie pelne godziny, minuty zawsze 00.
  private async assertHoursValid(
    leaveTypeId: string | null | undefined,
    timeStart: string | null | undefined,
    timeEnd: string | null | undefined,
  ): Promise<void> {
    const type = leaveTypeId
      ? await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId }, select: { allowsHourly: true } })
      : null;
    if (!type?.allowsHourly) return;

    for (const value of [timeStart, timeEnd]) {
      if (!value) continue;
      if (!/^([01]\d|2[0-3]):00$/.test(value)) {
        throw new BadRequestException('Urlop godzinowy przyjmuje wylacznie pelne godziny (minuty 00).');
      }
    }
  }

  // @anchor assert-comment-valid
  /// Uzasadnienie obowiazkowe dla rodzajow z LEAVE_TYPES_REQUIRING_COMMENT (dzis: OPIEKA).
  /// Pusty komentarz albo krotszy niz LEAVE_COMMENT_MIN_LENGTH znakow = wniosek odrzucony.
  private async assertCommentValid(
    leaveTypeId: string | null | undefined,
    comment: string | null | undefined,
  ): Promise<void> {
    const type = leaveTypeId
      ? await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId }, select: { code: true } })
      : null;
    if (!type || !LEAVE_TYPES_REQUIRING_COMMENT.includes(type.code)) return;

    const text = (comment || '').trim();
    if (!text) throw new BadRequestException(CARE_LEAVE_COMMENT_HINT);
    if (text.length < LEAVE_COMMENT_MIN_LENGTH) {
      throw new BadRequestException(
        `Uzasadnienie jest za krotkie (min. ${LEAVE_COMMENT_MIN_LENGTH} znakow). ${CARE_LEAVE_COMMENT_HINT}`,
      );
    }
  }

  // @anchor is-supervisor-of
  private async isSupervisorOf(supervisorId: string, employeeId: string): Promise<boolean> {
    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
      select: { supervisorId: true },
    });
    return employee?.supervisorId === supervisorId;
  }

  private async assertEnabled(userId: string, roles: string[]) {
    const access = await this.leaves.resolveAccess(userId, roles);
    if (!access.enabled) throw new ForbiddenException('Moduł Urlopy niedostępny dla tego użytkownika.');
    return access;
  }
}
