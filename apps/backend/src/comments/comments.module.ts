import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';

@Module({
    imports: [PrismaModule, NotificationsModule, PushModule],
    controllers: [CommentsController],
    providers: [CommentsService],
    exports: [CommentsService],
})
export class CommentsModule {}
