import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// @anchor polish-fixed-holidays
/// Swieta ustawowo wolne o STALEJ dacie. Tylko one moga wypasc w sobote —
/// swieta ruchome sa przypiete do dnia tygodnia (Poniedzialek Wielkanocny = pn,
/// Zielone Swiatki = nd, Boze Cialo = czw), wiec nie generuja dnia do odebrania.
export const POLISH_FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: 'Nowy Rok' },
  { month: 1, day: 6, name: 'Święto Trzech Króli' },
  { month: 5, day: 1, name: 'Święto Pracy' },
  { month: 5, day: 3, name: 'Święto Konstytucji 3 Maja' },
  { month: 8, day: 15, name: 'Wniebowzięcie NMP / Święto Wojska Polskiego' },
  { month: 11, day: 1, name: 'Wszystkich Świętych' },
  { month: 11, day: 11, name: 'Narodowe Święto Niepodległości' },
  { month: 12, day: 25, name: 'Boże Narodzenie (pierwszy dzień)' },
  { month: 12, day: 26, name: 'Boże Narodzenie (drugi dzień)' },
];

// @anchor saturday-holiday-proposal
export interface SaturdayHolidayProposal {
  /// id wiersza HolidayDayOff — null dopoki administrator nie podjal decyzji.
  /// Wniosek ZA_SWIETO_SOB wskazuje swieto wlasnie tym id.
  id: string | null;
  date: string; // 'YYYY-MM-DD'
  name: string;
  approved: boolean;
  approvedAt: Date | null;
  approvedByName: string | null;
  /// true = dzien dodany recznie przez administratora, spoza kalendarza swiat
  custom: boolean;
}

// @anchor holidays-service
/// Dni wolne za swieta wypadajace w sobote: propozycje liczone z kalendarza,
/// decyzja administratora zapisywana w `HolidayDayOff`.
@Injectable()
export class HolidaysService {
  constructor(private prisma: PrismaService) {}

  // @anchor saturday-holidays-for-year
  /// Propozycje na rok — swieta o stalej dacie, ktore wypadaja w sobote.
  static proposalsForYear(year: number): { date: string; name: string }[] {
    return POLISH_FIXED_HOLIDAYS
      .map(h => ({ d: new Date(Date.UTC(year, h.month - 1, h.day)), name: h.name }))
      .filter(x => x.d.getUTCDay() === 6)
      .map(x => ({ date: x.d.toISOString().slice(0, 10), name: x.name }));
  }

  // @anchor easter-sunday
  /// Niedziela wielkanocna danego roku (algorytm Meeusa/Jonesa/Butchera, w UTC).
  /// Potrzebna, bo swieta ruchome wypadaja w dni robocze (Boze Cialo = czwartek)
  /// i tak samo jak weekend przerywaja pasek urlopu w kalendarzu.
  static easterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }

  // @anchor polish-holiday-keys
  /// Wszystkie dni ustawowo wolne w danym roku jako klucze 'YYYY-MM-DD':
  /// swieta o stalej dacie plus ruchome liczone od Wielkanocy (Poniedzialek Wielkanocny,
  /// Zielone Swiatki, Boze Cialo). Sama Wielkanoc i Zielone Swiatki wypadaja w niedziele,
  /// ale trzymamy je na liscie, zeby zbior byl kompletny niezaleznie od kontekstu uzycia.
  static holidayKeys(year: number): Set<string> {
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const easter = HolidaysService.easterSunday(year);
    const shift = (days: number) => key(new Date(easter.getTime() + days * 86400000));
    return new Set([
      ...POLISH_FIXED_HOLIDAYS.map(h => key(new Date(Date.UTC(year, h.month - 1, h.day)))),
      key(easter),
      shift(1), // Poniedzialek Wielkanocny
      shift(49), // Zielone Swiatki
      shift(60), // Boze Cialo
    ]);
  }

  // @anchor list-holiday-days-off
  /// Lista dni wolnych na rok: propozycje z kalendarza wzbogacone o stan decyzji z bazy
  /// plus dni dodane recznie przez administratora (spoza kalendarza swiat).
  async list(year: number): Promise<{ year: number; items: SaturdayHolidayProposal[]; approvedDays: number }> {
    const rows = await this.prisma.holidayDayOff.findMany({
      where: { year },
      include: { approvedBy: { select: { firstName: true, lastName: true } } },
    });
    const byDate = new Map(rows.map(r => [r.date.toISOString().slice(0, 10), r]));
    const proposals = HolidaysService.proposalsForYear(year);
    const proposalDates = new Set(proposals.map(p => p.date));

    const toItem = (date: string, name: string, custom: boolean): SaturdayHolidayProposal => {
      const row = byDate.get(date);
      return {
        id: row?.id ?? null,
        date,
        name,
        approved: !!row?.approved,
        approvedAt: row?.approvedAt ?? null,
        approvedByName: row?.approvedBy
          ? `${row.approvedBy.firstName || ''} ${row.approvedBy.lastName || ''}`.trim()
          : null,
        custom,
      };
    };

    const items = [
      ...proposals.map(p => toItem(p.date, p.name, false)),
      ...rows
        .map(r => r.date.toISOString().slice(0, 10))
        .filter(d => !proposalDates.has(d))
        .map(d => toItem(d, byDate.get(d)!.name, true)),
    ].sort((a, b) => a.date.localeCompare(b.date));

    return { year, items, approvedDays: items.filter(i => i.approved).length };
  }

  // @anchor add-custom-holiday-day-off
  /// Wlasny dzien wolny administratora — awaryjne uzupelnienie, gdy kalendarz swiat nie wystarcza.
  async addCustom(userId: string, isAdmin: boolean, date: string, name?: string) {
    if (!isAdmin) throw new ForbiddenException('Dni wolne za święta zatwierdza administrator — Ty tego nie zmienisz.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      throw new BadRequestException('Podaj datę w formacie YYYY-MM-DD.');
    }
    const day = new Date(`${date}T00:00:00.000Z`);
    if (isNaN(day.getTime())) throw new BadRequestException('Ta data wygląda dziwnie — wpisz ją jeszcze raz.');

    const year = day.getUTCFullYear();
    const now = new Date();
    await this.prisma.holidayDayOff.upsert({
      where: { date: day },
      create: {
        year,
        date: day,
        name: name?.trim() || 'Dzień wolny dodany ręcznie',
        approved: true,
        approvedAt: now,
        approvedById: userId,
      },
      update: {
        name: name?.trim() || undefined,
        approved: true,
        approvedAt: now,
        approvedById: userId,
      },
    });
    return this.list(year);
  }

  // @anchor remove-custom-holiday-day-off
  /// Usuwa wlasny dzien administratora. Dni z kalendarza swiat tylko odznaczamy — nie kasujemy.
  async removeCustom(userId: string, isAdmin: boolean, date: string) {
    if (!isAdmin) throw new ForbiddenException('Dni wolne za święta zatwierdza administrator — Ty tego nie zmienisz.');
    const day = new Date(`${date}T00:00:00.000Z`);
    if (isNaN(day.getTime())) throw new BadRequestException('Ta data wygląda dziwnie — wpisz ją jeszcze raz.');

    const year = day.getUTCFullYear();
    if (HolidaysService.proposalsForYear(year).some(p => p.date === date)) {
      throw new BadRequestException('Dzień z kalendarza świąt możesz tylko odznaczyć, nie usunąć.');
    }
    await this.prisma.holidayDayOff.deleteMany({ where: { date: day } });
    return this.list(year);
  }

  // @anchor approve-holiday-days-off
  /// Decyzja administratora — `dates` to komplet dat zatwierdzonych dla roku,
  /// wszystko spoza listy wraca do stanu niezatwierdzonego.
  async setApproved(userId: string, isAdmin: boolean, year: number, dates: string[]) {
    if (!isAdmin) throw new ForbiddenException('Dni wolne za święta zatwierdza administrator — Ty tego nie zmienisz.');

    // decyzja obejmuje kalendarz świąt ORAZ dni dodane ręcznie — odznaczenie tu jest cofnięciem
    const existing = await this.prisma.holidayDayOff.findMany({ where: { year }, select: { date: true, name: true } });
    const fromCalendar = HolidaysService.proposalsForYear(year);
    const known = new Map(fromCalendar.map(p => [p.date, p.name]));
    for (const row of existing) {
      const d = row.date.toISOString().slice(0, 10);
      if (!known.has(d)) known.set(d, row.name);
    }
    const proposals = [...known.entries()].map(([date, name]) => ({ date, name }));
    const wanted = new Set((dates || []).filter(d => known.has(d)));
    const now = new Date();

    await this.prisma.$transaction(
      proposals.map(p => {
        const approved = wanted.has(p.date);
        const date = new Date(`${p.date}T00:00:00.000Z`);
        return this.prisma.holidayDayOff.upsert({
          where: { date },
          create: {
            year,
            date,
            name: p.name,
            approved,
            approvedAt: approved ? now : null,
            approvedById: approved ? userId : null,
          },
          update: {
            name: p.name,
            approved,
            approvedAt: approved ? now : null,
            approvedById: approved ? userId : null,
          },
        });
      }),
    );

    return this.list(year);
  }

  // @anchor list-approved-holiday-days
  /// Swieta w sobote zatwierdzone przez administratora na dany rok — lista do wyboru
  /// we wniosku ZA_SWIETO_SOB, z oznaczeniem dni juz odebranych przez tego pracownika.
  async listApprovedForUser(
    userId: string,
    year: number,
    excludeRequestId?: string,
  ): Promise<{ year: number; items: { id: string; date: string; name: string; used: boolean }[] }> {
    const rows = await this.prisma.holidayDayOff.findMany({
      where: { year, approved: true },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        name: true,
        requests: {
          where: {
            userId,
            status: { in: ['PENDING', 'APPROVED'] },
            ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
          },
          select: { id: true },
        },
      },
    });

    return {
      year,
      items: rows.map(r => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        name: r.name,
        used: r.requests.length > 0,
      })),
    };
  }

  // @anchor approved-holiday-days-count
  /// Ile dni wolnych za swieta przysluguje w danym roku — limit wnioskow ZA_SWIETO_SOB.
  async approvedDaysCount(year: number): Promise<number> {
    return this.prisma.holidayDayOff.count({ where: { year, approved: true } });
  }
}
