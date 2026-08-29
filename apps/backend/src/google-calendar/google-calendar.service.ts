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

// @anchor google-calendar-event-params
export interface GoogleLeaveEventParams {
  /// id wniosku — laduje w extendedProperties, zeby zdarzenie dalo sie odnalezc
  /// nawet gdy zapisany googleEventId zaginie.
  leaveRequestId: string;
  /// id zdarzenia z poprzedniego zapisu; brak => zakladamy nowe
  googleEventId?: string | null;
  summary: string;
  description?: string | null;
  /// Zdarzenia calodniowe — granice bierzemy z dat wniosku, godziny ignorujemy.
  dateStart: Date;
  dateEnd: Date;
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
    // W .env klucz trzyma sie w jednej linii z „\n" — tu wracamy do realnych zlaman.
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
      this.logger.error(`Google Calendar — nie udalo sie pobrac tokenu: ${err?.response?.data?.error_description || err?.message}`);
      return null;
    }
  }

  // @anchor google-calendar-event-body
  private eventBody(params: GoogleLeaveEventParams) {
    return {
      summary: params.summary,
      description: params.description || undefined,
      start: { date: toCalendarDate(params.dateStart) },
      // Google traktuje koniec zdarzenia calodniowego jako date wylaczna — stad +1 dzien.
      end: { date: toCalendarDate(addDays(params.dateEnd, 1)) },
      extendedProperties: { private: { leaveRequestId: params.leaveRequestId } },
    };
  }

  // @anchor google-calendar-upsert-leave-event
  /// Zaklada albo aktualizuje zdarzenie urlopowe. Zwraca id zdarzenia do zapisania
  /// przy wniosku, albo null gdy integracja jest wylaczona lub API odmowilo.
  /// Best-effort: nie rzuca wyjatkow, zeby blad kalendarza nie cofal decyzji o urlopie.
  async upsertLeaveEvent(params: GoogleLeaveEventParams): Promise<string | null> {
    const token = await this.accessToken();
    if (!token) return null;
    const headers = { Authorization: `Bearer ${token}` };
    const base = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(this.calendarId)}/events`;
    const body = this.eventBody(params);

    const existingId = params.googleEventId || (await this.findEventId(params.leaveRequestId, token));
    if (existingId) {
      try {
        const { data } = await axios.patch(`${base}/${encodeURIComponent(existingId)}`, body, {
          headers,
          timeout: 15_000,
        });
        return data?.id || existingId;
      } catch (err: any) {
        // 404/410 = zdarzenie skasowano recznie w kalendarzu; zakladamy je od nowa
        const code = err?.response?.status;
        if (code !== 404 && code !== 410) {
          this.logger.error(`Google Calendar — aktualizacja zdarzenia nieudana: ${err?.message}`);
          return null;
        }
      }
    }

    try {
      const { data } = await axios.post(base, body, { headers, timeout: 15_000 });
      return data?.id || null;
    } catch (err: any) {
      this.logger.error(
        `Google Calendar — zapis zdarzenia nieudany: ${err?.response?.data?.error?.message || err?.message}`,
      );
      return null;
    }
  }

  // @anchor google-calendar-find-event-id
  /// Wyszukanie po extendedProperties — ratunek, gdy wniosek nie ma zapisanego googleEventId
  /// (np. zdarzenie zalozono przed dodaniem kolumny albo zapis id sie nie powiodl).
  private async findEventId(leaveRequestId: string, token: string): Promise<string | null> {
    try {
      const { data } = await axios.get(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(this.calendarId)}/events`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            privateExtendedProperty: `leaveRequestId=${leaveRequestId}`,
            showDeleted: false,
            maxResults: 1,
          },
          timeout: 15_000,
        },
      );
      return data?.items?.[0]?.id || null;
    } catch {
      return null;
    }
  }

  // @anchor google-calendar-delete-leave-event
  /// Kasuje zdarzenie po cofnieciu decyzji albo usunieciu wniosku. Brak zdarzenia
  /// (404/410) traktujemy jak sukces — stan koncowy jest ten sam.
  async deleteLeaveEvent(googleEventId?: string | null, leaveRequestId?: string): Promise<void> {
    const token = await this.accessToken();
    if (!token) return;
    const id = googleEventId || (leaveRequestId ? await this.findEventId(leaveRequestId, token) : null);
    if (!id) return;
    try {
      await axios.delete(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 },
      );
    } catch (err: any) {
      const code = err?.response?.status;
      if (code !== 404 && code !== 410) {
        this.logger.error(`Google Calendar — usuniecie zdarzenia nieudane: ${err?.message}`);
      }
    }
  }
}
