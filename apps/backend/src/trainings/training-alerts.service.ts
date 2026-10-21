import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SmtpService } from '../smtp/smtp.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { TrainingsService, isoDay } from './trainings.service';

// @anchor training-alert-stages-all — etapy zamówienia, z których admin wybiera „aktywne".
export const TRAINING_ALERT_STAGES = ['WYCENA', 'ZAAKCEPTOWANE', 'REALIZACJA', 'ROZLICZONE'];
// @anchor training-alert-modes
export const TRAINING_ALERT_MODES = ['PROGI', 'DAILY', 'ONCE'] as const;

const DAY_MS = 86_400_000;
const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fullName = (u: { firstName?: string | null; lastName?: string | null; email?: string | null }) =>
    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || '';
const fmtDay = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : '—');

// @anchor warsaw-today — dzisiejsza data i godzina w Polsce; serwer chodzi w UTC.
export const warsawNow = (now = new Date()) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(p => [p.type, p.value]));
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

// @anchor training-alert-item
export interface TrainingAlertItem {
    key: string;
    isNew: boolean;
    kind: 'EXPIRED' | 'EXPIRING' | 'MISSING';
    daysLeft: number | null;
    validUntil: string | null;
    order: { id: string; name: string; area: string; orderStage: string };
    user: { id: string; name: string };
    type: { id: string; name: string; code: string | null };
}

// @anchor training-alerts-service
@Injectable()
export class TrainingAlertsService {
    private readonly logger = new Logger(TrainingAlertsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly smtp: SmtpService,
        private readonly config: ConfigService,
        private readonly notifSettings: NotificationSettingsService,
        private readonly trainings: TrainingsService,
    ) {}

    // @anchor training-alert-settings-get
    async getSettings() {
        const s = await this.notifSettings.getOrCreate();
        return {
            enabled: s.trainingAlertsEnabled,
            stages: Array.isArray(s.trainingAlertStages) ? (s.trainingAlertStages as string[]) : [],
            warnDays: s.trainingAlertWarnDays,
            hour: s.trainingAlertHour,
            mode: s.trainingAlertMode,
            includeMissing: s.trainingAlertIncludeMissing,
            allStages: TRAINING_ALERT_STAGES,
        };
    }

    // @anchor training-alert-settings-update
    async updateSettings(dto: any) {
        const data: any = {};
        if (dto.enabled !== undefined) data.trainingAlertsEnabled = !!dto.enabled;
        if (dto.includeMissing !== undefined) data.trainingAlertIncludeMissing = !!dto.includeMissing;
        if (dto.stages !== undefined) {
            if (!Array.isArray(dto.stages) || dto.stages.some((x: any) => !TRAINING_ALERT_STAGES.includes(x))) {
                throw new BadRequestException(`Etapy: dozwolone ${TRAINING_ALERT_STAGES.join(', ')}`);
            }
            data.trainingAlertStages = [...new Set(dto.stages)];
        }
        if (dto.warnDays !== undefined) {
            const n = Number(dto.warnDays);
            if (!Number.isInteger(n) || n < 1 || n > 365) throw new BadRequestException('Próg ostrzeżenia: 1–365 dni');
            data.trainingAlertWarnDays = n;
        }
        if (dto.hour !== undefined) {
            const n = Number(dto.hour);
            if (!Number.isInteger(n) || n < 0 || n > 23) throw new BadRequestException('Godzina wysyłki: 0–23');
            data.trainingAlertHour = n;
        }
        if (dto.mode !== undefined) {
            if (!TRAINING_ALERT_MODES.includes(dto.mode)) throw new BadRequestException(`Tryb: ${TRAINING_ALERT_MODES.join(', ')}`);
            data.trainingAlertMode = dto.mode;
        }
        await this.notifSettings.getOrCreate();
        await this.prisma.systemNotificationSettings.update({ where: { id: 'singleton' }, data });
        return this.getSettings();
    }

    // @anchor training-alert-bucket — do którego progu należy dzisiejsza pozycja. Ten sam próg
    // nie idzie drugi raz (`TrainingAlertLog.key`). PROGI: najmniejszy z [warnDays, 7, 1, 0],
    // który `daysLeft` już przekroczył — po terminie to próg 0, więc wygasłe szkolenie zgłasza
    // się raz, a nie codziennie. DAILY: data dnia. ONCE: jeden klucz na szkolenie.
    private bucketOf(mode: string, warnDays: number, daysLeft: number | null, today: string) {
        if (daysLeft === null) return mode === 'DAILY' ? today : 'brak';
        if (mode === 'DAILY') return today;
        if (mode === 'ONCE') return 'raz';
        const progi = [...new Set([warnDays, 7, 1, 0])].filter(t => t <= warnDays).sort((a, b) => a - b);
        const d = Math.max(daysLeft, 0);
        return `p${progi.find(t => d <= t) ?? warnDays}`;
    }

    // @anchor training-alert-compute — aktywne zamówienie (etap z ustawień i NIE zamknięte) ×
    // przypisany pracownik × szkolenie wymagane przez to zamówienie, wygasłe albo kończące się
    // w ciągu progu (opcjonalnie też brakujące).
    async computeAlerts(today = warsawNow().day) {
        const s = await this.getSettings();
        const orders = await this.prisma.processNode.findMany({
            where: { type: 'order', orderStage: { in: s.stages }, requiredTrainings: { some: {} }, assignedUsers: { some: {} } },
            select: {
                id: true, name: true, orderStage: true, parent: { select: { name: true } },
                requiredTrainings: { select: { trainingType: { select: { id: true, name: true, code: true } } } },
                assignedUsers: {
                    where: { user: { isActive: true } },
                    select: { user: { select: { id: true, firstName: true, lastName: true, email: true, trainings: true } } },
                },
            },
            orderBy: { name: 'asc' },
        });
        const closure = await this.trainings.orderClosureMap(orders.map(o => o.id));
        const todayMs = Date.parse(`${today}T00:00:00Z`);
        const items: TrainingAlertItem[] = [];
        let closedSkipped = 0;

        for (const o of orders) {
            if (closure.get(o.id)?.closed) { closedSkipped++; continue; }
            const order = { id: o.id, name: o.name, area: o.parent?.name || '', orderStage: o.orderStage };
            for (const { user } of o.assignedUsers) {
                for (const { trainingType: t } of o.requiredTrainings) {
                    const ut = user.trainings.find(x => x.trainingTypeId === t.id);
                    let kind: TrainingAlertItem['kind'];
                    let daysLeft: number | null = null;
                    if (!ut) {
                        if (!s.includeMissing) continue;
                        kind = 'MISSING';
                    } else {
                        if (!ut.validUntil) continue;
                        daysLeft = Math.round((ut.validUntil.getTime() - todayMs) / DAY_MS);
                        if (daysLeft < 0) kind = 'EXPIRED';
                        else if (daysLeft <= s.warnDays) kind = 'EXPIRING';
                        else continue;
                    }
                    const validUntil = isoDay(ut?.validUntil ?? null);
                    items.push({
                        key: [user.id, t.id, o.id, validUntil || 'brak', this.bucketOf(s.mode, s.warnDays, daysLeft, today)].join('|'),
                        isNew: true, kind, daysLeft, validUntil, order,
                        user: { id: user.id, name: fullName(user) },
                        type: { id: t.id, name: t.name, code: t.code },
                    });
                }
            }
        }
        if (items.length) {
            const sent = await this.prisma.trainingAlertLog.findMany({ where: { key: { in: items.map(i => i.key) } }, select: { key: true } });
            const sentKeys = new Set(sent.map(x => x.key));
            for (const i of items) i.isNew = !sentKeys.has(i.key);
        }
        return { settings: s, items, closedSkipped, today };
    }

    // @anchor training-alert-recipients — aktywni ADMIN-i z adresem e-mail.
    async recipients() {
        const admins = await this.prisma.user.findMany({
            where: { isActive: true, userRoles: { some: { role: { name: 'ADMIN' } } } },
            select: { firstName: true, lastName: true, email: true },
            orderBy: { lastName: 'asc' },
        });
        return admins.filter(a => a.email?.includes('@')).map(a => ({ name: fullName(a), email: a.email }));
    }

    // @anchor training-alert-mail — zbiorczy mail pogrupowany po zamówieniach, najpilniejsze
    // najpierw; pozycje, które dziś przekroczyły nowy próg, oznaczone „NOWE".
    buildMail(items: TrainingAlertItem[], warnDays: number) {
        const ile = (k: string) => items.filter(i => i.kind === k).length;
        const parts = [
            ile('EXPIRED') && `${ile('EXPIRED')} wygasłe`,
            ile('EXPIRING') && `${ile('EXPIRING')} kończące się`,
            ile('MISSING') && `${ile('MISSING')} brakujące`,
        ].filter(Boolean);
        const subject = `[Ignite] Szkolenia w aktywnych projektach: ${parts.join(', ')}`;
        const groups = new Map<string, TrainingAlertItem[]>();
        for (const i of items) groups.set(i.order.id, [...(groups.get(i.order.id) || []), i]);
        const cell = 'padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:13px';
        const status = (i: TrainingAlertItem) => i.kind === 'MISSING'
            ? '<span style="color:#7c3aed;font-weight:bold">brak szkolenia</span>'
            : i.kind === 'EXPIRED'
                ? `<span style="color:#c62828;font-weight:bold">wygasło ${-(i.daysLeft as number)} dni temu</span>`
                : `<span style="color:#b45309;font-weight:bold">${i.daysLeft === 0 ? 'wygasa dziś' : `za ${i.daysLeft} dni`}</span>`;
        const appUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:5174'}/szkolenia`;
        const sections = [...groups.values()].map(g => {
            const rows = [...g].sort((a, b) => (a.daysLeft ?? -1e9) - (b.daysLeft ?? -1e9)).map(i => `<tr>
                <td style="${cell}">${esc(i.user.name)}</td>
                <td style="${cell}">${esc(i.type.name)}</td>
                <td style="${cell}">${esc(fmtDay(i.validUntil))}</td>
                <td style="${cell}">${status(i)}${i.isNew ? ' <span style="background:#0d9488;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px">NOWE</span>' : ''}</td>
            </tr>`).join('');
            const o = g[0].order;
            return `<p style="margin:20px 0 6px;font-weight:bold">${esc(o.name)} <span style="font-weight:normal;color:#666">· ${esc(o.area)} · ${esc(o.orderStage)}</span></p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
                <tr style="background:#fafafa">
                  <th align="left" style="${cell};font-size:12px;color:#555;width:26%">Pracownik</th>
                  <th align="left" style="${cell};font-size:12px;color:#555;width:36%">Szkolenie</th>
                  <th align="left" style="${cell};font-size:12px;color:#555;width:14%">Ważne do</th>
                  <th align="left" style="${cell};font-size:12px;color:#555">Status</th>
                </tr>${rows}</table>`;
        }).join('');
        const html = `<div style="font-family:Arial,sans-serif;color:#333;max-width:760px">
            <p style="color:#0d9488;margin:0 0 16px;font-weight:bold">SZKOLENIA PRACOWNIKÓW</p>
            <p style="margin:0">Poniżsi pracownicy są przypisani do aktywnych zamówień, a wymagane w nich szkolenia
              wygasły lub wygasną w ciągu ${warnDays} dni.</p>
            ${sections}
            <p style="margin:24px 0 4px"><a href="${esc(appUrl)}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold">Otwórz Szkolenia w Ignite</a></p>
            <p style="margin:16px 0 0;color:#999;font-size:11px">Wiadomość automatyczna. Zamówienia zamknięte (wszystkie pozycje odebrane protokołem) są pomijane.
              Ustawienia: System › Użytkownicy › Szkolenia › Powiadomienia e-mail.</p>
          </div>`;
        return { subject, html };
    }

    // @anchor training-alert-preview
    async preview() {
        const { settings, items, closedSkipped, today } = await this.computeAlerts();
        const recipients = await this.recipients();
        const mail = items.length ? this.buildMail(items, settings.warnDays) : null;
        return { settings, items, closedSkipped, today, recipients, mail, willSend: settings.enabled && items.some(i => i.isNew) };
    }

    // @anchor training-alert-runs
    runs() {
        return this.prisma.trainingAlertRun.findMany({ orderBy: { ranAt: 'desc' }, take: 30 });
    }

    // @anchor training-alert-run-send — właściwa wysyłka (cron albo „Wyślij teraz"). Mail idzie tylko,
    // gdy jest choć jedna NOWA pozycja; zawiera wszystkie bieżące, żeby admin widział pełny obraz.
    async run(trigger: 'CRON' | 'MANUAL') {
        const { settings, items } = await this.computeAlerts();
        if (trigger === 'CRON' && !settings.enabled) return null;
        const fresh = items.filter(i => i.isNew);
        if (!fresh.length) {
            return this.prisma.trainingAlertRun.create({ data: { status: 'SKIPPED', items: 0, recipients: 0 } });
        }
        const recipients = await this.recipients();
        if (!recipients.length) {
            return this.prisma.trainingAlertRun.create({ data: { status: 'ERROR', items: items.length, error: 'Brak aktywnego ADMIN-a z adresem e-mail' } });
        }
        try {
            const mail = this.buildMail(items, settings.warnDays);
            await this.smtp.sendMail({ to: recipients.map(r => r.email), subject: mail.subject, html: mail.html });
            await this.prisma.trainingAlertLog.createMany({ data: fresh.map(i => ({ key: i.key })), skipDuplicates: true });
            return this.prisma.trainingAlertRun.create({ data: { status: 'SENT', items: items.length, recipients: recipients.length } });
        } catch (err: any) {
            this.logger.error(`Alerty szkoleń — wysyłka nieudana: ${err?.message}`);
            return this.prisma.trainingAlertRun.create({ data: { status: 'ERROR', items: items.length, recipients: recipients.length, error: String(err?.message || err).slice(0, 500) } });
        }
    }

    // @anchor training-alert-send-test — bieżący podgląd na adres zalogowanego admina; nie
    // zapisuje progów, więc nie blokuje jutrzejszej prawdziwej wysyłki.
    async sendTest(userId: string) {
        const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!me?.email?.includes('@')) throw new BadRequestException('Twoje konto nie ma adresu e-mail');
        const { settings, items } = await this.computeAlerts();
        const mail = items.length
            ? this.buildMail(items, settings.warnDays)
            : { subject: '[Ignite] Szkolenia — test (brak pozycji)', html: '<p>Test powiadomień o szkoleniach: dziś żadne wymagane szkolenie w aktywnych zamówieniach nie kończy się w ciągu progu.</p>' };
        await this.smtp.sendMail({ to: me.email, subject: `[TEST] ${mail.subject}`, html: mail.html });
        await this.prisma.trainingAlertRun.create({ data: { status: 'TEST', items: items.length, recipients: 1 } });
        return { ok: true, to: me.email };
    }
}
