import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AcceptanceProtocolsController } from './acceptance-protocols.controller';
import { AcceptanceProtocolsService } from './acceptance-protocols.service';

// @anchor acceptance-protocols-module
// Sam PLIK protokołu nie jest nigdzie przechowywany — archiwum dokumentów to OneDrive
// (`pliki_finansowe/<gałąź>`). W bazie siedzi wyłącznie rejestr odbiorów: co i za ile
// zostało odebrane, żeby kolejny protokół wiedział, ile pozycji jeszcze zostaje.
@Module({
    imports: [PrismaModule],
    controllers: [AcceptanceProtocolsController],
    providers: [AcceptanceProtocolsService],
})
export class AcceptanceProtocolsModule {}
