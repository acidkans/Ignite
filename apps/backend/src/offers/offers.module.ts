import { Module, forwardRef } from '@nestjs/common';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MaterialRequirementsModule } from '../material-requirements/material-requirements.module';

@Module({
    imports: [PrismaModule, forwardRef(() => MaterialRequirementsModule)],
    controllers: [OffersController],
    providers: [OffersService],
})
export class OffersModule {}
