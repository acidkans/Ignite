import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ZAL_DIR, ZAL_NAME_RE, zalUploadOptions } from './zalaczniki.storage';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WatekMailService } from './watek-mail.service';
import { WatekMailRepliesService } from './watek-mail-replies.service';

// @anchor watek-mail-controller
// Maile z wątków gałęzi / pozycji Realizacji: wysyłka do zaznaczonych adresatów i odbiór odpowiedzi do wątku.
@Controller('watek-mail')
@UseGuards(JwtAuthGuard)
export class WatekMailController {
  constructor(private readonly mail: WatekMailService, private readonly replies: WatekMailRepliesService) {}

  // @anchor get-watek-mail-context
  @Get('order/:processNodeId/context')
  context(@Req() req: any, @Param('processNodeId') processNodeId: string, @Query('wbsNodeId') wbsNodeId: string) {
    return this.mail.context(req.user.userId, processNodeId, String(wbsNodeId || ''));
  }

  // @anchor get-watek-mail-list
  @Get('order/:processNodeId')
  list(@Param('processNodeId') processNodeId: string) {
    return this.mail.list(processNodeId);
  }

  // @anchor post-watek-mail-send
  @Post('send')
  send(@Req() req: any, @Body() dto: any) {
    return this.mail.send(req.user.userId, dto);
  }

  // @anchor post-watek-mail-zalacznik
  // Jeden plik do maila (Ctrl+V zrzutu ekranu albo „załącz”) — front dołącza { fileName, name, mime } do POST send.
  @Post('order/:processNodeId/zalaczniki')
  @UseInterceptors(FileInterceptor('file', zalUploadOptions))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Brak pliku');
    // multer podaje nazwę w latin1 — polskie znaki wracają po przekodowaniu
    const name = Buffer.from(file.originalname || file.filename, 'latin1').toString('utf8');
    return { fileName: file.filename, name, mime: file.mimetype, size: file.size };
  }

  // @anchor get-watek-mail-zalacznik
  // Plik załącznika (wysłanego albo odebranego) — za JWT, front pobiera go fetch-em jako blob.
  // `?name=` = nazwa do zapisu na dysku.
  @Get('zalaczniki/:fileName')
  download(@Param('fileName') fileName: string, @Query('name') name: string, @Res() res: Response) {
    if (!ZAL_NAME_RE.test(fileName)) throw new BadRequestException('Niedozwolona nazwa pliku');
    const full = path.join(ZAL_DIR, fileName);
    if (!fs.existsSync(full)) throw new NotFoundException('Brak pliku');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    if (name) res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(String(name).slice(0, 200))}`);
    return res.sendFile(full);
  }

  // @anchor post-watek-mail-check
  @Post('check')
  check(@Body() dto: any) {
    return this.replies.checkOrder(String(dto?.processNodeId || ''));
  }
}
