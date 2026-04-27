import { Module, forwardRef } from '@nestjs/common';
import { SchematicsController } from './schematics.controller';
import { SchematicsService } from './schematics.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AiModule)],
  controllers: [SchematicsController],
  providers: [SchematicsService],
  exports: [SchematicsService],
})
export class SchematicsModule {}
