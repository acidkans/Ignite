import { Module } from '@nestjs/common';
import { SchematicsController } from './schematics.controller';
import { SchematicsService } from './schematics.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SchematicsController],
  providers: [SchematicsService],
  exports: [SchematicsService],
})
export class SchematicsModule {}
