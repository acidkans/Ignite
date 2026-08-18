import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ConfigModule } from '@nestjs/config';
import { ProcessTreeModule } from '../process-tree/process-tree.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MaterialRequirementsController } from './material-requirements.controller';
import { MaterialRequirementsService } from './material-requirements.service';

@Module({
    imports: [PrismaModule, forwardRef(() => AiModule), ConfigModule, ProcessTreeModule, ExchangeRatesModule, NotificationsModule],
    controllers: [MaterialRequirementsController],
    providers: [MaterialRequirementsService],
    exports: [MaterialRequirementsService],
})
// @anchor material-requirements-module
export class MaterialRequirementsModule { }
