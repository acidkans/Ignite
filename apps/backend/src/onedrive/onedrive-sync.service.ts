import { Injectable, Logger, NotFoundException, ConflictException, OnModuleInit } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService, DocumentUploadedEvent } from '../documents/documents.service';
import { OneDriveService } from './onedrive.service';
import { ORDER_FOLDERS, UPLOAD_CATEGORY_FOLDER, orderFolderPath } from './order-folders';
import { uploadPath } from '../common/uploads.util';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const DELTA_SELECT = 'id,name,folder,file,parentReference,cTag,size,lastModifiedDateTime,webUrl,deleted';
// Stare katalogi sprzed struktury ORDER_FOLDERS — zostają na OneDrive bez zmian, sync ich nie importuje.
const LEGACY_KEY = '__legacy';
const LEGACY_NAMES = ['pliki_finansowe', 'dokumentacja_projektowa'];
const MAX_ATTEMPTS = 3;
// @anchor onedrive-sync-archive-area
// Gałąź z zamówieniami archiwalnymi — rozpoznawana po nazwie obszaru (tak jak w drzewie aplikacji).
const ARCHIVE_AREA_NAME = 'Archiwum';
// Indeksujemy tylko formaty, z których `indexDocumentBuffer` wyciąga sensowny tekst.
// Reszta (XLSX, zdjęcia, filmy) jest pobierana i widoczna w aplikacji, ale nie trafia do Qdrant.
const INDEXABLE_MIME = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/)/;
const MAX_INDEX_BYTES = 50 * 1024 * 1024;
// Kopia pliku usuniętego z OneDrive (lub z aplikacji) zostaje na serwerze tyle dni — na wypadek pomyłki.
const KEEP_DELETED_DAYS = 30;

// @anchor onedrive-sync-result
export interface OneDriveSyncResult {
  newFiles: number;
  changed: number;
  deleted: number;
  pending: number;
  fullSync: boolean;
}

// @anchor onedrive-sync-service
// Synchronizacja folderu zamówienia z OneDrive (etap 2, docs/PLAN-onedrive-sync.md):
// 1. `syncNode` — Graph delta query od zapisanego `oneDriveDeltaLink` → rejestr `DriveFile`
//    (pliki i katalogi), katalog struktury → `folderKey`, zmiana treści (`cTag`) → status `pending`.
// 2. `processQueue` — w tle pobiera pliki `pending` na serwer (`uploads/<nodeId>/<katalog>/`),
//    tworzy/aktualizuje dokument i indeksuje go dla AI, jeśli katalog ma `index: true`.
// Analiza AI czyta potem tylko z serwera — nigdy z OneDrive.
@Injectable()
export class OneDriveSyncService implements OnModuleInit {
  private readonly logger = new Logger(OneDriveSyncService.name);
  private readonly syncing = new Set<string>();
  private queueBusy = false;
  private pausedUntil = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneDrive: OneDriveService,
    private readonly documents: DocumentsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.documents.onDocumentUploaded((e) => this.pushDocument(e));
  }

  // @anchor onedrive-push-document
  // Plik wgrany w aplikacji (zakładka Dokumentacja / Pliki finansowe, raport AI) → kopia w katalogu
  // struktury na OneDrive. Ponowny upload tego samego dokumentu podmienia treść pliku zamiast tworzyć kopię.
  // Rekord `DriveFile` dostaje `documentId` i `processedTag = cTag` — synchronizacja nie zaimportuje go ponownie.
  async pushDocument(e: DocumentUploadedEvent): Promise<void> {
    const folderKey = e.folderKey || UPLOAD_CATEGORY_FOLDER[e.category ?? 'standard'];
    const def = ORDER_FOLDERS.find((d) => d.key === folderKey);
    if (!def) return;
    const node = await this.prisma.processNode.findUnique({ where: { id: e.nodeId }, select: { oneDriveFolderId: true } });
    if (!node?.oneDriveFolderId) return;
    if (await this.syncBlockedReason(e.nodeId)) return;

    try {
      const existing = await this.prisma.driveFile.findFirst({ where: { documentId: e.documentId, status: { not: 'deleted' } } });
      const buffer = await fs.promises.readFile(uploadPath(e.storagePath));
      const indexed = def.index && INDEXABLE_MIME.test(e.mimeType || '');
      const res = await this.oneDrive.uploadFile(e.nodeId, folderKey, e.fileName, buffer, e.mimeType, {
        replaceItemId: existing?.driveItemId,
        documentId: e.documentId,
        status: indexed ? 'indexed' : 'downloaded',
      });
      await this.prisma.driveFile.update({ where: { driveItemId: res.itemId }, data: { storagePath: e.storagePath } });
    } catch (err: any) {
      this.logger.warn(`Wysyłka „${e.fileName}" na OneDrive (${folderKey}) nieudana: ${err?.response?.data?.error?.message || err?.message}`);
    }
  }

  // @anchor onedrive-sync-blocked-reason
  // Zamówienia archiwalne (pod obszarem „Archiwum”) i rozliczone nie są synchronizowane — ani ręcznie,
  // ani automatycznie. Zwraca powód blokady albo null.
  async syncBlockedReason(nodeId: string): Promise<string | null> {
    const node = await this.prisma.processNode.findUnique({ where: { id: nodeId }, select: { orderStage: true } });
    if (!node) return 'Gałąź nie istnieje';
    if (node.orderStage === 'ROZLICZONE') return 'Zamówienie rozliczone — synchronizacja OneDrive wyłączona';
    const archived = await this.prisma.processNodeClosure.findFirst({
      where: { descendantId: nodeId, depth: { gt: 0 }, ancestor: { name: ARCHIVE_AREA_NAME, type: 'area' } },
      select: { ancestorId: true },
    });
    return archived ? 'Zamówienie w archiwum — synchronizacja OneDrive wyłączona' : null;
  }

  // @anchor onedrive-sync-node
  async syncNode(nodeId: string): Promise<OneDriveSyncResult> {
    const blocked = await this.syncBlockedReason(nodeId);
    if (blocked) throw new ConflictException(blocked);
    if (this.syncing.has(nodeId)) throw new ConflictException('Synchronizacja tego zamówienia już trwa');
    this.syncing.add(nodeId);
    try {
      const result = await this.runSync(nodeId);
      // Pobieranie i indeksowanie w tle — odpowiedź wraca od razu po odczycie zmian.
      void this.processQueue();
      return result;
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message || 'Błąd synchronizacji';
      await this.prisma.processNode.update({ where: { id: nodeId }, data: { oneDriveSyncError: msg } }).catch(() => null);
      throw e;
    } finally {
      this.syncing.delete(nodeId);
    }
  }

  private async runSync(nodeId: string): Promise<OneDriveSyncResult> {
    let node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
    if (!node?.oneDriveFolderId) throw new NotFoundException('Folder OneDrive nie jest powiązany z tą gałęzią');
    if (!node.oneDriveFolderIds) {
      await this.oneDrive.ensureOrderFolders(nodeId);
      node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
    }

    const token = await this.oneDrive.getSharedToken();
    const headers = { Authorization: `Bearer ${token}` };
    const driveBase = node.oneDriveDriveId ? `${GRAPH_BASE}/drives/${node.oneDriveDriveId}` : `${GRAPH_BASE}/me/drive`;
    const freshUrl = `${driveBase}/items/${node.oneDriveFolderId}/delta?$select=${DELTA_SELECT}`;

    let fullSync = !node.oneDriveDeltaLink;
    let url: string | null = node.oneDriveDeltaLink || freshUrl;
    let deltaLink: string | null = null;
    let items: any[] = [];
    while (url) {
      let res: any;
      try {
        res = await axios.get(url, { headers });
      } catch (e: any) {
        // 410 = token delta wygasł → pełna synchronizacja od zera.
        if (e?.response?.status === 410 && !fullSync) {
          this.logger.warn(`Delta zamówienia ${nodeId} wygasła — pełna synchronizacja`);
          fullSync = true; items = []; url = freshUrl;
          continue;
        }
        throw e;
      }
      items.push(...(res.data?.value || []));
      url = res.data?.['@odata.nextLink'] || null;
      deltaLink = res.data?.['@odata.deltaLink'] || deltaLink;
    }

    const result: OneDriveSyncResult = { newFiles: 0, changed: 0, deleted: 0, pending: 0, fullSync };
    const seen = new Set<string>();
    for (const it of items) {
      if (it.id === node.oneDriveFolderId) continue;
      seen.add(it.id);
      const existing = await this.prisma.driveFile.findUnique({ where: { driveItemId: it.id } });

      if (it.deleted) {
        if (existing && existing.status !== 'deleted') {
          await this.markDeleted(existing);
          result.deleted++;
        }
        continue;
      }

      const base = {
        nodeId,
        driveId: it.parentReference?.driveId || node.oneDriveDriveId || '',
        parentItemId: it.parentReference?.id || null,
        name: it.name,
        webUrl: it.webUrl ?? null,
        lastModified: it.lastModifiedDateTime ? new Date(it.lastModifiedDateTime) : null,
      };

      if (it.folder) {
        await this.prisma.driveFile.upsert({
          where: { driveItemId: it.id },
          create: { ...base, driveItemId: it.id, isFolder: true, status: 'skipped' },
          update: { ...base, isFolder: true, status: 'skipped' },
        });
        continue;
      }

      const fileData = { ...base, isFolder: false, mimeType: it.file?.mimeType ?? null, size: it.size ?? null, cTag: it.cTag ?? null };
      if (!existing) {
        await this.prisma.driveFile.create({ data: { ...fileData, driveItemId: it.id, status: 'discovered' } });
        result.newFiles++;
        continue;
      }

      const contentChanged = existing.processedTag !== (it.cTag ?? null);
      const restored = existing.status === 'deleted';
      const requeue = !existing.ignored && (restored || (contentChanged && !['pending', 'discovered'].includes(existing.status)));
      await this.prisma.driveFile.update({
        where: { id: existing.id },
        data: { ...fileData, ...(requeue ? { status: 'discovered', attempts: 0, error: null } : {}) },
      });
      if (requeue) result.changed++;
      else if (existing.documentId && existing.name !== it.name) {
        await this.documents.renameDocument(existing.documentId, it.name).catch(() => null);
      }
    }

    // Pełna synchronizacja zwraca wszystko, co istnieje — czego w niej nie ma, zniknęło z OneDrive.
    if (fullSync) {
      const missing = await this.prisma.driveFile.findMany({ where: { nodeId, status: { not: 'deleted' }, driveItemId: { notIn: [...seen] } } });
      for (const f of missing) { await this.markDeleted(f); result.deleted++; }
    }

    await this.resolveFolderKeys(nodeId, node.oneDriveFolderId, (node.oneDriveFolderIds as Record<string, string>) || {});
    // Do kolejki dopiero z ustalonym katalogiem — inaczej `processQueue` mógłby wziąć plik przed `resolveFolderKeys`.
    await this.prisma.driveFile.updateMany({ where: { nodeId, status: 'discovered' }, data: { status: 'pending' } });
    // Ręczna synchronizacja ponawia też pliki, które wyczerpały próby.
    await this.prisma.driveFile.updateMany({ where: { nodeId, status: 'error', ignored: false }, data: { status: 'pending', attempts: 0 } });

    await this.prisma.processNode.update({
      where: { id: nodeId },
      data: { oneDriveDeltaLink: deltaLink, oneDriveSyncedAt: new Date(), oneDriveSyncError: null },
    });
    result.pending = await this.prisma.driveFile.count({ where: { nodeId, isFolder: false, status: 'pending', ignored: false } });
    return result;
  }

  // @anchor onedrive-resolve-folder-keys
  // Ustala katalog struktury każdego pliku, idąc w górę po `parentItemId` aż do katalogu z `oneDriveFolderIds`.
  // Liczone po każdej synchronizacji (tylko baza) — przeniesienie katalogu na OneDrive nie zgłasza w delcie
  // plików w środku, więc kategorie trzeba odświeżyć dla wszystkich.
  private async resolveFolderKeys(nodeId: string, orderFolderId: string, folderIds: Record<string, string>) {
    const byId = new Map(Object.entries(folderIds).map(([k, id]) => [id, k]));
    const all = await this.prisma.driveFile.findMany({ where: { nodeId, status: { not: 'deleted' } } });
    const folders = new Map(all.filter((f) => f.isFolder).map((f) => [f.driveItemId, f]));

    const keyFor = (parentId: string | null): string | null => {
      let cur = parentId;
      for (let depth = 0; cur && depth < 30; depth++) {
        const key = byId.get(cur);
        if (key) return key.startsWith('root:') ? null : key;
        if (cur === orderFolderId) return null;
        const f = folders.get(cur);
        if (!f) return null;
        if (f.parentItemId === orderFolderId && LEGACY_NAMES.includes(f.name)) return LEGACY_KEY;
        cur = f.parentItemId;
      }
      return null;
    };

    for (const f of all) {
      if (f.isFolder) continue;
      const key = keyFor(f.parentItemId);
      if (key === f.folderKey) continue;
      const def = ORDER_FOLDERS.find((d) => d.key === key);
      // Przeniesiony do katalogu z indeksem, a dotąd tylko pobrany → do ponownego przetworzenia.
      const reindex = !!def?.index && f.status === 'downloaded';
      await this.prisma.driveFile.update({
        where: { id: f.id },
        data: { folderKey: key, ...(reindex ? { status: 'pending', attempts: 0 } : {}) },
      });
      if (f.documentId && def?.documentCategory) {
        await this.prisma.processNode.update({ where: { id: f.documentId }, data: { documentCategory: def.documentCategory } }).catch(() => null);
      }
    }
  }

  // @anchor onedrive-mark-deleted
  // Plik usunięty z OneDrive znika z aplikacji (dokument + indeks AI). Kopia na serwerze zostaje
  // (sprzątanie po 30 dniach — etap 4). Usunięty katalog pociąga za sobą wszystko, co w nim było.
  private async markDeleted(f: { id: string; driveItemId: string; isFolder: boolean; documentId: string | null }) {
    if (f.documentId) await this.documents.deleteDocument(f.documentId, true).catch(() => null);
    await this.prisma.driveFile.update({ where: { id: f.id }, data: { status: 'deleted', documentId: null } });
    if (f.isFolder) {
      const children = await this.prisma.driveFile.findMany({ where: { parentItemId: f.driveItemId, status: { not: 'deleted' } } });
      for (const c of children) await this.markDeleted(c);
    }
  }

  // @anchor onedrive-auto-sync
  // Automatyczna synchronizacja co 30 min — tylko aktywne zamówienia (bez Archiwum i ROZLICZONE).
  // Wyłączana `ONEDRIVE_AUTO_SYNC=false` (dev: baza jest kopią produkcji z prawdziwymi folderami,
  // automat ściągałby firmowe pliki na komputer dewelopera). Zamówienia po kolei — bez skoków obciążenia Graph.
  @Cron('*/30 * * * *', { name: 'onedrive-auto-sync' })
  async autoSyncAll(): Promise<void> {
    if (this.config.get<string>('ONEDRIVE_AUTO_SYNC') === 'false') return;
    try {
      await this.oneDrive.getSharedToken();
    } catch {
      return; // brak podpiętego konta Microsoft — nie ma czym synchronizować
    }
    const nodes = await this.prisma.processNode.findMany({
      where: { oneDriveFolderId: { not: null }, NOT: { orderStage: 'ROZLICZONE' } },
      select: { id: true },
    });
    let ok = 0;
    for (const { id } of nodes) {
      if (this.syncing.has(id) || (await this.syncBlockedReason(id))) continue;
      try {
        await this.syncNode(id);
        ok++;
      } catch (e: any) {
        this.logger.warn(`Auto-sync zamówienia ${id}: ${e?.response?.data?.error?.message || e?.message}`);
      }
    }
    if (ok) this.logger.log(`Auto-sync OneDrive: ${ok} zamówień`);
  }

  // @anchor onedrive-cleanup-deleted
  // Raz na dobę: usuwa z serwera kopie plików skasowanych na OneDrive lub w aplikacji ponad 30 dni temu.
  // Wpis `DriveFile` zostaje (status `deleted` / `ignored`) — synchronizacja musi dalej wiedzieć, że plik był.
  @Cron('30 3 * * *', { name: 'onedrive-cleanup-deleted' })
  async cleanupDeleted(): Promise<number> {
    const before = new Date(Date.now() - KEEP_DELETED_DAYS * 24 * 3600 * 1000);
    const stale = await this.prisma.driveFile.findMany({
      where: { storagePath: { not: null }, updatedAt: { lt: before }, OR: [{ status: 'deleted' }, { ignored: true }] },
      select: { id: true, storagePath: true },
    });
    for (const f of stale) {
      // Plik pod tą ścieżką może wciąż wskazywać dokument (upload z aplikacji) — wtedy zostaje.
      const inUse = await this.prisma.processNode.findFirst({ where: { storagePath: f.storagePath }, select: { id: true } });
      if (!inUse) await fs.promises.unlink(uploadPath(f.storagePath)).catch(() => null);
      await this.prisma.driveFile.update({ where: { id: f.id }, data: { storagePath: null } });
    }
    if (stale.length) this.logger.log(`OneDrive: usunięto ${stale.length} kopii skasowanych plików (> ${KEEP_DELETED_DAYS} dni)`);
    return stale.length;
  }

  // @anchor onedrive-process-queue
  // Kolejka bez dodatkowej infrastruktury: stan w `DriveFile.status`, przebieg co 30 s i od razu po synchronizacji.
  // Dwa pliki naraz — limit Graph i pamięć kontenera (1 GB).
  @Interval(30_000)
  async processQueue(): Promise<void> {
    if (this.queueBusy || Date.now() < this.pausedUntil) return;
    this.queueBusy = true;
    try {
      for (;;) {
        const batch = await this.prisma.driveFile.findMany({
          where: { status: 'pending', isFolder: false, ignored: false },
          orderBy: { updatedAt: 'asc' },
          take: 2,
        });
        if (!batch.length) break;
        await Promise.all(batch.map((f) => this.processFile(f)));
        if (Date.now() < this.pausedUntil) break;
      }
    } catch (e: any) {
      this.logger.error(`Kolejka OneDrive: ${e?.message || e}`);
    } finally {
      this.queueBusy = false;
    }
  }

  // @anchor onedrive-process-file
  private async processFile(f: any): Promise<void> {
    const def = ORDER_FOLDERS.find((d) => d.key === f.folderKey);
    if (await this.syncBlockedReason(f.nodeId)) {
      await this.prisma.driveFile.update({ where: { id: f.id }, data: { status: 'skipped', error: 'Zamówienie archiwalne lub rozliczone' } });
      return;
    }
    if (f.folderKey === LEGACY_KEY || (def && !def.documentCategory)) {
      await this.prisma.driveFile.update({ where: { id: f.id }, data: { status: 'skipped', error: null } });
      return;
    }

    try {
      const token = await this.oneDrive.getSharedToken();
      const driveBase = f.driveId ? `${GRAPH_BASE}/drives/${f.driveId}` : `${GRAPH_BASE}/me/drive`;
      let meta: any;
      try {
        meta = (await axios.get(`${driveBase}/items/${f.driveItemId}`, { headers: { Authorization: `Bearer ${token}` } })).data;
      } catch (e: any) {
        if (e?.response?.status === 404) { await this.markDeleted(f); return; }
        throw e;
      }
      const downloadUrl = meta['@microsoft.graph.downloadUrl'];
      if (!downloadUrl) throw new Error('Graph nie zwrócił adresu pobrania');

      // Nazwa pliku na dysku = id OneDrive: stała przy zmianie nazwy, bez kolizji, bez znaków spoza systemu plików.
      const folder = def ? orderFolderPath(def.key) : '_poza_struktura';
      const rel = path.posix.join(f.nodeId, folder, `${f.driveItemId}${path.extname(meta.name || '').toLowerCase()}`);
      const full = uploadPath(rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      const res = await axios.get(downloadUrl, { responseType: 'stream' });
      await pipeline(res.data, fs.createWriteStream(full));

      const mimeType = meta.file?.mimeType || f.mimeType || 'application/octet-stream';
      const docData = {
        name: meta.name,
        storagePath: rel,
        mimeType,
        fileSize: meta.size ?? null,
        documentCategory: def?.documentCategory || 'standard',
      };

      let documentId: string | null = f.documentId;
      const doc = documentId ? await this.prisma.processNode.findUnique({ where: { id: documentId }, select: { id: true } }) : null;
      if (doc) {
        await this.prisma.processNode.update({ where: { id: doc.id }, data: docData });
        await this.documents.clearDocumentIndex(doc.id);
      } else {
        documentId = (await this.documents.createDocumentNode({ nodeId: f.nodeId, ...docData })).id;
      }
      if (f.storagePath && f.storagePath !== rel) fs.promises.unlink(uploadPath(f.storagePath)).catch(() => null);
      // Powiązanie zapisane przed indeksowaniem — nieudana próba indeksu nie może przy ponowieniu
      // zakładać kolejnej kopii dokumentu.
      await this.prisma.driveFile.update({ where: { id: f.id }, data: { documentId, storagePath: rel } });

      // Pliki luzem w folderze zamówienia (bez katalogu struktury) też indeksujemy — to zwykle dokumentacja.
      const shouldIndex = (def ? def.index : true) && INDEXABLE_MIME.test(mimeType) && (meta.size ?? 0) <= MAX_INDEX_BYTES;
      let status = 'downloaded';
      if (shouldIndex) {
        await this.documents.indexDocumentBuffer(documentId, f.nodeId, meta.name, await fs.promises.readFile(full), mimeType, true);
        status = 'indexed';
      }

      await this.prisma.driveFile.update({
        where: { id: f.id },
        data: { documentId, storagePath: rel, processedTag: meta.cTag ?? f.cTag, status, attempts: 0, error: null },
      });
    } catch (e: any) {
      const code = e?.response?.status;
      if (code === 429 || code === 503) {
        const retryAfter = Number(e?.response?.headers?.['retry-after']) || 60;
        this.pausedUntil = Date.now() + retryAfter * 1000;
        this.logger.warn(`Graph ${code} — kolejka OneDrive wstrzymana na ${retryAfter} s`);
        await this.prisma.driveFile.update({ where: { id: f.id }, data: { updatedAt: new Date() } });
        return;
      }
      const attempts = (f.attempts || 0) + 1;
      const msg = e?.response?.data?.error?.message || e?.message || 'Błąd przetwarzania';
      this.logger.warn(`Plik OneDrive „${f.name}" (${f.driveItemId}): ${msg} — próba ${attempts}/${MAX_ATTEMPTS}`);
      await this.prisma.driveFile.update({
        where: { id: f.id },
        data: { attempts, error: msg, status: attempts >= MAX_ATTEMPTS ? 'error' : 'pending' },
      });
    }
  }

  // @anchor onedrive-sync-status
  async getStatus(nodeId: string) {
    const node = await this.prisma.processNode.findUnique({
      where: { id: nodeId },
      select: { oneDriveFolderId: true, oneDriveFolderName: true, oneDriveSyncedAt: true, oneDriveSyncError: true },
    });
    if (!node) throw new NotFoundException('Gałąź nie istnieje');
    const files = await this.prisma.driveFile.findMany({
      where: { nodeId, isFolder: false, status: { not: 'deleted' }, ignored: false },
      select: { id: true, name: true, folderKey: true, status: true, error: true, size: true, webUrl: true, documentId: true, lastModified: true },
      orderBy: { name: 'asc' },
      take: 1000,
    });
    const counts: Record<string, number> = {};
    for (const f of files) counts[f.status] = (counts[f.status] || 0) + 1;
    return {
      linked: !!node.oneDriveFolderId,
      blocked: await this.syncBlockedReason(nodeId),
      folderName: node.oneDriveFolderName,
      syncedAt: node.oneDriveSyncedAt,
      syncError: node.oneDriveSyncError,
      syncing: this.syncing.has(nodeId),
      counts,
      files: files.map((f) => ({
        ...f,
        folderPath: f.folderKey === LEGACY_KEY ? 'archiwum (stare katalogi)' : orderFolderPath(f.folderKey) || 'poza strukturą',
      })),
    };
  }
}
