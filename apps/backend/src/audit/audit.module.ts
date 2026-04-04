import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ClsModule } from 'nestjs-cls';

@Global()
@Module({
  imports: [ClsModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
