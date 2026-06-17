import { Module, Global } from '@nestjs/common';
import { SmtpService } from './smtp.service';
import { SmtpController } from './smtp.controller';

// @anchor smtp-module
// Global — SmtpService dostępny wszędzie (MailModule, AuthModule itd.) bez ręcznego importu.
@Global()
@Module({
  controllers: [SmtpController],
  providers: [SmtpService],
  exports: [SmtpService],
})
export class SmtpModule {}
