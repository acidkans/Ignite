import {
  Controller, Get, Post, Delete, Query, Body, Req, Res, UseGuards,
  UploadedFile, UseInterceptors, Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OneDriveService } from './onedrive.service';
import { ConfigService } from '@nestjs/config';

// @anchor onedrive-controller
@Controller('onedrive')
@UseGuards(JwtAuthGuard)
export class OneDriveController {
  constructor(
    private readonly oneDriveService: OneDriveService,
    private readonly config: ConfigService,
  ) {}

  // @anchor onedrive-auth-endpoint
  @Get('auth')
  async auth(@Req() req: any, @Res() res: Response) {
    const url = await this.oneDriveService.getAuthUrl(req.user.userId);
    res.redirect(url);
  }

  // @anchor onedrive-callback-endpoint
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') userId: string, @Res() res: Response) {
    await this.oneDriveService.handleCallback(code, userId);
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings?onedrive=connected`);
  }

  // @anchor onedrive-status-endpoint
  @Get('status')
  status(@Req() req: any) {
    return this.oneDriveService.getStatus(req.user.userId);
  }

  // @anchor onedrive-set-folder-endpoint
  @Post('set-folder')
  setFolder(
    @Req() req: any,
    @Body() body: { nodeId: string; folderId: string; driveId: string; folderName: string },
  ) {
    return this.oneDriveService.setNodeFolder(
      req.user.userId, body.nodeId, body.folderId, body.driveId, body.folderName,
    );
  }

  // @anchor onedrive-upload-endpoint
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  upload(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { nodeId: string; category: 'finanse' | 'dokumentacja' },
  ) {
    const filename = Buffer.from(file.originalname || 'eksport', 'latin1').toString('utf8');
    return this.oneDriveService.uploadFile(
      req.user.userId, body.nodeId, body.category, filename, file.buffer, file.mimetype,
    );
  }

  // @anchor onedrive-files-endpoint
  @Get('files/:nodeId/:category')
  listFiles(
    @Req() req: any,
    @Param('nodeId') nodeId: string,
    @Param('category') category: 'finanse' | 'dokumentacja',
  ) {
    return this.oneDriveService.listFiles(req.user.userId, nodeId, category);
  }

  // @anchor onedrive-access-token-endpoint
  @Get('access-token')
  async accessToken(@Req() req: any) {
    const token = await this.oneDriveService.getValidToken(req.user.userId);
    return { accessToken: token };
  }

  // @anchor onedrive-disconnect-endpoint
  @Delete('disconnect')
  disconnect(@Req() req: any) {
    return this.oneDriveService.disconnect(req.user.userId);
  }
}
