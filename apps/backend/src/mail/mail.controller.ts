import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MailService } from './mail.service';

// @anchor mail-controller
// Wysyłka eksportów mailem + podpowiedzi odbiorców. Dostępne dla każdego zalogowanego.
@Controller('mail')
@UseGuards(JwtAuthGuard)
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('send-export')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  sendExport(@UploadedFile() file: Express.Multer.File, @Body() body: any) {
    return this.mailService.sendExport(file, body);
  }

  @Get('recipients/:nodeId')
  recipients(@Param('nodeId') nodeId: string) {
    return this.mailService.getRecipients(nodeId);
  }
}
