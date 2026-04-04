import { Module } from '@nestjs/common';
import { DefaultProjectItemsService } from './default-project-items.service';
import { DefaultProjectItemsController } from './default-project-items.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [DefaultProjectItemsController],
    providers: [DefaultProjectItemsService],
})
export class DefaultProjectItemsModule { }
