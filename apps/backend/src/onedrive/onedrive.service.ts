import { Injectable, Logger, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
// Tasks.ReadWrite wymagany dla sync z MS To Do / Samsung Reminder
const SCOPES = 'Files.ReadWrite offline_access User.Read Tasks.ReadWrite';

// @anchor onedrive-service
@Injectable()
export class OneDriveService {
  private readonly logger = new Logger(OneDriveService.name);
  private encKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const raw = this.config.get<string>('MS_TOKEN_ENCRYPTION_KEY') || '';
    this.encKey = Buffer.from(raw.padEnd(32, '0').slice(0, 32));
  }

  private get clientId() { return this.config.get('MS_CLIENT_ID') || ''; }
  private get clientSecret() { return this.config.get('MS_CLIENT_SECRET') || ''; }
  private get tenant() { return this.config.get('MS_TENANT_ID') || 'common'; }
  private get redirectUri() { return this.config.get('MS_REDIRECT_URI') || ''; }
  private get tokenUrl() { return `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`; }

  // @anchor onedrive-get-auth-url
  getAuthUrl(userId: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: SCOPES,
      state: userId,
      response_mode: 'query',
    });
    return Promise.resolve(
      `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize?${params.toString()}`
    );
  }

  // @anchor onedrive-handle-callback
  async handleCallback(code: string, userId: string): Promise<void> {
    const response = await axios.post(this.tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: SCOPES,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Pobierz profil usera MS
    let msAccountEmail = '';
    let msDisplayName = '';
    try {
      const me = await axios.get(`${GRAPH_BASE}/me`, { headers: { Authorization: `Bearer ${access_token}` } });
      msAccountEmail = me.data.userPrincipalName || me.data.mail || '';
      msDisplayName = me.data.displayName || '';
    } catch { /* nieistotne */ }

    const accessToken = this.encrypt(access_token);
    const refreshToken = this.encrypt(refresh_token || '');

    await this.prisma.userMsToken.upsert({
      where: { userId },
      create: {
        userId,
        accessToken,
        refreshToken,
        expiresAt,
        msAccountEmail,
        msDisplayName,
      },
      update: {
        accessToken,
        refreshToken,
        expiresAt,
        msAccountEmail,
        msDisplayName,
        needsReauth: false, // nowy token ma pełne scope — czyść flagę
      },
    });
  }

  // @anchor onedrive-shared-token
  // Pliki zamówień żyją na JEDNYM dysku firmowym, więc wszystkie operacje plikowe idą przez
  // JEDNO konto Microsoft — konto usługowe wskazane w `MS_SHARED_ACCOUNT_EMAIL` (adres
  // użytkownika ERP, który podpiął OneDrive). Wcześniej każdy użytkownik zapisywał na SWOIM
  // koncie: kto nie miał podpiętego MS, dostawał „Brak połączonego konta", a folder zamówienia
  // i tak wskazywał na dysk kogoś innego.
  //
  // Bez zmiennej środowiskowej bierzemy najstarszy podpięty token — na jednokontowej instalacji
  // to dokładnie to samo konto, więc brak konfiguracji niczego nie psuje.
  //
  // UWAGA: `getValidToken(userId)` zostaje osobno dla MS To Do — tam synchronizują się PRYWATNE
  // zadania użytkownika i wspólne konto byłoby błędem.
  async getSharedToken(): Promise<string> {
    const email = this.config.get<string>('MS_SHARED_ACCOUNT_EMAIL') || '';
    const record = (email
      ? await this.prisma.userMsToken.findFirst({ where: { user: { email } } })
      : null)
      || await this.prisma.userMsToken.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!record) throw new UnauthorizedException('Konto Microsoft aplikacji nie jest podpięte — połącz OneDrive na koncie usługowym');
    return this.tokenFromRecord(record);
  }

  // @anchor onedrive-get-valid-token
  async getValidToken(userId: string): Promise<string> {
    const record = await this.prisma.userMsToken.findUnique({ where: { userId } });
    if (!record) throw new UnauthorizedException('Brak połączonego konta Microsoft');
    return this.tokenFromRecord(record);
  }

  // @anchor onedrive-token-from-record
  // Ważny access token z wpisu w bazie: świeży zwracamy wprost, wygasły odświeżamy refresh
  // tokenem i zapisujemy z powrotem pod TYM SAMYM `userId`, z którego wpis pochodzi.
  private async tokenFromRecord(
    record: { userId: string; accessToken: string; refreshToken: string; expiresAt: Date },
  ): Promise<string> {

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
        scope: SCOPES,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await this.prisma.userMsToken.update({
      where: { userId: record.userId },
      data: {
        accessToken: this.encrypt(access_token),
        refreshToken: this.encrypt(refresh_token || refreshToken),
        expiresAt,
      },
    });

    return access_token;
  }

  // @anchor onedrive-get-status
  // `connected` mówi o koncie, którym aplikacja NAPRAWDĘ zapisuje pliki — czyli o koncie
  // wspólnym. Gdyby pytać o token zalogowanego, każdy poza właścicielem konta usługowego
  // widziałby „niepołączone" i klikał autoryzację, mimo że zapis i tak idzie wspólnym kontem.
  // `own` zostaje osobno dla MS To Do, które synchronizuje prywatne zadania użytkownika.
  async getStatus(userId: string): Promise<{ connected: boolean; msAccountEmail?: string; msDisplayName?: string; shared: boolean; own: boolean }> {
    const wlasny = await this.prisma.userMsToken.findUnique({ where: { userId } });
    const email = this.config.get<string>('MS_SHARED_ACCOUNT_EMAIL') || '';
    const wspolny = (email
      ? await this.prisma.userMsToken.findFirst({ where: { user: { email } } })
      : null)
      || await this.prisma.userMsToken.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!wspolny) return { connected: false, shared: false, own: !!wlasny };
    return {
      connected: true,
      msAccountEmail: wspolny.msAccountEmail ?? undefined,
      msDisplayName: wspolny.msDisplayName ?? undefined,
      shared: wspolny.userId !== userId,
      own: !!wlasny,
    };
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
    const token = await this.getSharedToken();

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
  // `subfolder` — opcjonalny podkatalog W ŚRODKU folderu kategorii, zakładany przy pierwszym
  // zapisie i potem odnajdywany po nazwie (patrz `ensureSubfolder`). Używa go eksport protokołu
  // odbioru, który ląduje w `pliki_finansowe/<nazwa gałęzi WBS>`.
  async uploadFile(
    userId: string,
    nodeId: string,
    category: 'finanse' | 'dokumentacja',
    filename: string,
    buffer: Buffer,
    mimeType = 'application/octet-stream',
    subfolder?: string,
  ): Promise<{ webUrl: string; itemId: string }> {
    const node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
    if (!node?.oneDriveFolderId) throw new NotFoundException('Folder OneDrive nie jest powiązany z tą gałęzią');

    const token = await this.getSharedToken();
    const driveId = node.oneDriveDriveId;
    const categoryFolderId = await this.ensureCategoryFolder(token, node, category);
    const folderId = subfolder
      ? await this.ensureSubfolder(token, driveId, categoryFolderId, subfolder)
      : categoryFolderId;

    const uploadUrl = driveId
      ? `${GRAPH_BASE}/drives/${driveId}/items/${folderId}:/${encodeURIComponent(filename)}:/content?@microsoft.graph.conflictBehavior=rename`
      : `${GRAPH_BASE}/me/drive/items/${folderId}:/${encodeURIComponent(filename)}:/content?@microsoft.graph.conflictBehavior=rename`;

    const response = await axios.put(uploadUrl, buffer, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
    });

    return { webUrl: response.data.webUrl, itemId: response.data.id };
  }

  // @anchor onedrive-list-files
  async listFiles(userId: string, nodeId: string, category: 'finanse' | 'dokumentacja'): Promise<any[]> {
    const node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
    if (!node?.oneDriveFolderId) return [];

    const token = await this.getSharedToken();
    const driveId = node.oneDriveDriveId;
    const folderId = await this.ensureCategoryFolder(token, node, category).catch(() => null);
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

  // @anchor onedrive-download-file
  // Strumieniuje treść pliku z OneDrive przez Graph. itemId identyfikuje plik w obrębie drive'u.
  // Pobiera pre-autoryzowany `@microsoft.graph.downloadUrl` (bez nagłówka Authorization przy samym pobraniu),
  // dzięki czemu unikamy problemu z przekazywaniem Bearera przy redirectcie /content → storage host.
  async downloadFile(
    userId: string,
    nodeId: string,
    itemId: string,
  ): Promise<{ stream: NodeJS.ReadableStream; fileName: string; mimeType: string }> {
    const node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
    if (!node?.oneDriveFolderId) throw new NotFoundException('Folder OneDrive nie jest powiązany z tą gałęzią');

    const token = await this.getSharedToken();
    const driveId = node.oneDriveDriveId;
    const metaUrl = driveId
      ? `${GRAPH_BASE}/drives/${driveId}/items/${itemId}`
      : `${GRAPH_BASE}/me/drive/items/${itemId}`;

    const meta = await axios.get(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
    const downloadUrl = meta.data['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) throw new NotFoundException('Nie można pobrać treści pliku z OneDrive');

    const fileName = meta.data.name || 'plik';
    const mimeType = meta.data.file?.mimeType || 'application/octet-stream';
    const fileRes = await axios.get(downloadUrl, { responseType: 'stream' });
    return { stream: fileRes.data, fileName, mimeType };
  }

  // @anchor onedrive-browse-folders
  // Listuje podfoldery OneDrive (for Business) przez Graph — zastępuje konsumencki picker js.live.net.
  async browseFolders(userId: string, parentId?: string): Promise<{ id: string; name: string; driveId: string; childCount: number }[]> {
    const token = await this.getSharedToken();
    const url = parentId
      ? `${GRAPH_BASE}/me/drive/items/${parentId}/children`
      : `${GRAPH_BASE}/me/drive/root/children`;

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { $select: 'id,name,folder,parentReference', $top: 200 },
    });

    return (response.data.value ?? [])
      .filter((it: any) => it.folder)
      .map((it: any) => ({
        id: it.id,
        name: it.name,
        driveId: it.parentReference?.driveId || '',
        childCount: it.folder?.childCount ?? 0,
      }));
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

  // @anchor onedrive-ensure-subfolder
  // Podkatalog „załóż albo znajdź". `createFolder` NIE nadaje się do powtarzalnego wywołania —
  // ma `conflictBehavior: 'rename'`, więc drugi protokół z tej samej gałęzi trafiłby do
  // „Uszczelnienie przejść 1", trzeci do „… 2". Tutaj najpierw szukamy po nazwie, a zakładamy
  // dopiero gdy nie ma; przy wyścigu dwóch zapisów `fail` zwraca 409 i wtedy szukamy ponownie.
  // @anchor onedrive-ensure-category-folder
  // Zwraca AKTUALNE id folderu kategorii (`pliki_finansowe` / `dokumentacja_projektowa`).
  // Id zapisane przy wiązaniu zamówienia bywa martwe: folder skasowany albo odtworzony ręcznie
  // na OneDrive dostaje nowe id, a Graph odpowiada wtedy 404 i eksport wywalał się komunikatem
  // „nie udało się zapisać", mimo że folder projektu istniał. Dlatego id jest WERYFIKOWANE,
  // a przy braku trafienia katalog zakładany na nowo po nazwie i zapisywany do bazy.
  private async ensureCategoryFolder(
    token: string,
    node: { id: string; oneDriveDriveId: string | null; oneDriveFolderId: string | null; oneDriveFinanseId: string | null; oneDriveDocumentacjaId: string | null },
    category: 'finanse' | 'dokumentacja',
  ): Promise<string> {
    const driveId = node.oneDriveDriveId;
    const zapisane = category === 'finanse' ? node.oneDriveFinanseId : node.oneDriveDocumentacjaId;
    const nazwa = category === 'finanse' ? 'pliki_finansowe' : 'dokumentacja_projektowa';

    if (zapisane) {
      const url = driveId
        ? `${GRAPH_BASE}/drives/${driveId}/items/${zapisane}`
        : `${GRAPH_BASE}/me/drive/items/${zapisane}`;
      try {
        await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, params: { $select: 'id' } });
        return zapisane;
      } catch {
        this.logger.warn(`Folder „${nazwa}" zamówienia ${node.id} nie istnieje pod zapisanym id — zakładam ponownie`);
      }
    }

    if (!node.oneDriveFolderId) throw new NotFoundException('Folder OneDrive nie jest powiązany z tą gałęzią');
    const swieze = await this.ensureSubfolder(token, driveId, node.oneDriveFolderId, nazwa);
    await this.prisma.processNode.update({
      where: { id: node.id },
      data: category === 'finanse' ? { oneDriveFinanseId: swieze } : { oneDriveDocumentacjaId: swieze },
    });
    return swieze;
  }

  private async ensureSubfolder(
    token: string,
    driveId: string | null,
    parentId: string,
    name: string,
  ): Promise<string> {
    // OneDrive odrzuca w nazwach " * : < > ? / \ | — nazwa gałęzi WBS bywa zdaniem z ukośnikiem.
    const safe = String(name).replace(/["*:<>?/\\|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!safe) return parentId;

    const base = driveId ? `${GRAPH_BASE}/drives/${driveId}/items/${parentId}` : `${GRAPH_BASE}/me/drive/items/${parentId}`;
    const headers = { Authorization: `Bearer ${token}` };

    const znajdz = async (): Promise<string | null> => {
      try {
        const res = await axios.get(`${base}/children?$select=id,name,folder&$top=200`, { headers });
        const hit = (res.data?.value || []).find((it: any) => it.folder && it.name === safe);
        return hit?.id ?? null;
      } catch {
        return null;
      }
    };

    const istniejacy = await znajdz();
    if (istniejacy) return istniejacy;

    try {
      const res = await axios.post(
        `${base}/children`,
        { name: safe, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
      return res.data.id;
    } catch (e: any) {
      if (e?.response?.status === 409) {
        const powtorka = await znajdz();
        if (powtorka) return powtorka;
      }
      this.logger.warn(`Nie udało się założyć podkatalogu „${safe}" — zapis idzie do folderu kategorii`);
      return parentId;
    }
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
