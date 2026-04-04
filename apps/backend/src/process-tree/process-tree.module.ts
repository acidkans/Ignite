import { Module } from '@nestjs/common';
import { ProcessTreeController } from './process-tree.controller';
import { ProcessTreeService } from './process-tree.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [PrismaModule, AuthModule],
    controllers: [ProcessTreeController],
    providers: [ProcessTreeService],
    exports: [ProcessTreeService],
})
export class ProcessTreeModule { }
