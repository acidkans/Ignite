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
export class OneDriveController {
  constructor(
    private readonly oneDriveService: OneDriveService,
    private readonly config: ConfigService,
  ) {}

  // @anchor onedrive-auth-endpoint
  @Get('auth')
  @UseGuards(JwtAuthGuard)
  async auth(@Req() req: any) {
    const url = await this.oneDriveService.getAuthUrl(req.user.userId);
    return { url };
  }

  // @anchor onedrive-callback-endpoint
  // Publiczny — Microsoft przy redirectcie nie wysyła JWT; userId pochodzi z parametru `state`.
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') userId: string, @Res() res: Response) {
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:5174';
    try {
      await this.oneDriveService.handleCallback(code, userId);
      res.redirect(`${frontendUrl}/notification-settings?ms=connected`);
    } catch {
      res.redirect(`${frontendUrl}/notification-settings?ms=error`);
    }
  }

  // @anchor onedrive-status-endpoint
  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Req() req: any) {
    return this.oneDriveService.getStatus(req.user.userId);
  }

  // @anchor onedrive-browse-endpoint
  @Get('browse')
  @UseGuards(JwtAuthGuard)
  browse(@Req() req: any, @Query('parentId') parentId?: string) {
    return this.oneDriveService.browseFolders(req.user.userId, parentId);
  }

  // @anchor onedrive-set-folder-endpoint
  @Post('set-folder')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  listFiles(
    @Req() req: any,
    @Param('nodeId') nodeId: string,
    @Param('category') category: 'finanse' | 'dokumentacja',
  ) {
    return this.oneDriveService.listFiles(req.user.userId, nodeId, category);
  }

  // @anchor onedrive-access-token-endpoint
  @Get('access-token')
  @UseGuards(JwtAuthGuard)
  async accessToken(@Req() req: any) {
    const token = await this.oneDriveService.getValidToken(req.user.userId);
    return { accessToken: token };
  }

  // @anchor onedrive-disconnect-endpoint
  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  disconnect(@Req() req: any) {
    return this.oneDriveService.disconnect(req.user.userId);
  }
}
