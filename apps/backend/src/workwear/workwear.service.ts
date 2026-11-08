import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// @anchor workwear-items — stałe kolumny tabeli; kolejne dodaje użytkownik (model WorkwearItem).
export const WORKWEAR_ITEMS = [
    { key: 'bluza', label: 'Bluza' },
    { key: 'spodnie', label: 'Spodnie' },
    { key: 'kurtka', label: 'Kurtka' },
    { key: 'okulary', label: 'Okulary' },
];

// @anchor workwear-scales
export const WORKWEAR_SCALES: Record<string, string[]> = {
    LETTER: ['S', 'M', 'L', 'XL', 'XXL'],
    NUMERIC: ['48', '50', '52', '54', '56', '58', '60', '62', '64'],
};

// @anchor workwear-service
@Injectable()
export class WorkwearService {
    constructor(private readonly prisma: PrismaService) {}

    private async listItems() {
        const added = await this.prisma.workwearItem.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
        return [...WORKWEAR_ITEMS, ...added.map(i => ({ key: i.id, label: i.name }))];
    }

    // @anchor workwear-add-item
    async addItem(rawName: string) {
        const name = String(rawName || '').trim();
        if (!name) throw new BadRequestException('Podaj nazwę pozycji');
        if (name.length > 40) throw new BadRequestException('Nazwa może mieć najwyżej 40 znaków');
        const items = await this.listItems();
        if (items.some(i => i.label.toLowerCase() === name.toLowerCase())) {
            throw new ConflictException('Taka pozycja już istnieje');
        }
        const created = await this.prisma.workwearItem.create({ data: { name } });
        return { key: created.id, label: created.name };
    }

    async overview() {
        const users = await this.prisma.user.findMany({
            where: { isActive: true },
            select: {
                id: true, firstName: true, lastName: true, email: true,
                workwear: { select: { item: true, sizeScale: true, size: true } },
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });
        return { items: await this.listItems(), scales: WORKWEAR_SCALES, users };
    }

    async setSize(userId: string, item: string, sizeScale: string, size: string | null) {
        if (!(await this.listItems()).some(i => i.key === item)) throw new BadRequestException('Nieznany element ubrania');
        const sizes = WORKWEAR_SCALES[sizeScale];
        if (!sizes) throw new BadRequestException('Nieznana rozmiarówka');
        const value = size || null;
        if (value && !sizes.includes(value)) throw new BadRequestException('Rozmiar spoza wybranej rozmiarówki');
        if (!(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
            throw new NotFoundException('Nie ma takiego pracownika');
        }
        return this.prisma.userWorkwear.upsert({
            where: { userId_item: { userId, item } },
            update: { sizeScale, size: value },
            create: { userId, item, sizeScale, size: value },
            select: { item: true, sizeScale: true, size: true },
        });
    }
}
