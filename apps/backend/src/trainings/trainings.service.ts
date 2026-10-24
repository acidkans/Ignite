import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveVersionId } from '../common/version.util';
import { orderClosureState } from '../common/order-closure.util';

// @anchor training-type-dto
export interface TrainingTypeDto {
    name?: string;
    code?: string | null;
    validityMonths?: number | string | null;
    description?: string | null;
    orderIds?: string[];
}

// @anchor user-training-dto
export interface UserTrainingDto {
    userId: string;
    trainingTypeId: string;
    completedAt: string;          // YYYY-MM-DD
    validUntil?: string | null;   // YYYY-MM-DD; brak = wyliczone z typu, null = bezterminowe
    certificateNo?: string | null;
}

// @anchor bulk-user-training-dto
export interface BulkUserTrainingDto {
    userIds: string[];
    trainingTypeIds: string[];
    completedAt: string;          // YYYY-MM-DD
    validUntil?: string | null;   // tylko przy jednym typie; brak = z okresu ważności każdego typu
    certificateNo?: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// @anchor parse-iso-day — data kalendarzowa (kolumna @db.Date) jako północ UTC: bez strefy,
// żeby 2027-03-12 z formularza nie zapisało się jako 2027-03-11 po przeliczeniu na UTC.
export const parseIsoDay = (value: string, field: string): Date => {
    if (!ISO_DAY.test(String(value || ''))) throw new BadRequestException(`Pole ${field}: oczekiwana data RRRR-MM-DD`);
    const d = new Date(`${value}T00:00:00Z`);
    if (isNaN(d.getTime())) throw new BadRequestException(`Pole ${field}: niepoprawna data`);
    return d;
};

// @anchor add-months-utc — koniec ważności = ukończenie + N miesięcy (31.01 + 1 → 03.03, jak `Date`).
export const addMonthsUtc = (d: Date, months: number): Date => {
    const out = new Date(d.getTime());
    out.setUTCMonth(out.getUTCMonth() + months);
    return out;
};

export const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

// @anchor trainings-service
@Injectable()
export class TrainingsService {
    constructor(private readonly prisma: PrismaService) {}

    // @anchor trainings-order-closure-map — stan zamknięcia każdego zamówienia liczony z tej samej
    // wersji co zakładka Realizacja: baseline (`acceptedVersionId`), a bez niego aktywny snapszot.
    async orderClosureMap(orderIds?: string[]) {
        const orders = await this.prisma.processNode.findMany({
            where: { type: 'order', ...(orderIds ? { id: { in: orderIds } } : {}) },
            select: { id: true, acceptedVersionId: true },
        });
        const result = new Map<string, ReturnType<typeof orderClosureState>>();
        for (const o of orders) {
            const versionId = o.acceptedVersionId ?? await resolveVersionId(this.prisma as any, o.id);
            const leaves = await this.prisma.wbsNode.findMany({
                where: { nodeId: o.id, versionId },
                select: { type: true, status: true, execStatus: true },
            });
            result.set(o.id, orderClosureState(leaves));
        }
        return result;
    }

    // @anchor trainings-overview — wszystko, czego potrzebuje widok Szkoleń, jednym zapytaniem:
    // pracownicy (z szkoleniami i przypisanymi zamówieniami), typy (z wymaganymi zamówieniami)
    // i zamówienia (z obszarem, etapem i stanem zamknięcia). Filtr „bez szkoleń nie pokazuj"
    // robi front — lista przypisania szkolenia potrzebuje wszystkich aktywnych osób.
    async overview() {
        const [users, types, orders] = await Promise.all([
            this.prisma.user.findMany({
                where: { isActive: true },
                select: {
                    id: true, firstName: true, lastName: true, email: true,
                    teams: { where: { orderNodeId: null }, select: { name: true } },
                    trainings: { select: { id: true, trainingTypeId: true, completedAt: true, validUntil: true, certificateNo: true } },
                    assignedOrders: { select: { orderId: true } },
                },
                orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            }),
            this.prisma.trainingType.findMany({
                include: { orders: { select: { orderId: true } } },
                orderBy: { name: 'asc' },
            }),
            this.prisma.processNode.findMany({
                where: { type: 'order' },
                select: { id: true, name: true, orderStage: true, parent: { select: { name: true } } },
                orderBy: { name: 'asc' },
            }),
        ]);
        const closure = await this.orderClosureMap(orders.map(o => o.id));
        return {
            users: users.map(u => ({
                id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email,
                team: u.teams.map(t => t.name).join(', '),
                trainings: u.trainings.map(t => ({ ...t, completedAt: isoDay(t.completedAt), validUntil: isoDay(t.validUntil) })),
                orderIds: u.assignedOrders.map(a => a.orderId),
            })),
            types: types.map(t => ({
                id: t.id, name: t.name, code: t.code, validityMonths: t.validityMonths, description: t.description,
                orderIds: t.orders.map(o => o.orderId),
            })),
            orders: orders.map(o => ({
                id: o.id, name: o.name, area: o.parent?.name || '', orderStage: o.orderStage,
                closed: closure.get(o.id)?.closed ?? false,
            })),
        };
    }

    private normalizeType(dto: TrainingTypeDto, partial: boolean) {
        const data: any = {};
        if (dto.name !== undefined || !partial) {
            const name = String(dto.name ?? '').trim();
            if (!name) throw new BadRequestException('Podaj nazwę szkolenia');
            data.name = name;
        }
        if (dto.code !== undefined) data.code = String(dto.code ?? '').trim() || null;
        if (dto.description !== undefined) data.description = String(dto.description ?? '').trim() || null;
        if (dto.validityMonths !== undefined) {
            const raw = dto.validityMonths;
            if (raw === null || raw === '') data.validityMonths = null;
            else {
                const n = Number(raw);
                if (!Number.isInteger(n) || n <= 0) throw new BadRequestException('Okres ważności musi być dodatnią liczbą całkowitą miesięcy');
                data.validityMonths = n;
            }
        }
        return data;
    }

    private async checkOrders(orderIds?: string[]) {
        if (!orderIds) return undefined;
        const ids = [...new Set(orderIds.filter(Boolean))];
        const found = await this.prisma.processNode.count({ where: { id: { in: ids }, type: 'order' } });
        if (found !== ids.length) throw new BadRequestException('Część wskazanych zamówień nie istnieje');
        return ids;
    }

    // @anchor trainings-create-type
    async createType(dto: TrainingTypeDto) {
        const data = this.normalizeType(dto, false);
        const orderIds = await this.checkOrders(dto.orderIds);
        if (await this.prisma.trainingType.findUnique({ where: { name: data.name } })) {
            throw new ConflictException('Typ szkolenia o tej nazwie już istnieje');
        }
        return this.prisma.trainingType.create({
            data: { ...data, orders: orderIds?.length ? { create: orderIds.map(orderId => ({ orderId })) } : undefined },
        });
    }

    // @anchor trainings-update-type — lista zamówień przychodzi w całości i zastępuje poprzednią.
    async updateType(id: string, dto: TrainingTypeDto) {
        if (!(await this.prisma.trainingType.findUnique({ where: { id } }))) throw new NotFoundException('Nie ma takiego typu szkolenia');
        const data = this.normalizeType(dto, true);
        if (data.name) {
            const clash = await this.prisma.trainingType.findUnique({ where: { name: data.name } });
            if (clash && clash.id !== id) throw new ConflictException('Typ szkolenia o tej nazwie już istnieje');
        }
        const orderIds = await this.checkOrders(dto.orderIds);
        return this.prisma.$transaction(async tx => {
            if (orderIds) {
                await tx.trainingTypeOrder.deleteMany({ where: { trainingTypeId: id } });
                if (orderIds.length) await tx.trainingTypeOrder.createMany({ data: orderIds.map(orderId => ({ trainingTypeId: id, orderId })) });
            }
            return tx.trainingType.update({ where: { id }, data });
        });
    }

    // @anchor trainings-delete-type — kasuje też szkolenia pracowników tego typu (Cascade);
    // front pyta o zgodę, podając ich liczbę.
    async deleteType(id: string) {
        if (!(await this.prisma.trainingType.findUnique({ where: { id } }))) throw new NotFoundException('Nie ma takiego typu szkolenia');
        await this.prisma.trainingType.delete({ where: { id } });
        return { ok: true };
    }

    // @anchor trainings-upsert-user-training — jedno aktualne szkolenie na parę pracownik × typ,
    // więc odnowienie nadpisuje wpis. `validUntil` pominięte = ukończenie + okres ważności typu.
    async upsertUserTraining(dto: UserTrainingDto) {
        const [user, type] = await Promise.all([
            this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true } }),
            this.prisma.trainingType.findUnique({ where: { id: dto.trainingTypeId } }),
        ]);
        if (!user) throw new BadRequestException('Nie ma takiego pracownika');
        if (!type) throw new BadRequestException('Nie ma takiego typu szkolenia');
        const completedAt = parseIsoDay(dto.completedAt, 'completedAt');
        let validUntil: Date | null;
        if (dto.validUntil === undefined) validUntil = type.validityMonths ? addMonthsUtc(completedAt, type.validityMonths) : null;
        else validUntil = dto.validUntil ? parseIsoDay(dto.validUntil, 'validUntil') : null;
        if (validUntil && validUntil < completedAt) throw new BadRequestException('Data ważności nie może być wcześniejsza niż data ukończenia');
        const data = { completedAt, validUntil, certificateNo: String(dto.certificateNo ?? '').trim() || null };
        return this.prisma.userTraining.upsert({
            where: { userId_trainingTypeId: { userId: dto.userId, trainingTypeId: dto.trainingTypeId } },
            create: { userId: dto.userId, trainingTypeId: dto.trainingTypeId, ...data },
            update: data,
        });
    }

    // @anchor trainings-bulk-user-trainings — wielu pracowników × wiele typów w jednym podejściu,
    // w jednej transakcji (wszystko albo nic). `validUntil` pominięte = liczone osobno dla każdego
    // typu z jego okresu ważności; podane wprost wolno tylko przy jednym typie.
    async bulkUpsertUserTrainings(dto: BulkUserTrainingDto) {
        const userIds = [...new Set(Array.isArray(dto?.userIds) ? dto.userIds.filter(Boolean) : [])];
        const typeIds = [...new Set(Array.isArray(dto?.trainingTypeIds) ? dto.trainingTypeIds.filter(Boolean) : [])];
        if (!userIds.length || !typeIds.length) throw new BadRequestException('Wybierz co najmniej jednego pracownika i jeden typ szkolenia');
        if (userIds.length * typeIds.length > 1000) throw new BadRequestException('Za dużo par naraz (limit 1000)');
        if (dto.validUntil !== undefined && typeIds.length > 1) throw new BadRequestException('Datę ważności można nadpisać tylko przy jednym typie szkolenia');
        const [users, types] = await Promise.all([
            this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
            this.prisma.trainingType.findMany({ where: { id: { in: typeIds } } }),
        ]);
        if (users.length !== userIds.length) throw new BadRequestException('Część wskazanych pracowników nie istnieje');
        if (types.length !== typeIds.length) throw new BadRequestException('Część wskazanych typów szkoleń nie istnieje');
        const completedAt = parseIsoDay(dto.completedAt, 'completedAt');
        const explicit = dto.validUntil === undefined ? undefined : dto.validUntil ? parseIsoDay(dto.validUntil, 'validUntil') : null;
        if (explicit && explicit < completedAt) throw new BadRequestException('Data ważności nie może być wcześniejsza niż data ukończenia');
        const certificateNo = String(dto.certificateNo ?? '').trim() || null;

        const existing = await this.prisma.userTraining.count({ where: { userId: { in: userIds }, trainingTypeId: { in: typeIds } } });
        await this.prisma.$transaction(types.flatMap(t => {
            const validUntil = explicit !== undefined ? explicit : t.validityMonths ? addMonthsUtc(completedAt, t.validityMonths) : null;
            const data = { completedAt, validUntil, certificateNo };
            return userIds.map(userId => this.prisma.userTraining.upsert({
                where: { userId_trainingTypeId: { userId, trainingTypeId: t.id } },
                create: { userId, trainingTypeId: t.id, ...data },
                update: data,
            }));
        }));
        const total = userIds.length * typeIds.length;
        return { total, created: total - existing, renewed: existing };
    }

    // @anchor trainings-delete-user-training
    async deleteUserTraining(id: string) {
        if (!(await this.prisma.userTraining.findUnique({ where: { id } }))) throw new NotFoundException('Nie ma takiego szkolenia');
        await this.prisma.userTraining.delete({ where: { id } });
        return { ok: true };
    }

    // @anchor trainings-set-user-orders — wielowybór w kolumnie „Zamówienia": pełna lista zastępuje poprzednią.
    async setUserOrders(userId: string, orderIds: string[]) {
        if (!Array.isArray(orderIds)) throw new BadRequestException('orderIds musi być listą');
        if (!(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new NotFoundException('Nie ma takiego pracownika');
        const ids = (await this.checkOrders(orderIds)) || [];
        await this.prisma.$transaction([
            this.prisma.userOrder.deleteMany({ where: { userId } }),
            ...(ids.length ? [this.prisma.userOrder.createMany({ data: ids.map(orderId => ({ userId, orderId })) })] : []),
        ]);
        return { userId, orderIds: ids };
    }
}
