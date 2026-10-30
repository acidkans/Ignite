import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { OneDriveService } from '../onedrive/onedrive.service';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TZ = 'Europe/Warsaw';

// @anchor ms-calendar-event-input
export interface MsCalendarEventInput {
  subject: string;
  body?: string | null;
  start: Date;
  durationMinutes: number;
}

// @anchor to-warsaw-local
/// Data w czasie polskim jako 'RRRR-MM-DDTGG:MM:SS' — Graph dostaje ją razem z `timeZone`,
/// więc Outlook pokaże dokładnie tę godzinę niezależnie od strefy serwera (UTC).
export const toWarsawLocal = (d: Date): string => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
};

// @anchor ms-calendar-service
// Wydarzenia w kalendarzu Outlook użytkownika (Graph /me/events, scope Calendars.ReadWrite).
// Błędy 401/403 NIE ustawiają needsReauth — konto bez zgody na kalendarz dalej synchronizuje
// To Do i OneDrive; wołający loguje błąd i zadanie zostaje bez wydarzenia.
@Injectable()
export class MsCalendarService {
  private readonly logger = new Logger(MsCalendarService.name);

  constructor(private readonly oneDrive: OneDriveService) {}

  // @anchor ms-calendar-payload
  private payload(e: MsCalendarEventInput) {
    const end = new Date(e.start.getTime() + e.durationMinutes * 60000);
    return {
      subject: e.subject,
      body: { contentType: 'text', content: e.body || '' },
      start: { dateTime: toWarsawLocal(e.start), timeZone: 'Central European Standard Time' },
      end: { dateTime: toWarsawLocal(end), timeZone: 'Central European Standard Time' },
      showAs: 'busy',
      isReminderOn: true,
      reminderMinutesBeforeStart: 15,
    };
  }

  // @anchor ms-calendar-create-event
  async createEvent(userId: string, e: MsCalendarEventInput): Promise<string> {
    const token = await this.oneDrive.getValidToken(userId);
    const res = await axios.post(`${GRAPH_BASE}/me/events`, this.payload(e), {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    return res.data.id;
  }

  // @anchor ms-calendar-update-event
  // false = wydarzenia już nie ma (usunięte ręcznie w Outlooku) — wołający zakłada nowe.
  async updateEvent(userId: string, eventId: string, e: MsCalendarEventInput): Promise<boolean> {
    const token = await this.oneDrive.getValidToken(userId);
    try {
      await axios.patch(`${GRAPH_BASE}/me/events/${eventId}`, this.payload(e), {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      return true;
    } catch (err: any) {
      if (err?.response?.status === 404) return false;
      throw err;
    }
  }

  // @anchor ms-calendar-delete-event
  async deleteEvent(userId: string, eventId: string): Promise<void> {
    const token = await this.oneDrive.getValidToken(userId);
    try {
      await axios.delete(`${GRAPH_BASE}/me/events/${eventId}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err: any) {
      if (err?.response?.status !== 404) throw err;
    }
  }
}
