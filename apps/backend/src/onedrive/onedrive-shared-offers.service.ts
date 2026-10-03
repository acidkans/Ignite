import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { OneDriveService } from './onedrive.service';
import { OneDriveSyncService, OneDriveSyncResult } from './onedrive-sync.service';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const DELTA_SELECT = 'id,name,folder,file,parentReference,cTag,size,lastModifiedDateTime,webUrl,deleted';
const SETTINGS_ID = 'singleton';
// Obszar, pod którym lądują oferty ogólne (bez zamówienia) — ten sam, który front rozpoznaje jako Logistykę.
const LOGISTICS_AREA_NAME = 'Logistyka';

// @anchor normalize-folder-name
// Porównanie nazwy katalogu z nazwą dostawcy / zamówienia: bez wielkości liter, polskich znaków,
// form prawnych i interpunkcji. Dopasowanie tylko przy JEDNYM trafieniu — dwa = przypisanie ręczne.
export function normalizeFolderName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
    .replace(/\b(sp\.?\s*z\s*o\.?\s*o\.?|spolka z ograniczona odpowiedzialnoscia|s\.?\s*a\.?|sp\.?\s*k\.?|sp\.?\s*j\.?|spolka (jawna|komandytowa|akcyjna))\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// @anchor onedrive-shared-offers-service
// Wspólny katalog ofert dostawców (etap 5, docs/PLAN-onedrive-sync.md):
//   <katalog>/<Dostawca>/plik                 → oferta ogólna: Logistyka → Oferty, dostawca z katalogu
//   <katalog>/<Dostawca>/<Zamówienie>/…/plik  → oferta zamówienia: Pliki finansowe zamówienia
// Katalog dostawcy → `Supplier.oneDriveFolderId`, katalog zamówienia → `DriveFile.orderNodeId` (na wpisie katalogu).
// Nierozpoznane zamówienie wstrzymuje pliki (`unmatched`) do ręcznego przypisania; brak dostawcy — nie.
@Injectable()
export class OneDriveSharedOffersService {
  private readonly logger = new Logger(OneDriveSharedOffersService.name);
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneDrive: OneDriveService,
    private readonly sync: OneDriveSyncService,
    private readonly documents: DocumentsService,
    private readonly config: ConfigService,
  ) {}

  private async settings() {
    return this.prisma.oneDriveSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID }, update: {} });
  }

  private async logisticsAreaId(): Promise<string> {
    const area = await this.prisma.processNode.findFirst({ where: { name: LOGISTICS_AREA_NAME, type: 'area' }, select: { id: true } });
    if (!area) throw new NotFoundException(`Brak obszaru „${LOGISTICS_AREA_NAME}” — oferty ogólne nie mają gdzie trafić`);
    return area.id;
  }

  // @anchor onedrive-shared-offers-set-folder
  // Zmiana katalogu: token delta od zera — pełna synchronizacja oznaczy pliki starego katalogu jako usunięte.
  async setFolder(folderId: string, driveId: string, folderName: string) {
    if (!folderId) throw new BadRequestException('Brak katalogu');
    await this.settings();
    await this.prisma.oneDriveSettings.update({
      where: { id: SETTINGS_ID },
      data: { sharedOffersFolderId: folderId, sharedOffersDriveId: driveId || null, sharedOffersFolderName: folderName, sharedOffersDeltaLink: null, sharedOffersSyncError: null },
    });
    return this.getStatus();
  }

  // @anchor onedrive-shared-offers-sync
  async syncShared(): Promise<OneDriveSyncResult> {
    if (this.syncing) throw new ConflictException('Synchronizacja wspólnego katalogu ofert już trwa');
    const st = await this.settings();
    if (!st.sharedOffersFolderId) throw new NotFoundException('Wspólny katalog ofert nie jest wybrany');
    this.syncing = true;
    try {
      const logisticsId = await this.logisticsAreaId();
      const driveBase = st.sharedOffersDriveId ? `${GRAPH_BASE}/drives/${st.sharedOffersDriveId}` : `${GRAPH_BASE}/me/drive`;
      const { items, deltaLink, fullSync } = await this.sync.fetchDelta(
        st.sharedOffersDeltaLink,
        `${driveBase}/items/${st.sharedOffersFolderId}/delta?$select=${DELTA_SELECT}`,
        'wspólnego katalogu ofert',
      );
      const { result, seen } = await this.sync.applyDeltaItems(items, {
        nodeId: logisticsId, driveId: st.sharedOffersDriveId || '', rootId: st.sharedOffersFolderId, scope: 'sharedOffers', fullSync,
      });
      if (fullSync) {
        const missing = await this.prisma.driveFile.findMany({ where: { scope: 'sharedOffers', status: { not: 'deleted' }, driveItemId: { notIn: [...seen] } } });
        for (const f of missing) { await this.sync.markDeleted(f); result.deleted++; }
      }

      await this.resolveShared(st.sharedOffersFolderId, logisticsId);
      await this.prisma.driveFile.updateMany({ where: { scope: 'sharedOffers', status: 'error', ignored: false }, data: { status: 'pending', attempts: 0 } });
      await this.prisma.oneDriveSettings.update({
        where: { id: SETTINGS_ID },
        data: { sharedOffersDeltaLink: deltaLink, sharedOffersSyncedAt: new Date(), sharedOffersSyncError: null },
      });
      result.pending = await this.prisma.driveFile.count({ where: { scope: 'sharedOffers', isFolder: false, status: 'pending', ignored: false } });
      void this.sync.processQueue();
      return result;
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message || 'Błąd synchronizacji';
      await this.prisma.oneDriveSettings.update({ where: { id: SETTINGS_ID }, data: { sharedOffersSyncError: msg } }).catch(() => null);
      throw e;
    } finally {
      this.syncing = false;
    }
  }

  // @anchor onedrive-shared-offers-resolve
  // Dopasowanie katalogów (dostawca: 1. poziom, zamówienie: 2. poziom) i ustalenie celu każdego pliku.
  // Liczone po każdej synchronizacji i po ręcznym przypisaniu — tylko baza, bez Graph.
  private async resolveShared(rootId: string, logisticsId: string) {
    const all = await this.prisma.driveFile.findMany({ where: { scope: 'sharedOffers', status: { not: 'deleted' } } });
    const folders = new Map(all.filter((f) => f.isFolder).map((f) => [f.driveItemId, f]));

    // 1. poziom → dostawca (zapamiętany po id katalogu, inaczej jednoznaczna nazwa)
    const suppliers = await this.prisma.supplier.findMany({ select: { id: true, name: true, oneDriveFolderId: true } });
    const supplierByFolder = new Map<string, string>();
    for (const folder of [...folders.values()].filter((f) => f.parentItemId === rootId)) {
      let hit = suppliers.find((s) => s.oneDriveFolderId === folder.driveItemId);
      if (!hit) {
        const norm = normalizeFolderName(folder.name);
        const byName = suppliers.filter((s) => !s.oneDriveFolderId && normalizeFolderName(s.name) === norm);
        if (byName.length === 1) {
          hit = byName[0];
          await this.prisma.supplier.update({ where: { id: hit.id }, data: { oneDriveFolderId: folder.driveItemId } });
          hit.oneDriveFolderId = folder.driveItemId;
        }
      }
      if (hit) supplierByFolder.set(folder.driveItemId, hit.id);
    }

    // 2. poziom → zamówienie (przypisanie na wpisie katalogu; nazwa zamówienia albo nazwa jego folderu OneDrive)
    const level2 = [...folders.values()].filter((f) => f.parentItemId && folders.get(f.parentItemId)?.parentItemId === rootId);
    if (level2.some((f) => !f.orderNodeId)) {
      const orders = await this.prisma.processNode.findMany({ where: { type: 'order' }, select: { id: true, name: true, oneDriveFolderName: true } });
      for (const folder of level2.filter((f) => !f.orderNodeId)) {
        const norm = normalizeFolderName(folder.name);
        const hits = orders.filter((o) => normalizeFolderName(o.name) === norm || (o.oneDriveFolderName && normalizeFolderName(o.oneDriveFolderName) === norm));
        if (hits.length === 1) {
          await this.prisma.driveFile.update({ where: { id: folder.id }, data: { orderNodeId: hits[0].id } });
          folder.orderNodeId = hits[0].id;
        }
      }
    }

    // Pliki: idziemy w górę do katalogu dostawcy; katalog 2. poziomu po drodze = zamówienie.
    for (const f of all.filter((x) => !x.isFolder)) {
      let supplierFolder: string | null = null;
      let orderFolder: (typeof all)[number] | null = null;
      let cur = f.parentItemId;
      for (let depth = 0; cur && cur !== rootId && depth < 30; depth++) {
        const folder = folders.get(cur);
        if (!folder) break;
        if (folder.parentItemId === rootId) supplierFolder = folder.driveItemId;
        else if (folders.get(folder.parentItemId)?.parentItemId === rootId) orderFolder = folder;
        cur = folder.parentItemId;
      }
      const supplierId = supplierFolder ? supplierByFolder.get(supplierFolder) ?? null : null;
      const orderNodeId = orderFolder ? orderFolder.orderNodeId : null;
      const unmatched = !!orderFolder && !orderNodeId;
      const targetNodeId = orderNodeId || logisticsId;

      const targetChanged = f.nodeId !== targetNodeId || f.orderNodeId !== orderNodeId;
      let status = f.status;
      if (unmatched) status = f.ignored ? f.status : 'unmatched';
      else if (f.status === 'unmatched' || f.status === 'discovered') status = 'pending';

      if (targetChanged && f.documentId) {
        // Inne zamówienie / Logistyka → dokument powstaje od nowa pod nowym węzłem.
        await this.documents.deleteDocument(f.documentId, true).catch(() => null);
        status = unmatched ? 'unmatched' : 'pending';
      }
      if (targetChanged || status !== f.status || supplierId !== f.supplierId) {
        await this.prisma.driveFile.update({
          where: { id: f.id },
          data: {
            nodeId: targetNodeId, orderNodeId, supplierId, status,
            ...(targetChanged && f.documentId ? { documentId: null, processedTag: null } : {}),
            ...(status === 'pending' && f.status !== 'pending' ? { attempts: 0, error: null } : {}),
          },
        });
      }
    }
  }

  // @anchor onedrive-shared-offers-match
  // Ręczne przypisanie katalogu: 1. poziom → dostawca, 2. poziom → zamówienie. Zapamiętane na stałe
  // (zmiana nazwy katalogu na OneDrive go nie zrywa).
  async match(folderItemId: string, target: { supplierId?: string; orderNodeId?: string }) {
    const st = await this.settings();
    const folder = await this.prisma.driveFile.findUnique({ where: { driveItemId: folderItemId } });
    if (!folder?.isFolder || folder.scope !== 'sharedOffers') throw new NotFoundException('Nie ma takiego katalogu we wspólnym katalogu ofert');
    if (target.supplierId) {
      await this.prisma.supplier.updateMany({ where: { oneDriveFolderId: folderItemId }, data: { oneDriveFolderId: null } });
      await this.prisma.supplier.update({ where: { id: target.supplierId }, data: { oneDriveFolderId: folderItemId } });
    }
    if (target.orderNodeId) {
      await this.prisma.driveFile.update({ where: { id: folder.id }, data: { orderNodeId: target.orderNodeId } });
    }
    await this.resolveShared(st.sharedOffersFolderId, await this.logisticsAreaId());
    void this.sync.processQueue();
    return this.getStatus();
  }

  // @anchor onedrive-shared-offers-status
  async getStatus() {
    const st = await this.settings();
    const rows = await this.prisma.driveFile.findMany({
      where: { scope: 'sharedOffers', status: { not: 'deleted' }, ignored: false },
      select: { id: true, driveItemId: true, parentItemId: true, isFolder: true, name: true, status: true, error: true, orderNodeId: true, supplierId: true },
    });
    const folders = new Map(rows.filter((r) => r.isFolder).map((r) => [r.driveItemId, r]));
    const files = rows.filter((r) => !r.isFolder);
    const counts: Record<string, number> = {};
    for (const f of files) counts[f.status] = (counts[f.status] || 0) + 1;

    const linkedSuppliers = await this.prisma.supplier.findMany({ where: { oneDriveFolderId: { not: null } }, select: { id: true, name: true, oneDriveFolderId: true } });
    const supplierByFolder = new Map(linkedSuppliers.map((s) => [s.oneDriveFolderId, s]));
    const level1 = [...folders.values()].filter((f) => f.parentItemId === st.sharedOffersFolderId);
    const level2 = [...folders.values()].filter((f) => f.parentItemId && folders.get(f.parentItemId)?.parentItemId === st.sharedOffersFolderId);
    const orderIds = level2.map((f) => f.orderNodeId).filter(Boolean) as string[];
    const orders = orderIds.length ? await this.prisma.processNode.findMany({ where: { id: { in: orderIds } }, select: { id: true, name: true } }) : [];
    const orderName = new Map(orders.map((o) => [o.id, o.name]));
    // Ile plików czeka na przypisanie zamówienia — liczone po katalogu 2. poziomu nad plikiem.
    const level2Ids = new Set(level2.map((f) => f.driveItemId));
    const waiting = new Map<string, number>();
    for (const f of files.filter((x) => x.status === 'unmatched')) {
      let cur = f.parentItemId;
      for (let d = 0; cur && d < 30; d++) {
        if (level2Ids.has(cur)) { waiting.set(cur, (waiting.get(cur) || 0) + 1); break; }
        cur = folders.get(cur)?.parentItemId ?? null;
      }
    }

    return {
      folderId: st.sharedOffersFolderId,
      folderName: st.sharedOffersFolderName,
      syncedAt: st.sharedOffersSyncedAt,
      syncError: st.sharedOffersSyncError,
      syncing: this.syncing,
      counts,
      suppliers: level1.map((f) => ({ folderItemId: f.driveItemId, name: f.name, supplier: supplierByFolder.get(f.driveItemId) || null })),
      orders: level2.map((f) => ({
        folderItemId: f.driveItemId, name: f.name, supplierFolder: folders.get(f.parentItemId)?.name || '',
        order: f.orderNodeId ? { id: f.orderNodeId, name: orderName.get(f.orderNodeId) || '?' } : null,
        waitingFiles: waiting.get(f.driveItemId) || 0,
      })),
      errors: files.filter((f) => f.status === 'error').map((f) => ({ name: f.name, error: f.error })),
    };
  }

  // @anchor onedrive-shared-offers-orders
  // Zamówienia do ręcznego przypisania katalogu (bez Archiwum i rozliczonych).
  async orderCandidates() {
    const orders = await this.prisma.processNode.findMany({
      where: { type: 'order', NOT: { orderStage: 'ROZLICZONE' } },
      select: { id: true, name: true, parent: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const out: { id: string; name: string; parent: string }[] = [];
    for (const o of orders) {
      if (await this.sync.syncBlockedReason(o.id)) continue;
      out.push({ id: o.id, name: o.name, parent: (o.parent as any)?.name || '' });
    }
    return out;
  }

  // @anchor onedrive-shared-offers-auto-sync
  // Razem z automatem zamówień (przesunięte o kwadrans), ten sam wyłącznik `ONEDRIVE_AUTO_SYNC`.
  @Cron('15,45 * * * *', { name: 'onedrive-shared-offers-auto-sync' })
  async autoSync() {
    if (this.config.get<string>('ONEDRIVE_AUTO_SYNC') === 'false') return;
    const st = await this.settings();
    if (!st.sharedOffersFolderId) return;
    await this.syncShared().catch((e) => this.logger.warn(`Auto-sync wspólnego katalogu ofert: ${e?.message || e}`));
  }
}
