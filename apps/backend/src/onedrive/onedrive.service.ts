import { Injectable, Logger, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfidentialClientApplication, AuthorizationCodeRequest } from '@azure/msal-node';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['Files.ReadWrite', 'offline_access', 'User.Read'];

// @anchor onedrive-service
@Injectable()
export class OneDriveService {
  private readonly logger = new Logger(OneDriveService.name);
  private msalClient: ConfidentialClientApplication;
  private encKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: this.config.get('MS_CLIENT_ID') || '',
        clientSecret: this.config.get('MS_CLIENT_SECRET') || '',
        authority: `https://login.microsoftonline.com/${this.config.get('MS_TENANT_ID') || 'common'}`,
      },
    });
    const raw = this.config.get<string>('MS_TOKEN_ENCRYPTION_KEY') || '';
    this.encKey = Buffer.from(raw.padEnd(32, '0').slice(0, 32));
  }

  // @anchor onedrive-get-auth-url
  getAuthUrl(userId: string): Promise<string> {
    return this.msalClient.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: this.config.get('MS_REDIRECT_URI'),
      state: userId,
    });
  }

  // @anchor onedrive-handle-callback
  async handleCallback(code: string, userId: string): Promise<void> {
    const tokenResponse = await this.msalClient.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: this.config.get('MS_REDIRECT_URI'),
    } as AuthorizationCodeRequest);

    const accessToken = this.encrypt(tokenResponse.accessToken);
    const refreshToken = this.encrypt((tokenResponse as any).refreshToken || '');
    const expiresAt = tokenResponse.expiresOn ?? new Date(Date.now() + 3600 * 1000);

    await this.prisma.userMsToken.upsert({
      where: { userId },
      create: {
        userId,
        accessToken,
        refreshToken,
        expiresAt,
        msAccountEmail: tokenResponse.account?.username,
        msDisplayName: tokenResponse.account?.name,
      },
      update: {
        accessToken,
        refreshToken,
        expiresAt,
        msAccountEmail: tokenResponse.account?.username,
        msDisplayName: tokenResponse.account?.name,
      },
    });
  }

  // @anchor onedrive-get-valid-token
  async getValidToken(userId: string): Promise<string> {
    const record = await this.prisma.userMsToken.findUnique({ where: { userId } });
    if (!record) throw new UnauthorizedException('Brak połączonego konta Microsoft');

    if (record.expiresAt > new Date()) {
      return this.decrypt(record.accessToken);
    }

    // token wygasł — odśwież
    const refreshToken = this.decrypt(record.refreshToken);
    const response = await axios.post(
      `https://login.microsoftonline.com/${this.config.get('MS_TENANT_ID') || 'common'}/oauth2/v2.0/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.get('MS_CLIENT_ID') || '',
        client_secret: this.config.get('MS_CLIENT_SECRET') || '',
        scope: SCOPES.join(' '),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await this.prisma.userMsToken.update({
      where: { userId },
      data: {
        accessToken: this.encrypt(access_token),
        refreshToken: this.encrypt(refresh_token || refreshToken),
        expiresAt,
      },
    });

    return access_token;
  }

  // @anchor onedrive-get-status
  async getStatus(userId: string): Promise<{ connected: boolean; msAccountEmail?: string; msDisplayName?: string }> {
    const record = await this.prisma.userMsToken.findUnique({ where: { userId } });
    if (!record) return { connected: false };
    return { connected: true, msAccountEmail: record.msAccountEmail, msDisplayName: record.msDisplayName };
  }

  // @anchor onedrive-disconnect
  async disconnect(userId: string): Promise<void> {
    await this.prisma.userMsToken.deleteMany({ where: { userId } });
  }

  // @anchor onedrive-set-node-folder
  async setNodeFolder(
    userId: string,
    nodeId: string,
    folderId: string,
    driveId: string,
    folderName: string,
  ): Promise<void> {
    const token = await this.getValidToken(userId);

    const [finanseId, dokumentacjaId] = await Promise.all([
      this.createFolder(token, driveId, folderId, 'pliki_finansowe'),
      this.createFolder(token, driveId, folderId, 'dokumentacja_projektowa'),
    ]);

    await this.prisma.processNode.update({
      where: { id: nodeId },
      data: { oneDriveFolderId: folderId, oneDriveDriveId: driveId, oneDriveFolderName: folderName, oneDriveFinanseId: finanseId, oneDriveDocumentacjaId: dokumentacjaId },
    });
  }

  // @anchor onedrive-upload-file
  async uploadFile(
    userId: string,
    nodeId: string,
    category: 'finanse' | 'dokumentacja',
    filename: string,
    buffer: Buffer,
    mimeType = 'application/octet-stream',
  ): Promise<{ webUrl: string; itemId: string }> {
    const node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
    if (!node?.oneDriveFolderId) throw new NotFoundException('Folder OneDrive nie jest powiązany z tą gałęzią');

    const token = await this.getValidToken(userId);
    const driveId = node.oneDriveDriveId;
    const folderId = category === 'finanse' ? node.oneDriveFinanseId : node.oneDriveDocumentacjaId;

    const uploadUrl = driveId
      ? `${GRAPH_BASE}/drives/${driveId}/items/${folderId}:/${encodeURIComponent(filename)}:/content`
      : `${GRAPH_BASE}/me/drive/items/${folderId}:/${encodeURIComponent(filename)}:/content`;

    const response = await axios.put(uploadUrl, buffer, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
    });

    return { webUrl: response.data.webUrl, itemId: response.data.id };
  }

  // @anchor onedrive-list-files
  async listFiles(userId: string, nodeId: string, category: 'finanse' | 'dokumentacja'): Promise<any[]> {
    const node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
    if (!node?.oneDriveFolderId) return [];

    const token = await this.getValidToken(userId);
    const driveId = node.oneDriveDriveId;
    const folderId = category === 'finanse' ? node.oneDriveFinanseId : node.oneDriveDocumentacjaId;
    if (!folderId) return [];

    const url = driveId
      ? `${GRAPH_BASE}/drives/${driveId}/items/${folderId}/children`
      : `${GRAPH_BASE}/me/drive/items/${folderId}/children`;

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { $select: 'id,name,size,webUrl,lastModifiedDateTime,file' },
    });

    return response.data.value ?? [];
  }

  // @anchor onedrive-create-folder
  private async createFolder(token: string, driveId: string | null, parentId: string, name: string): Promise<string> {
    const url = driveId
      ? `${GRAPH_BASE}/drives/${driveId}/items/${parentId}/children`
      : `${GRAPH_BASE}/me/drive/items/${parentId}/children`;

    const response = await axios.post(
      url,
      { name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
    return response.data.id;
  }

  // @anchor onedrive-encrypt
  private encrypt(text: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.encKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  // @anchor onedrive-decrypt
  private decrypt(text: string): string {
    const [ivHex, encHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', this.encKey, iv);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
