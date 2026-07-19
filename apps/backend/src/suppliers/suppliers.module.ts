import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NipLookupService } from './nip-lookup.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
    imports: [PrismaModule],
    controllers: [SuppliersController],
    providers: [SuppliersService, NipLookupService],
    exports: [SuppliersService, NipLookupService],
})
// @anchor suppliers-module
export class SuppliersModule { }
