import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NipLookupService } from './nip-lookup.service';

// @anchor supplier-upsert-input
export type SupplierUpsertInput = {
    name?: string;
    nip?: string | null;
    address?: string | null;
    contactPerson?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    apiAdapter?: string | null;
    isActive?: boolean;
};

// @anchor suppliers-service
@Injectable()
export class SuppliersService {
    private readonly logger = new Logger(SuppliersService.name);

    constructor(
        private prisma: PrismaService,
        private nipLookup: NipLookupService,
    ) { }

    // @anchor suppliers-find-all — pełna lista do dropdownów; aktywni najpierw, potem alfabetycznie.
    findAll() {
        return this.prisma.supplier.findMany({
            orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        });
    }

    // @anchor suppliers-find-one
    async findOne(id: string) {
        const supplier = await this.prisma.supplier.findUnique({ where: { id } });
        if (!supplier) throw new NotFoundException('Supplier not found');
        return supplier;
    }

    // @anchor suppliers-create — dedup po NIP: wpis z istniejącym NIP podpina
    // istniejącego dostawcę i odświeża jego dane (bez duplikatu). Przy podanym NIP
    // dociąga dane z Białej listy VAT (nazwa/adres, stempel vatStatus+verifiedAt);
    // gdy Biała lista niedostępna — tworzy z danych przekazanych (furtka też dla
    // dostawcy zagranicznego bez NIP: wolny wpis, wystarczy name).
    async create(input: SupplierUpsertInput) {
        const data = await this.resolveWriteData(input);
        if (input.nip !== undefined && input.nip !== null && input.nip !== '') {
            const nip = data.nip as string; // resolveWriteData rzuca przy złym NIP
            const existing = await this.prisma.supplier.findUnique({ where: { nip } });
            if (existing) {
                this.logger.log(`Dedup NIP ${nip}: odświeżam istniejącego dostawcę ${existing.id}`);
                return this.prisma.supplier.update({ where: { id: existing.id }, data });
            }
        }
        if (!data.name) throw new BadRequestException('name jest wymagany (dostawca bez NIP lub Biała lista niedostępna)');
        return this.prisma.supplier.create({ data: data as any });
    }

    // @anchor suppliers-update — częściowa edycja; zmiana NIP wymusza ponowną
    // weryfikację w Białej liście i sprawdzenie kolizji z innym dostawcą.
    async update(id: string, input: SupplierUpsertInput) {
        await this.findOne(id);
        const data = await this.resolveWriteData(input);
        if (typeof data.nip === 'string') {
            const other = await this.prisma.supplier.findUnique({ where: { nip: data.nip } });
            if (other && other.id !== id) {
                throw new BadRequestException(`NIP ${data.nip} jest już przypisany do dostawcy „${other.name}"`);
            }
        }
        return this.prisma.supplier.update({ where: { id }, data });
    }

    // @anchor suppliers-resolve-write-data — wspólna walidacja NIP + wzbogacenie
    // danych z Białej listy dla create/update. Dane z Białej listy (nazwa, adres,
    // vatStatus, verifiedAt) nadpisują przekazane; reszta pól przechodzi 1:1.
    private async resolveWriteData(input: SupplierUpsertInput): Promise<Record<string, any>> {
        const data: Record<string, any> = {};
        for (const key of ['name', 'address', 'contactPerson', 'contactEmail', 'contactPhone', 'apiAdapter', 'isActive'] as const) {
            if (input[key] !== undefined) data[key] = input[key];
        }
        if (input.nip !== undefined) {
            if (input.nip === null || input.nip === '') {
                data.nip = null; // dostawca zagraniczny / wolny wpis
            } else {
                const nip = this.nipLookup.normalizeNip(input.nip);
                if (!nip || !this.nipLookup.validateNipChecksum(nip)) {
                    throw new BadRequestException(`Nieprawidłowy NIP: ${input.nip}`);
                }
                data.nip = nip;
                const found = await this.nipLookup.lookup(nip);
                if (found) {
                    data.name = found.name;
                    data.address = found.address ?? data.address ?? null;
                    data.vatStatus = found.vatStatus;
                    data.verifiedAt = new Date();
                }
            }
        }
        return data;
    }
}
