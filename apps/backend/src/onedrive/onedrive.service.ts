import { Injectable, Logger, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_FOLDERS, ORDER_ROOT_FOLDERS, OrderRootKey, orderFolderPath } from './order-folders';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
// Tasks.ReadWrite wymagany dla sync z MS To Do / Samsung Reminder
const SCOPES = 'Files.ReadWrite offline_access User.Read Tasks.ReadWrite';

// @anchor order-folders-result
export interface OrderFoldersResult {
  created: string[];
  existing: number;
  errors: string[];
  folderIds: Record<string, string>;
}

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
  // Wiąże folder OneDrive z zamówieniem i zakłada w nim strukturę `ORDER_FOLDERS`.
  // Stare katalogi `pliki_finansowe` / `dokumentacja_projektowa` nie są już zakładane z góry —
  // do czasu przepięcia eksportów na nową strukturę `ensureCategoryFolder` utworzy je przy pierwszym zapisie.
  // Ich id są zerowane, bo przy zmianie folderu wskazywałyby na katalogi poprzedniego folderu.
  async setNodeFolder(
    userId: string,
    nodeId: string,
    folderId: string,
    driveId: string,
    folderName: string,
  ): Promise<OrderFoldersResult> {
    await this.prisma.processNode.update({
      where: { id: nodeId },
      data: {
        oneDriveFolderId: folderId,
        oneDriveDriveId: driveId,
        oneDriveFolderName: folderName,
        oneDriveFinanseId: null,
        oneDriveDocumentacjaId: null,
        oneDriveFolderIds: Prisma.DbNull,
      },
    });
    return this.ensureOrderFolders(nodeId);
  }

  // @anchor onedrive-ensure-order-folders
  // Zakłada brakujące katalogi z `ORDER_FOLDERS` w folderze zamówienia i zapisuje ich id
  // w `ProcessNode.oneDriveFolderIds` (klucze: `root:<finance|project|realization>` i `key` podkatalogu).
  // Można wołać wielokrotnie: istniejący katalog jest rozpoznawany najpierw po zapisanym id
  // (przetrwa zmianę nazwy na OneDrive), potem po nazwie; zakładany jest tylko brakujący.
  async ensureOrderFolders(nodeId: string): Promise<OrderFoldersResult> {
    const node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
    if (!node?.oneDriveFolderId) throw new NotFoundException('Folder OneDrive nie jest powiązany z tą gałęzią');

    const token = await this.getSharedToken();
    const driveId = node.oneDriveDriveId;
    const saved = (node.oneDriveFolderIds as Record<string, string> | null) || {};
    const folderIds: Record<string, string> = {};
    const created: string[] = [];
    const errors: string[] = [];

    // Jeden odczyt listy dzieci na rodzica, potem dopasowanie wszystkich wpisów tego poziomu.
    const ensureLevel = async (parentId: string, entries: { idKey: string; name: string; label: string }[]) => {
      let children: { id: string; name: string }[];
      try {
        children = await this.listChildFolders(token, driveId, parentId);
      } catch (e: any) {
        for (const en of entries) errors.push(`${en.label}: ${e?.response?.status === 404 ? 'katalog nadrzędny nie istnieje' : e?.message || 'błąd odczytu'}`);
        return;
      }
      for (const en of entries) {
        const byId = saved[en.idKey] && children.find((c) => c.id === saved[en.idKey]);
        const byName = children.find((c) => c.name === en.name);
        const hit = byId || byName;
        if (hit) { folderIds[en.idKey] = hit.id; continue; }
        try {
          folderIds[en.idKey] = await this.createChildFolder(token, driveId, parentId, en.name);
          created.push(en.label);
        } catch (e: any) {
          errors.push(`${en.label}: ${e?.response?.data?.error?.message || e?.message || 'nie udało się założyć'}`);
        }
      }
    };

    const rootKeys = Object.keys(ORDER_ROOT_FOLDERS) as OrderRootKey[];
    await ensureLevel(node.oneDriveFolderId, rootKeys.map((r) => ({ idKey: `root:${r}`, name: ORDER_ROOT_FOLDERS[r], label: ORDER_ROOT_FOLDERS[r] })));
    for (const r of rootKeys) {
      const rootId = folderIds[`root:${r}`];
      if (!rootId) continue;
      const defs = ORDER_FOLDERS.filter((f) => f.root === r);
      await ensureLevel(rootId, defs.map((f) => ({ idKey: f.key, name: f.name, label: `${ORDER_ROOT_FOLDERS[r]}/${f.name}` })));
    }

    await this.prisma.processNode.update({ where: { id: nodeId }, data: { oneDriveFolderIds: folderIds } });
    if (errors.length) this.logger.warn(`Struktura katalogów zamówienia ${nodeId} niepełna: ${errors.join('; ')}`);
    return { created, existing: Object.keys(folderIds).length - created.length, errors, folderIds };
  }

  // @anchor onedrive-list-child-folders
  private async listChildFolders(token: string, driveId: string | null, parentId: string): Promise<{ id: string; name: string }[]> {
    const base = driveId ? `${GRAPH_BASE}/drives/${driveId}/items/${parentId}` : `${GRAPH_BASE}/me/drive/items/${parentId}`;
    const out: { id: string; name: string }[] = [];
    let url: string | null = `${base}/children?$select=id,name,folder&$top=200`;
    while (url) {
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      for (const it of res.data?.value || []) if (it.folder) out.push({ id: it.id, name: it.name });
      url = res.data?.['@odata.nextLink'] || null;
    }
    return out;
  }

  // @anchor onedrive-create-child-folder
  // `conflictBehavior: fail` — przy wyścigu (katalog założony w międzyczasie) 409 → szukamy po nazwie.
  private async createChildFolder(token: string, driveId: string | null, parentId: string, name: string): Promise<string> {
    const base = driveId ? `${GRAPH_BASE}/drives/${driveId}/items/${parentId}` : `${GRAPH_BASE}/me/drive/items/${parentId}`;
    try {
      const res = await axios.post(
        `${base}/children`,
        { name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      return res.data.id;
    } catch (e: any) {
      if (e?.response?.status !== 409) throw e;
      const hit = (await this.listChildFolders(token, driveId, parentId)).find((c) => c.name === name);
      if (!hit) throw e;
      return hit.id;
    }
  }

  // @anchor onedrive-upload-file
  // Zapis pliku z aplikacji (eksport, upload w zakładce, raport AI) do katalogu struktury `folderKey`.
  // `subfolder` — podkatalog W ŚRODKU katalogu struktury (protokoły odbioru: `<gałąź WBS>`).
  // `replaceItemId` — podmiana treści istniejącego pliku (ponowny upload tego samego dokumentu),
  // zamiast tworzenia kopii „nazwa 1.pdf”.
  // Każdy zapis trafia do rejestru `DriveFile` jako `source = 'app'` z `processedTag = cTag` —
  // synchronizacja rozpozna go po id i nie zaimportuje drugi raz.
  async uploadFile(
    nodeId: string,
    folderKey: string,
    filename: string,
    buffer: Buffer,
    mimeType = 'application/octet-stream',
    opts: { subfolder?: string; replaceItemId?: string; documentId?: string; status?: string } = {},
  ): Promise<{ webUrl: string; itemId: string; path: string }> {
    const def = ORDER_FOLDERS.find((f) => f.key === folderKey);
    if (!def) throw new NotFoundException(`Nieznany katalog OneDrive: ${folderKey}`);
    const node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
    if (!node?.oneDriveFolderId) throw new NotFoundException('Folder OneDrive nie jest powiązany z tą gałęzią');

    const token = await this.getSharedToken();
    const driveId = node.oneDriveDriveId;
    const base = driveId ? `${GRAPH_BASE}/drives/${driveId}` : `${GRAPH_BASE}/me/drive`;
    const folderId = await this.ensureOrderFolder(token, node, folderKey);
    const parentId = opts.subfolder ? await this.ensureSubfolder(token, driveId, folderId, opts.subfolder) : folderId;

    let item: any = null;
    if (opts.replaceItemId) {
      item = await this.putContent(token, `${base}/items/${opts.replaceItemId}`, buffer, mimeType).catch((e) => {
        // Plik skasowany na OneDrive w międzyczasie — zapisujemy jako nowy.
        if (e?.response?.status === 404) return null;
        throw e;
      });
    }
    if (!item) {
      item = await this.putContent(token, `${base}/items/${parentId}:/${encodeURIComponent(filename)}:`, buffer, mimeType, 'rename');
    }

    await this.prisma.driveFile.upsert({
      where: { driveItemId: item.id },
      create: {
        nodeId, driveId: item.parentReference?.driveId || driveId || '', driveItemId: item.id, parentItemId: item.parentReference?.id || parentId,
        folderKey, name: item.name, mimeType, size: item.size ?? buffer.length, cTag: item.cTag ?? null, processedTag: item.cTag ?? null,
        webUrl: item.webUrl ?? null, documentId: opts.documentId ?? null, status: opts.status ?? 'skipped', source: 'app',
        hash: item.file?.hashes?.quickXorHash ?? null,
      },
      update: {
        name: item.name, size: item.size ?? buffer.length, cTag: item.cTag ?? null, processedTag: item.cTag ?? null, webUrl: item.webUrl ?? null,
        hash: item.file?.hashes?.quickXorHash ?? null,
        ...(opts.documentId ? { documentId: opts.documentId } : {}), ...(opts.status ? { status: opts.status } : {}), error: null,
      },
    });

    const path = [orderFolderPath(folderKey), opts.subfolder].filter(Boolean).join('/');
    return { webUrl: item.webUrl, itemId: item.id, path };
  }

  // @anchor onedrive-put-content
  // Zapis treści: do 4 MB jednym PUT, większe przez upload session w kawałkach 10 MB
  // (wielokrotność 320 KiB, wymóg Graph). `target` to `items/{id}` (podmiana) albo `items/{parent}:/{nazwa}:` (nowy).
  private async putContent(token: string, target: string, buffer: Buffer, mimeType: string, conflict?: 'rename'): Promise<any> {
    const headers = { Authorization: `Bearer ${token}` };
    const SIMPLE_LIMIT = 4 * 1024 * 1024;
    if (buffer.length <= SIMPLE_LIMIT) {
      const q = conflict ? `?@microsoft.graph.conflictBehavior=${conflict}` : '';
      const res = await axios.put(`${target}/content${q}`, buffer, { headers: { ...headers, 'Content-Type': mimeType }, maxBodyLength: Infinity });
      return res.data;
    }
    const session = await axios.post(
      `${target}/createUploadSession`,
      { item: { '@microsoft.graph.conflictBehavior': conflict || 'replace' } },
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
    const uploadUrl: string = session.data.uploadUrl;
    const CHUNK = 10 * 1024 * 1024;
    let last: any = null;
    for (let start = 0; start < buffer.length; start += CHUNK) {
      const end = Math.min(start + CHUNK, buffer.length);
      // uploadUrl jest pre-autoryzowany — bez nagłówka Authorization.
      last = await axios.put(uploadUrl, buffer.subarray(start, end), {
        headers: { 'Content-Length': String(end - start), 'Content-Range': `bytes ${start}-${end - 1}/${buffer.length}` },
        maxBodyLength: Infinity,
      });
    }
    return last?.data;
  }

  // @anchor onedrive-ensure-order-folder
  // Aktualne id katalogu struktury: zapisane id weryfikowane w Graph, przy braku — uzupełnienie struktury.
  private async ensureOrderFolder(token: string, node: { id: string; oneDriveDriveId: string | null; oneDriveFolderIds: any }, folderKey: string): Promise<string> {
    const saved = (node.oneDriveFolderIds as Record<string, string> | null)?.[folderKey];
    if (saved) {
      const base = node.oneDriveDriveId ? `${GRAPH_BASE}/drives/${node.oneDriveDriveId}` : `${GRAPH_BASE}/me/drive`;
      try {
        await axios.get(`${base}/items/${saved}`, { headers: { Authorization: `Bearer ${token}` }, params: { $select: 'id' } });
        return saved;
      } catch {
        this.logger.warn(`Katalog „${folderKey}" zamówienia ${node.id} nie istnieje pod zapisanym id — uzupełniam strukturę`);
      }
    }
    const res = await this.ensureOrderFolders(node.id);
    const id = res.folderIds[folderKey];
    if (!id) throw new NotFoundException(`Nie udało się założyć katalogu ${orderFolderPath(folderKey)}: ${res.errors.join('; ')}`);
    return id;
  }

  // @anchor onedrive-list-files
  async listFiles(userId: string, nodeId: string, category: 'finanse' | 'dokumentacja'): Promise<any[]> {
    const node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
    if (!node?.oneDriveFolderId) return [];

    const token = await this.getSharedToken();
    const driveId = node.oneDriveDriveId;
    // Tylko odczyt: brak starego katalogu = pusta lista. Zakładanie go tutaj tworzyło
    // `dokumentacja_projektowa` w każdym folderze zamówienia przy samym otwarciu zakładki Dokumentacja.
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

  // @anchor onedrive-ensure-category-folder
  // Id STAREGO katalogu kategorii (`pliki_finansowe` / `dokumentacja_projektowa`) — tylko do odczytu archiwum
  // w `listFiles`. Nowe zapisy idą do struktury ORDER_FOLDERS; stare katalogi nie są już zakładane.
  // Zapisane id jest weryfikowane (katalog mógł zostać skasowany/odtworzony), przy braku — szukanie po nazwie.
  private async ensureCategoryFolder(
    token: string,
    node: { id: string; oneDriveDriveId: string | null; oneDriveFolderId: string | null; oneDriveFinanseId: string | null; oneDriveDocumentacjaId: string | null },
    category: 'finanse' | 'dokumentacja',
  ): Promise<string | null> {
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
    const swieze = (await this.listChildFolders(token, driveId, node.oneDriveFolderId)).find((c) => c.name === nazwa)?.id ?? null;
    if (!swieze) return null;
    await this.prisma.processNode.update({
      where: { id: node.id },
      data: category === 'finanse' ? { oneDriveFinanseId: swieze } : { oneDriveDocumentacjaId: swieze },
    });
    return swieze;
  }

  // @anchor onedrive-ensure-subfolder
  // Podkatalog „załóż albo znajdź” (np. protokoły: `Protokoły odbioru/<gałąź WBS>`). Najpierw szukamy po
  // nazwie, zakładamy dopiero gdy nie ma — zakładanie z `conflictBehavior: rename` dawałoby „Gałąź 1”, „Gałąź 2”.
  // Przy wyścigu dwóch zapisów `fail` zwraca 409 i wtedy szukamy ponownie.
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
