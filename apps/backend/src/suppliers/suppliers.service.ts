import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { uploadPath } from '../common/uploads.util';
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
    shortCode?: string | null;
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
        // Skrót do numeru oferty: same litery A-Z (polskie znaki → łacińskie), dokładnie 3.
        if (input.shortCode !== undefined) {
            const code = String(input.shortCode || '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
                .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
            if (code && code.length !== 3) throw new BadRequestException('Skrót firmy musi mieć dokładnie 3 litery (A-Z)');
            data.shortCode = code || null;
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

    // @anchor suppliers-set-logo — logo firmy (nagłówek Opisu zakresu prac, gdy firma jest Zamawiającym).
    // Plik w uploads/supplier-logos/<id>.<ext>; poprzedni (inne rozszerzenie) jest usuwany.
    async setLogo(id: string, file: Express.Multer.File) {
        const supplier = await this.findOne(id);
        if (!file?.buffer?.length) throw new BadRequestException('Brak pliku');
        const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' } as Record<string, string>)[file.mimetype];
        if (!ext) throw new BadRequestException('Logo musi być obrazem PNG, JPG, SVG lub WEBP');
        if (file.size > 2 * 1024 * 1024) throw new BadRequestException('Logo może mieć najwyżej 2 MB');
        const stored = `supplier-logos/${id}.${ext}`;
        await fs.promises.mkdir(path.dirname(uploadPath(stored)), { recursive: true });
        await fs.promises.writeFile(uploadPath(stored), file.buffer);
        if (supplier.logoPath && supplier.logoPath !== stored) {
            await fs.promises.unlink(uploadPath(supplier.logoPath)).catch(() => {});
        }
        return this.prisma.supplier.update({ where: { id }, data: { logoPath: stored } });
    }

    // @anchor suppliers-logo-file
    async logoFile(id: string): Promise<string> {
        const supplier = await this.findOne(id);
        if (!supplier.logoPath) throw new NotFoundException('Firma nie ma logo');
        const full = uploadPath(supplier.logoPath);
        if (!fs.existsSync(full)) throw new NotFoundException('Plik logo nie istnieje');
        return full;
    }
}
