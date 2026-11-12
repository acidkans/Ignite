import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SmtpService } from '../smtp/smtp.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { NotificationsService } from '../notifications/notifications.service';
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

// @anchor training-alert-item — EXPIRED/EXPIRING dotyczy zaświadczenia pracownika (bez zamówienia,
// `order` = null; `orders` to tylko kontekst: aktywne zamówienia, które tego szkolenia wymagają).
// MISSING dotyczy konkretnego aktywnego zamówienia (`order`).
export interface TrainingAlertItem {
    key: string;
    isNew: boolean;
    kind: 'EXPIRED' | 'EXPIRING' | 'MISSING';
    daysLeft: number | null;
    validUntil: string | null;
    order: { id: string; name: string; area: string; orderStage: string } | null;
    orders: { id: string; name: string }[];
    user: { id: string; name: string; email: string | null };
    type: { id: string; name: string; code: string | null };
}

// @anchor training-user-mail — osobisty mail pracownika o jego wygasających zaświadczeniach.
export interface TrainingUserMail {
    user: { id: string; name: string; email: string | null };
    items: TrainingAlertItem[];
    newCount: number;
    mail: { subject: string; html: string };
}

// @anchor training-notification-type — typ powiadomienia w dzwonku (Notification.type).
export const TRAINING_NOTIFICATION_TYPE = 'TRAINING_EXPIRY';

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
        private readonly notifications: NotificationsService,
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

    // @anchor training-alert-compute — dwa niezależne źródła pozycji:
    // 1) zaświadczenia: KAŻDY aktywny pracownik × jego szkolenie z datą ważności, które wygasło albo
    //    kończy się w ciągu progu — bez względu na zamówienia (etapy z ustawień tu nie grają);
    // 2) braki (opcja): aktywne zamówienie (etap z ustawień i NIE zamknięte) × członek zespołu
    //    zamówienia × wymagane szkolenie, którego nie ma wcale.
    async computeAlerts(today = warsawNow().day) {
        const s = await this.getSettings();
        const todayMs = Date.parse(`${today}T00:00:00Z`);
        const limit = new Date(todayMs + s.warnDays * DAY_MS);
        const personSel = { id: true, firstName: true, lastName: true, email: true, trainings: { select: { trainingTypeId: true } } } as const;
        const [users, orders] = await Promise.all([
            this.prisma.user.findMany({
                where: { isActive: true, trainings: { some: { validUntil: { not: null, lte: limit } } } },
                select: {
                    id: true, firstName: true, lastName: true, email: true,
                    trainings: {
                        where: { validUntil: { not: null, lte: limit } },
                        select: { validUntil: true, trainingType: { select: { id: true, name: true, code: true } } },
                    },
                },
                orderBy: { lastName: 'asc' },
            }),
            this.prisma.processNode.findMany({
                where: { type: 'order', orderStage: { in: s.stages }, requiredTrainings: { some: {} } },
                select: {
                    id: true, name: true, orderStage: true, parent: { select: { name: true } },
                    requiredTrainings: { select: { trainingType: { select: { id: true, name: true, code: true } } } },
                    orderTeam: { select: { users: { where: { isActive: true }, select: personSel } } },
                },
                orderBy: { name: 'asc' },
            }),
        ]);
        const closure = await this.trainings.orderClosureMap(orders.map(o => o.id));
        const active = orders.filter(o => !closure.get(o.id)?.closed);
        const closedSkipped = orders.length - active.length;
        // @anchor training-order-people — osoby zamówienia = aktywni członkowie zespołu zamówienia
        const peopleOf = (o: typeof orders[number]) => o.orderTeam?.users || [];
        // kontekst do zaświadczeń: które aktywne zamówienia danej osoby wymagają danego szkolenia
        const ctx = new Map<string, { id: string; name: string }[]>();
        for (const o of active) {
            for (const p of peopleOf(o)) {
                for (const { trainingType: t } of o.requiredTrainings) {
                    const k = `${p.id}|${t.id}`;
                    ctx.set(k, [...(ctx.get(k) || []), { id: o.id, name: o.name }]);
                }
            }
        }

        const items: TrainingAlertItem[] = [];
        for (const u of users) {
            for (const ut of u.trainings) {
                const t = ut.trainingType;
                const daysLeft = Math.round((ut.validUntil!.getTime() - todayMs) / DAY_MS);
                const validUntil = isoDay(ut.validUntil);
                items.push({
                    key: [u.id, t.id, validUntil, this.bucketOf(s.mode, s.warnDays, daysLeft, today)].join('|'),
                    isNew: true, kind: daysLeft < 0 ? 'EXPIRED' : 'EXPIRING', daysLeft, validUntil,
                    order: null, orders: ctx.get(`${u.id}|${t.id}`) || [],
                    user: { id: u.id, name: fullName(u), email: u.email?.includes('@') ? u.email : null },
                    type: { id: t.id, name: t.name, code: t.code },
                });
            }
        }
        if (s.includeMissing) {
            for (const o of active) {
                const order = { id: o.id, name: o.name, area: o.parent?.name || '', orderStage: o.orderStage };
                for (const p of peopleOf(o)) {
                    for (const { trainingType: t } of o.requiredTrainings) {
                        if (p.trainings.some(x => x.trainingTypeId === t.id)) continue;
                        items.push({
                            key: [p.id, t.id, o.id, 'brak', this.bucketOf(s.mode, s.warnDays, null, today)].join('|'),
                            isNew: true, kind: 'MISSING', daysLeft: null, validUntil: null, order, orders: [{ id: o.id, name: o.name }],
                            user: { id: p.id, name: fullName(p), email: p.email?.includes('@') ? p.email : null },
                            type: { id: t.id, name: t.name, code: t.code },
                        });
                    }
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

    private appUrl(path = '') {
        return `${this.config.get('FRONTEND_URL') || 'http://localhost:5174'}${path}`;
    }

    private statusHtml(i: TrainingAlertItem) {
        return i.kind === 'MISSING'
            ? '<span style="color:#7c3aed;font-weight:bold">brak szkolenia</span>'
            : i.kind === 'EXPIRED'
                ? `<span style="color:#c62828;font-weight:bold">wygasło ${-(i.daysLeft as number)} dni temu</span>`
                : `<span style="color:#b45309;font-weight:bold">${i.daysLeft === 0 ? 'wygasa dziś' : `za ${i.daysLeft} dni`}</span>`;
    }

    private table(heads: [string, string?][], rows: string[][]) {
        const cell = 'padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:13px';
        return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
            <tr style="background:#fafafa">${heads.map(([h, w]) => `<th align="left" style="${cell};font-size:12px;color:#555${w ? `;width:${w}` : ''}">${h}</th>`).join('')}</tr>
            ${rows.map(r => `<tr>${r.map(c => `<td style="${cell}">${c}</td>`).join('')}</tr>`).join('')}</table>`;
    }

    private nowe(i: TrainingAlertItem) {
        return i.isNew ? ' <span style="background:#0d9488;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px">NOWE</span>' : '';
    }

    // @anchor training-alert-mail — zbiorczy mail do ADMIN-ów: najpierw wygasające/wygasłe zaświadczenia
    // wszystkich pracowników (najpilniejsze na górze), potem braki pogrupowane po zamówieniach;
    // pozycje, które dziś przekroczyły nowy próg, oznaczone „NOWE".
    buildMail(items: TrainingAlertItem[], warnDays: number) {
        const ile = (k: string) => items.filter(i => i.kind === k).length;
        const parts = [
            ile('EXPIRED') && `${ile('EXPIRED')} wygasłe`,
            ile('EXPIRING') && `${ile('EXPIRING')} kończące się`,
            ile('MISSING') && `${ile('MISSING')} brakujące`,
        ].filter(Boolean);
        const subject = `[Ignite] Szkolenia pracowników: ${parts.join(', ')}`;
        const certs = items.filter(i => i.kind !== 'MISSING')
            .sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number) || a.user.name.localeCompare(b.user.name, 'pl'));
        const certSection = certs.length ? `<p style="margin:20px 0 6px;font-weight:bold">Wygasające i wygasłe zaświadczenia</p>
            ${this.table([['Pracownik', '24%'], ['Szkolenie', '28%'], ['Ważne do', '12%'], ['Status', '20%'], ['Wymagane w']],
                certs.map(i => [esc(i.user.name), esc(i.type.name), esc(fmtDay(i.validUntil)), this.statusHtml(i) + this.nowe(i),
                    i.orders.length ? esc(i.orders.map(o => o.name).join(', ')) : '<span style="color:#999">—</span>']))}` : '';
        const groups = new Map<string, TrainingAlertItem[]>();
        for (const i of items) if (i.kind === 'MISSING') groups.set(i.order!.id, [...(groups.get(i.order!.id) || []), i]);
        const missingSection = [...groups.values()].map(g => {
            const o = g[0].order!;
            return `<p style="margin:20px 0 6px;font-weight:bold">Brak szkoleń — ${esc(o.name)} <span style="font-weight:normal;color:#666">· ${esc(o.area)} · ${esc(o.orderStage)}</span></p>
              ${this.table([['Pracownik', '30%'], ['Szkolenie', '45%'], ['Status']],
                g.map(i => [esc(i.user.name), esc(i.type.name), this.statusHtml(i) + this.nowe(i)]))}`;
        }).join('');
        const html = `<div style="font-family:Arial,sans-serif;color:#333;max-width:760px">
            <p style="color:#0d9488;margin:0 0 16px;font-weight:bold">SZKOLENIA PRACOWNIKÓW</p>
            <p style="margin:0">Zaświadczenia, które wygasły lub wygasną w ciągu ${warnDays} dni — niezależnie od zamówień.
              Każdy pracownik dostaje też osobne przypomnienie o swoich zaświadczeniach.</p>
            ${certSection}${missingSection}
            <p style="margin:24px 0 4px"><a href="${esc(this.appUrl('/szkolenia'))}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold">Otwórz Szkolenia w Ignite</a></p>
            <p style="margin:16px 0 0;color:#999;font-size:11px">Wiadomość automatyczna. Braki szkoleń liczone są dla członków zespołu
              aktywnego zamówienia; zamówienia zamknięte (wszystkie pozycje odebrane protokołem) są pomijane.
              Ustawienia: System › Użytkownicy › Szkolenia › Powiadomienia e-mail.</p>
          </div>`;
        return { subject, html };
    }

    // @anchor training-user-mails — osobiste przypomnienia: jeden mail na pracownika z jego
    // wygasającymi/wygasłymi zaświadczeniami (braki w zamówieniach idą tylko do ADMIN-ów).
    buildUserMails(items: TrainingAlertItem[], warnDays: number): TrainingUserMail[] {
        const byUser = new Map<string, TrainingAlertItem[]>();
        for (const i of items) if (i.kind !== 'MISSING') byUser.set(i.user.id, [...(byUser.get(i.user.id) || []), i]);
        return [...byUser.values()].map(list => {
            const g = [...list].sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number));
            const user = g[0].user;
            const wyg = g.filter(i => i.kind === 'EXPIRED').length;
            const konczy = g.length - wyg;
            const subject = `[Ignite] Twoje szkolenia: ${[wyg && `${wyg} wygasło`, konczy && `${konczy} kończy się`].filter(Boolean).join(', ')}`;
            const html = `<div style="font-family:Arial,sans-serif;color:#333;max-width:680px">
                <p style="color:#0d9488;margin:0 0 16px;font-weight:bold">TWOJE SZKOLENIA</p>
                <p style="margin:0">Dzień dobry ${esc(user.name)},<br>poniższe zaświadczenia wygasły lub wygasną w ciągu ${warnDays} dni.
                  Zaplanuj odnowienie i przekaż nowe zaświadczenie, żeby zaktualizować datę w Ignite.</p>
                <div style="margin-top:16px">${this.table([['Szkolenie', '34%'], ['Ważne do', '14%'], ['Status', '22%'], ['Wymagane w zamówieniach']],
                    g.map(i => [esc(i.type.name), esc(fmtDay(i.validUntil)), this.statusHtml(i) + this.nowe(i),
                        i.orders.length ? esc(i.orders.map(o => o.name).join(', ')) : '<span style="color:#999">—</span>']))}</div>
                <p style="margin:24px 0 4px"><a href="${esc(this.appUrl())}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold">Otwórz Ignite</a></p>
                <p style="margin:16px 0 0;color:#999;font-size:11px">Wiadomość automatyczna z Ignite.</p>
              </div>`;
            return { user, items: g, newCount: g.filter(i => i.isNew).length, mail: { subject, html } };
        }).sort((a, b) => a.user.name.localeCompare(b.user.name, 'pl'));
    }

    // @anchor training-alert-preview
    async preview() {
        const { settings, items, closedSkipped, today } = await this.computeAlerts();
        const recipients = await this.recipients();
        const mail = items.length ? this.buildMail(items, settings.warnDays) : null;
        const userMails = this.buildUserMails(items, settings.warnDays);
        return { settings, items, closedSkipped, today, recipients, mail, userMails, willSend: settings.enabled && items.some(i => i.isNew) };
    }

    // @anchor training-alert-runs
    runs() {
        return this.prisma.trainingAlertRun.findMany({ orderBy: { ranAt: 'desc' }, take: 30 });
    }

    // @anchor training-alert-run-send — właściwa wysyłka (cron albo „Wyślij teraz"). Idzie tylko, gdy jest
    // choć jedna NOWA pozycja: zbiorczy mail do ADMIN-ów (wszystkie bieżące pozycje) oraz osobiste
    // przypomnienie (mail + dzwonek) do każdego pracownika, który ma NOWĄ pozycję o swoim zaświadczeniu.
    async run(trigger: 'CRON' | 'MANUAL') {
        const { settings, items } = await this.computeAlerts();
        if (trigger === 'CRON' && !settings.enabled) return null;
        const fresh = items.filter(i => i.isNew);
        if (!fresh.length) {
            return this.prisma.trainingAlertRun.create({ data: { status: 'SKIPPED', items: 0, recipients: 0 } });
        }
        const errors: string[] = [];
        let delivered = 0;
        const admins = await this.recipients();
        let adminOk = false;
        if (!admins.length) errors.push('Brak aktywnego ADMIN-a z adresem e-mail');
        else {
            try {
                const mail = this.buildMail(items, settings.warnDays);
                await this.smtp.sendMail({ to: admins.map(r => r.email!), subject: mail.subject, html: mail.html });
                adminOk = true;
                delivered += admins.length;
            } catch (err: any) {
                this.logger.error(`Alerty szkoleń — mail do adminów nieudany: ${err?.message}`);
                errors.push(`admini: ${err?.message || err}`);
            }
        }
        for (const um of this.buildUserMails(items, settings.warnDays).filter(m => m.newCount)) {
            const lista = um.items.map(i => `${i.type.code || i.type.name} ${i.kind === 'EXPIRED' ? 'wygasło' : 'ważne do'} ${fmtDay(i.validUntil)}`).join(', ');
            try {
                await this.notifications.create(um.user.id, TRAINING_NOTIFICATION_TYPE, um.mail.subject.replace('[Ignite] ', ''), lista);
            } catch (err: any) { errors.push(`dzwonek ${um.user.name}: ${err?.message || err}`); }
            if (!um.user.email) { errors.push(`${um.user.name}: brak adresu e-mail`); continue; }
            try {
                await this.smtp.sendMail({ to: um.user.email, subject: um.mail.subject, html: um.mail.html });
                delivered++;
            } catch (err: any) {
                this.logger.error(`Alerty szkoleń — mail do ${um.user.email} nieudany: ${err?.message}`);
                errors.push(`${um.user.name}: ${err?.message || err}`);
            }
        }
        // Progi zapisujemy, gdy poszedł mail do adminów (albo adminów brak, a ktoś dostał) — inaczej
        // jutro spróbuje jeszcze raz.
        const ok = adminOk || (!admins.length && delivered > 0);
        if (ok) await this.prisma.trainingAlertLog.createMany({ data: fresh.map(i => ({ key: i.key })), skipDuplicates: true });
        return this.prisma.trainingAlertRun.create({
            data: { status: ok ? 'SENT' : 'ERROR', items: items.length, recipients: delivered, error: errors.length ? errors.join('; ').slice(0, 500) : null },
        });
    }

    // @anchor training-alert-send-test — bieżący podgląd na adres zalogowanego admina; nie
    // zapisuje progów, więc nie blokuje jutrzejszej prawdziwej wysyłki.
    async sendTest(userId: string) {
        const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!me?.email?.includes('@')) throw new BadRequestException('Twoje konto nie ma adresu e-mail');
        const { settings, items } = await this.computeAlerts();
        const mail = items.length
            ? this.buildMail(items, settings.warnDays)
            : { subject: '[Ignite] Szkolenia — test (brak pozycji)', html: '<p>Test powiadomień o szkoleniach: dziś żadne zaświadczenie nie kończy się w ciągu progu i nie ma braków w aktywnych zamówieniach.</p>' };
        await this.smtp.sendMail({ to: me.email, subject: `[TEST] ${mail.subject}`, html: mail.html });
        await this.prisma.trainingAlertRun.create({ data: { status: 'TEST', items: items.length, recipients: 1 } });
        return { ok: true, to: me.email };
    }
}
