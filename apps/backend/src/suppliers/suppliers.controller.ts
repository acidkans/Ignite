import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NipLookupService } from './nip-lookup.service';
import { SuppliersService, SupplierUpsertInput } from './suppliers.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
// @anchor suppliers-controller
export class SuppliersController {
    constructor(
        private readonly service: SuppliersService,
        private readonly nipLookup: NipLookupService,
    ) { }

    // @anchor suppliers-get-endpoint — GET /suppliers → lista dostawców (aktywni najpierw).
    @Get()
    findAll() {
        return this.service.findAll();
    }

    // @anchor suppliers-nip-lookup-endpoint — GET /suppliers/nip-lookup/:nip →
    // {name, address, regon, vatStatus} z Białej listy VAT (prefill formularza w UI).
    // Musi być zadeklarowany przed GET :id.
    @Get('nip-lookup/:nip')
    async nipLookupEndpoint(@Param('nip') rawNip: string) {
        const nip = this.nipLookup.normalizeNip(rawNip);
        if (!nip || !this.nipLookup.validateNipChecksum(nip)) {
            throw new BadRequestException(`Nieprawidłowy NIP: ${rawNip}`);
        }
        const result = await this.nipLookup.lookup(nip);
        if (!result) throw new NotFoundException(`Brak podatnika o NIP ${nip} w Białej liście VAT`);
        return { nip, ...result };
    }

    // @anchor suppliers-get-one-endpoint
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    // @anchor suppliers-post-endpoint — POST /suppliers → tworzy dostawcę
    // (dedup po NIP: istniejący NIP odświeża i zwraca istniejącego).
    @Post()
    create(@Body() body: SupplierUpsertInput) {
        if (!body || (!body.name && !body.nip)) throw new BadRequestException('name lub nip jest wymagany');
        return this.service.create(body);
    }

    // @anchor suppliers-patch-endpoint
    @Patch(':id')
    update(@Param('id') id: string, @Body() body: SupplierUpsertInput) {
        return this.service.update(id, body);
    }
}
