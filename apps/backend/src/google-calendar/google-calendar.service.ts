import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'crypto';
import axios from 'axios';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

// @anchor google-calendar-default-id
/// Wspolny kalendarz urlopowy — ten sam, ktory zakladka „Kalendarz" pokazuje w iframe.
/// Odczyt idzie przez publiczny embed, zapis przez to API.
const DEFAULT_CALENDAR_ID = 'airtel.urlopy@gmail.com';

// @anchor google-calendar-source-marker
/// Znacznik w extendedProperties odrozniajacy zdarzenia zalozone przez Ignite od wpisow
/// robionych recznie (spotkania, wyjazdy, „HO"). Rekoncyliacja rusza WYLACZNIE zdarzenia
/// z tym znacznikiem — wpisy ludzi maja zostac nietkniete.
export const IGNITE_EVENT_SOURCE = 'ignite';

// @anchor google-calendar-event-segment
/// Jeden ciagly kawalek urlopu. Wniosek przerwany weekendem albo swietem rozpada sie
/// na kilka segmentow, bo Google nie umie zrobic dziury w srodku zdarzenia calodniowego.
export interface LeaveEventSegment {
  dateStart: Date;
  dateEnd: Date;
  /// 'HH:mm' — gdy obie godziny sa ustawione, zdarzenie jest godzinowe zamiast calodniowego
  timeStart?: string | null;
  timeEnd?: string | null;
}

// @anchor google-calendar-event-params
export interface GoogleLeaveEventParams {
  /// id wniosku — laduje w extendedProperties, zeby zdarzenia dalo sie odnalezc
  /// nawet gdy zapisane googleEventIds zagina.
  leaveRequestId: string;
  /// id zdarzen z poprzedniego zapisu; puste => zakladamy wszystko od nowa
  knownEventIds?: string[];
  summary: string;
  description?: string | null;
  segments: LeaveEventSegment[];
}

// @anchor google-calendar-sync-result
export interface GoogleSyncResult {
  /// false = integracja wylaczona albo API odmowilo; error opisuje powod
  ok: boolean;
  eventIds: string[];
  error?: string;
}

// @anchor to-calendar-date
/// 'YYYY-MM-DD' w strefie Europe/Warsaw — data z bazy jest o polnocy UTC,
/// wiec zwykle toISOString() cofaloby dzien przy ujemnym offsecie.
const toCalendarDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

// @anchor add-days
const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86400000);

// @anchor google-calendar-service
/// Zapis zatwierdzonych urlopow do wspolnego kalendarza Google.
/// Uwierzytelnienie: konto serwisowe (JWT RS256 -> token OAuth2), bez zaleznosci npm.
/// Bez kompletu zmiennych srodowiskowych serwis jest wylaczony i wszystkie metody
/// sa no-opem — modul Urlopy ma dzialac tak samo, gdy integracja nie jest skonfigurowana.
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get calendarId(): string {
    return this.config.get<string>('GOOGLE_CALENDAR_ID') || DEFAULT_CALENDAR_ID;
  }

  private get clientEmail(): string {
    return (this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL') || '').trim();
  }

  private get privateKey(): string {
    // W .env klucz trzyma sie w jednej linii ze znakami ucieczki — tu wracamy do realnych zlaman.
    return (this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY') || '').replace(/\\n/g, '\n').trim();
  }

  private get impersonate(): string {
    /// Tylko dla Google Workspace z delegacja ogolnodomenowa. Dla zwyklego konta
    /// gmail zostaw puste i udostepnij kalendarz adresowi konta serwisowego.
    return (this.config.get<string>('GOOGLE_CALENDAR_IMPERSONATE') || '').trim();
  }

  // @anchor google-calendar-is-enabled
  isEnabled(): boolean {
    return !!this.clientEmail && !!this.privateKey;
  }

  // @anchor google-calendar-access-token
  /// Token OAuth2 z podpisanego JWT konta serwisowego. Trzymany w pamieci do wygasniecia.
  private async accessToken(): Promise<string | null> {
    if (!this.isEnabled()) return null;
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim: Record<string, any> = {
      iss: this.clientEmail,
      scope: CALENDAR_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };
    if (this.impersonate) claim.sub = this.impersonate;

    const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64(header)}.${b64(claim)}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.privateKey, 'base64url');

    try {
      const { data } = await axios.post(
        GOOGLE_TOKEN_URL,
        new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: `${unsigned}.${signature}`,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 },
      );
      this.token = {
        value: data.access_token,
        expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      };
      return this.token.value;
    } catch (err: any) {
      this.logger.error(
        `Google Calendar — nie udalo sie pobrac tokenu: ${err?.response?.data?.error_description || err?.message}`,
      );
      return null;
    }
  }

  private get eventsUrl(): string {
    return `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(this.calendarId)}/events`;
  }

  // @anchor google-calendar-event-body
  /// Zdarzenie calodniowe, chyba ze segment niesie obie godziny — wtedy godzinowe
  /// w strefie Europe/Warsaw (urlop wypoczynkowy dzielony na godziny, art. 154(2) KP).
  private eventBody(params: GoogleLeaveEventParams, segment: LeaveEventSegment) {
    const timed = !!segment.timeStart && !!segment.timeEnd;
    return {
      summary: params.summary,
      description: params.description || undefined,
      start: timed
        ? { dateTime: `${toCalendarDate(segment.dateStart)}T${segment.timeStart}:00`, timeZone: 'Europe/Warsaw' }
        : { date: toCalendarDate(segment.dateStart) },
      end: timed
        ? { dateTime: `${toCalendarDate(segment.dateEnd)}T${segment.timeEnd}:00`, timeZone: 'Europe/Warsaw' }
        : // Google traktuje koniec zdarzenia calodniowego jako date wylaczna — stad +1 dzien.
          { date: toCalendarDate(addDays(segment.dateEnd, 1)) },
      extendedProperties: {
        private: { leaveRequestId: params.leaveRequestId, source: IGNITE_EVENT_SOURCE },
      },
    };
  }

  // @anchor google-calendar-sync-leave-events
  /// Doprowadza kalendarz do stanu opisanego przez `segments`: istniejace zdarzenia wniosku
  /// aktualizuje, brakujace zaklada, nadmiarowe kasuje. Zwraca liste id do zapisania przy
  /// wniosku. Best-effort — nie rzuca wyjatkow, zeby blad kalendarza nie cofal decyzji o urlopie.
  async syncLeaveEvents(params: GoogleLeaveEventParams): Promise<GoogleSyncResult> {
    const token = await this.accessToken();
    if (!token) {
      return {
        ok: false,
        eventIds: params.knownEventIds || [],
        error: 'Integracja z kalendarzem Google jest wyłączona.',
      };
    }
    const headers = { Authorization: `Bearer ${token}` };

    // stan faktyczny w kalendarzu jest wazniejszy niz zapisane id — ktos mogl skasowac
    // zdarzenie recznie albo poprzedni zapis mogl nie dojsc do bazy
    const found = await this.findEventIds(params.leaveRequestId, token);
    const existing = found.length ? found : (params.knownEventIds || []).filter(Boolean);

    const eventIds: string[] = [];
    let error: string | undefined;

    for (let i = 0; i < params.segments.length; i++) {
      const body = this.eventBody(params, params.segments[i]);
      const reuse = existing[i];
      if (reuse) {
        try {
          const { data } = await axios.patch(`${this.eventsUrl}/${encodeURIComponent(reuse)}`, body, {
            headers,
            timeout: 15_000,
          });
          eventIds.push(data?.id || reuse);
          continue;
        } catch (err: any) {
          const code = err?.response?.status;
          // 404/410 = zdarzenie skasowano recznie w kalendarzu; zakladamy je od nowa
          if (code !== 404 && code !== 410) {
            error = err?.response?.data?.error?.message || err?.message;
            this.logger.error(`Google Calendar — aktualizacja zdarzenia nieudana: ${error}`);
            continue;
          }
        }
      }
      try {
        const { data } = await axios.post(this.eventsUrl, body, { headers, timeout: 15_000 });
        if (data?.id) eventIds.push(data.id);
      } catch (err: any) {
        error = err?.response?.data?.error?.message || err?.message;
        this.logger.error(`Google Calendar — zapis zdarzenia nieudany: ${error}`);
      }
    }

    // urlop sie skrocil — zdarzenia ponad liczbe segmentow znikaja z kalendarza
    for (const stale of existing.slice(params.segments.length)) {
      if (eventIds.includes(stale)) continue;
      await this.deleteEvent(stale, token);
    }

    return { ok: !error && eventIds.length === params.segments.length, eventIds, error };
  }

  // @anchor google-calendar-find-event-ids
  /// Wyszukanie po extendedProperties — ratunek, gdy wniosek nie ma zapisanych googleEventIds
  /// (np. zdarzenie zalozono przed dodaniem kolumny albo zapis id sie nie powiodl).
  private async findEventIds(leaveRequestId: string, token: string): Promise<string[]> {
    try {
      const { data } = await axios.get(this.eventsUrl, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          privateExtendedProperty: `leaveRequestId=${leaveRequestId}`,
          showDeleted: false,
          maxResults: 50,
          singleEvents: true,
          orderBy: 'startTime',
        },
        timeout: 15_000,
      });
      return (data?.items || []).map((e: any) => e.id).filter(Boolean);
    } catch {
      return [];
    }
  }

  // @anchor google-calendar-delete-event
  /// Brak zdarzenia (404/410) traktujemy jak sukces — stan koncowy jest ten sam.
  private async deleteEvent(id: string, token: string): Promise<void> {
    try {
      await axios.delete(`${this.eventsUrl}/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15_000,
      });
    } catch (err: any) {
      const code = err?.response?.status;
      if (code !== 404 && code !== 410) {
        this.logger.error(`Google Calendar — usuniecie zdarzenia nieudane: ${err?.message}`);
      }
    }
  }

  // @anchor google-calendar-delete-leave-events
  /// Kasuje wszystkie zdarzenia wniosku po cofnieciu decyzji albo usunieciu wniosku.
  async deleteLeaveEvents(googleEventIds?: string[] | null, leaveRequestId?: string): Promise<void> {
    const token = await this.accessToken();
    if (!token) return;
    const found = leaveRequestId ? await this.findEventIds(leaveRequestId, token) : [];
    const ids = new Set([...(googleEventIds || []).filter(Boolean), ...found]);
    for (const id of ids) await this.deleteEvent(id, token);
  }
}
