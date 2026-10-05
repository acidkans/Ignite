import { BadRequestException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { VectorService } from '../ai/vector.service';
import { DocumentsService } from '../documents/documents.service';
import { PdfService } from '../pdf/pdf.service';
import { resolveVersionId } from '../common/version.util';
import { groupMultiplierMap } from '../common/group-qty.util';
import { uploadPath } from '../common/uploads.util';
import { STANDARD_TAB_CATEGORIES } from '../onedrive/order-folders';
import { buildScopeDocumentHtml, ScopeDocumentModel } from './scope-document-pdf';

type WbsRow = { id: string; parentId: string | null; name: string; type: string; quantity: number; unit: string; strategy: string | null; showInScope: boolean; sortOrder: number };
// @anchor scope-layout-type
export type ScopeLayout = { mode: 'packages' | 'locations'; locations: { name: string; wbsNodeIds: string[] }[]; packages: { name: string; wbsNodeIds: string[] }[] };

const clip = (v: any, max: number) => String(v ?? '').slice(0, max);
// Model bywa niekonsekwentny: listę zwraca jako tablicę punktów zamiast tekstu markdown.
const aiText = (v: any, max = 20000) => clip(Array.isArray(v)
    ? v.map(x => String(x ?? '').trim()).filter(Boolean).map(x => (/^([-*]|\d+\.) /.test(x) ? x : `- ${x}`)).join('\n')
    : v, max).trim();
const SECTION_KEYS = ['title', 'subject', 'investor', 'goal', 'assumptions', 'packages', 'supplies', 'exclusions', 'organization', 'acceptance'];
const AI_SECTION_KEYS = ['title', 'subject', 'investor', 'goal', 'assumptions', 'packages'];
const SCOPE_PDF_PREFIX = 'Opis zakresu prac';

// @anchor derive-short-code
// 3 litery z nazwy firmy, bez polskich znaków: „Łączpol sp. z o.o." → „LAC".
export function deriveShortCode(name: string): string {
    const plain = String(name || '')
        .replace(/ł/g, 'l').replace(/Ł/g, 'L')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z]/g, '');
    return (plain.slice(0, 3) || 'XXX').padEnd(3, 'X');
}

// @anchor scope-documents-service
@Injectable()
export class ScopeDocumentsService {
    private readonly logger = new Logger(ScopeDocumentsService.name);

    constructor(
        private prisma: PrismaService,
        private vectorService: VectorService,
        @Inject(forwardRef(() => DocumentsService))
        private documentsService: DocumentsService,
        private pdfService: PdfService,
    ) { }

    // ── dane wejściowe ────────────────────────────────────────────────────────

    private async loadTree(nodeId: string, versionId?: string | null) {
        const vId = await resolveVersionId(this.prisma, nodeId, versionId);
        const select = { id: true, parentId: true, name: true, type: true, quantity: true, unit: true, strategy: true, showInScope: true, sortOrder: true };
        let rows: WbsRow[] = vId ? await this.prisma.wbsNode.findMany({ where: { nodeId, versionId: vId }, select, orderBy: { sortOrder: 'asc' } }) as any : [];
        if (!rows.length) rows = await this.prisma.wbsNode.findMany({ where: { nodeId, versionId: null }, select, orderBy: { sortOrder: 'asc' } }) as any;
        const byId = new Map(rows.map(r => [r.id, r]));
        const children = new Map<string | null, WbsRow[]>();
        for (const r of rows) {
            const p = r.parentId && byId.has(r.parentId) ? r.parentId : null;
            if (!children.has(p)) children.set(p, []);
            children.get(p)!.push(r);
        }
        const mult = groupMultiplierMap(rows);
        // Czy `id` leży w poddrzewie `rootId` (włącznie z nim samym).
        const within = (id: string, rootId: string) => {
            let cur: WbsRow | undefined = byId.get(id);
            for (let guard = 0; cur && guard < 100; guard++) {
                if (cur.id === rootId) return true;
                cur = cur.parentId ? byId.get(cur.parentId) : undefined;
            }
            return false;
        };
        return { vId, rows, byId, children, mult, within };
    }

    // Wymagania wersji, a puste pola uzupełnione z pozostałych wierszy zamówienia (najpierw bazowy,
    // potem najświeższy) — kontakt PM i cel bywają wpisane tylko w wierszu bazowym, nie w wersji.
    private async loadRequirements(nodeId: string, vId: string | null) {
        const all = await this.prisma.orderRequirements.findMany({ where: { nodeId }, orderBy: { updatedAt: 'desc' } });
        if (!all.length) return null;
        const ordered = [
            ...all.filter(r => r.versionId === vId),
            ...all.filter(r => r.versionId === null && vId !== null),
            ...all.filter(r => r.versionId !== vId && r.versionId !== null),
        ];
        const merged: any = { ...ordered[0] };
        for (const r of ordered.slice(1)) {
            for (const [k, v] of Object.entries(r)) {
                const cur = merged[k];
                if ((cur === null || cur === undefined || cur === '') && v !== null && v !== '') merged[k] = v;
            }
        }
        return merged;
    }

    // Zamawiający = firma PM-a zamówienia z rejestru firm (po NIP, awaryjnie po nazwie).
    private async findClientSupplier(req: any) {
        const nip = String(req?.clientProjectManagerNip || '').replace(/\D/g, '');
        if (nip) {
            const s = await this.prisma.supplier.findUnique({ where: { nip } });
            if (s) return s;
        }
        const name = String(req?.clientProjectManagerCompany || '').trim();
        if (name) return this.prisma.supplier.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
        return null;
    }

    // Tekst parsowanej dokumentacji zamówienia (chunki z Qdrant) — bez ofert, finansów i raportów.
    private async loadDocsText(nodeId: string, max = 40000): Promise<string> {
        const docs = await this.prisma.processNode.findMany({
            where: {
                parentId: nodeId, type: 'document',
                OR: [{ documentCategory: null }, { documentCategory: { in: STANDARD_TAB_CATEGORIES } }],
                NOT: [{ name: { startsWith: SCOPE_PDF_PREFIX } }, { name: { startsWith: 'Analiza AI oferty' } }],
            },
            select: { id: true, name: true },
        });
        if (!docs.length) return '';
        let points: any[] = [];
        try { points = await this.vectorService.scrollAllChunksByNodes(docs.map(d => d.id)); }
        catch (e) { this.logger.warn(`[ScopeDoc] chunki dokumentacji niedostępne: ${e?.message}`); return ''; }
        const byDoc = new Map<string, { idx: number; text: string }[]>();
        for (const p of points) {
            const id = p.payload?.nodeId;
            if (!id) continue;
            if (!byDoc.has(id)) byDoc.set(id, []);
            byDoc.get(id)!.push({ idx: Number(p.payload?.chunkIndex) || 0, text: String(p.payload?.text || '') });
        }
        let out = '';
        for (const d of docs) {
            const chunks = (byDoc.get(d.id) || []).sort((a, b) => a.idx - b.idx);
            if (!chunks.length) continue;
            out += `\n### ${d.name}\n${chunks.map(c => c.text).join('\n')}\n`;
            if (out.length > max) break;
        }
        return out.slice(0, max);
    }

    private async logoDataUrl(stored: string | null | undefined): Promise<string> {
        if (!stored) return '';
        try {
            const buf = await fs.promises.readFile(uploadPath(stored));
            const ext = path.extname(stored).toLowerCase().replace('.', '') || 'png';
            const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
            return `data:${mime};base64,${buf.toString('base64')}`;
        } catch { return ''; }
    }

    // Logo wykonawcy: plik z frontu na dysku (dev lokalny), inaczej przez HTTP. Odpowiedź musi być
    // obrazem — SPA na nieznanej ścieżce oddaje 200 z index.html, co dawało zepsute logo.
    private async companyLogoDataUrl(): Promise<string> {
        const local = path.resolve(process.cwd(), '../frontend/public/airtel-logo-services.png');
        try { return `data:image/png;base64,${(await fs.promises.readFile(local)).toString('base64')}`; } catch { /* brak frontu obok */ }
        const bases = ['http://erp-frontend', process.env.FRONTEND_URL, 'http://localhost:5174'].filter(Boolean) as string[];
        for (const base of bases) {
            try {
                const res = await fetch(`${base.replace(/\/$/, '')}/airtel-logo-services.png`, { signal: AbortSignal.timeout(4000) });
                if (res.ok && String(res.headers.get('content-type') || '').startsWith('image/')) {
                    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
                }
            } catch { /* następny adres */ }
        }
        return '';
    }

    // ── dokument ──────────────────────────────────────────────────────────────

    private async getOrCreate(nodeId: string, userId?: string | null) {
        const order = await this.prisma.processNode.findUnique({ where: { id: nodeId }, select: { id: true, type: true } });
        if (!order) throw new NotFoundException('Zamówienie nie istnieje');
        return this.prisma.scopeDocument.upsert({ where: { nodeId }, update: {}, create: { nodeId, createdById: userId || null } });
    }

    // Domyślny układ bez AI: najwyższe gałęzie = pakiety (przypadek najczęstszy).
    private defaultLayout(tree: Awaited<ReturnType<ScopeDocumentsService['loadTree']>>): ScopeLayout {
        const tops = tree.children.get(null) || [];
        return { mode: 'packages', locations: [], packages: tops.map(t => ({ name: t.name.trim(), wbsNodeIds: [t.id] })) };
    }

    // Układ zapisany w dokumencie, oczyszczony z węzłów, których już nie ma w drzewie.
    private effectiveLayout(doc: any, tree: Awaited<ReturnType<ScopeDocumentsService['loadTree']>>): ScopeLayout {
        const raw = doc?.layout as ScopeLayout | null;
        if (!raw || !Array.isArray(raw.packages)) return this.defaultLayout(tree);
        const clean = (arr: any[]) => (arr || [])
            .map(g => ({ name: String(g?.name || '').trim(), wbsNodeIds: (g?.wbsNodeIds || []).filter((id: string) => tree.byId.has(id)) }))
            .filter(g => g.name && g.wbsNodeIds.length);
        const layout: ScopeLayout = { mode: raw.mode === 'locations' ? 'locations' : 'packages', locations: clean(raw.locations), packages: clean(raw.packages) };
        return layout.packages.length ? layout : this.defaultLayout(tree);
    }

    // @anchor scope-default-work-duration
    private defaultWorkDuration(req: any): string {
        const a = req?.projectStart ? new Date(req.projectStart) : null;
        const b = req?.projectEnd ? new Date(req.projectEnd) : null;
        if (!a || !b || b < a) return '';
        const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
        if (days >= 14) return `ok. ${Math.round(days / 7)} tygodni (${days} dni kalendarzowych)`;
        return `${days} dni kalendarzowych`;
    }

    private defaultSections(layout: ScopeLayout, companyName: string) {
        const loc = layout.locations.length > 0;
        const who = companyName || 'Wykonawcy';
        return {
            supplies: '',
            exclusions: '',
            organization: loc
                ? `Prace realizowane są lokalizacja po lokalizacji przez zespoły montażowe ${who}, pod nadzorem kierownika projektu.`
                : `Prace realizowane są przez zespoły montażowe ${who}, pod nadzorem kierownika projektu.`,
            acceptance: loc
                ? '- Dokumentacja powykonawcza dla każdej lokalizacji.\n- Protokoły odbioru per lokalizacja.'
                : '- Dokumentacja powykonawcza.\n- Protokół odbioru końcowego.',
        };
    }

    // @anchor build-scope-model
    // Wszystko, co trafia do PDF i do podglądu — liczone z drzewa, wymagań i zapisanych tekstów.
    private async buildModel(nodeId: string, versionId?: string | null) {
        const doc: any = await this.getOrCreate(nodeId);
        const tree = await this.loadTree(nodeId, versionId);
        const req: any = await this.loadRequirements(nodeId, tree.vId);
        const [order, company, version, supplier] = await Promise.all([
            this.prisma.processNode.findUnique({ where: { id: nodeId }, select: { name: true, owner: { select: { firstName: true, lastName: true, email: true, phone: true } } } }),
            this.prisma.company.findUnique({ where: { id: 'singleton' } }),
            tree.vId ? this.prisma.projectVersion.findUnique({ where: { id: tree.vId }, select: { label: true } }) : null,
            this.findClientSupplier(req),
        ]);
        const companyName = company?.name || 'Airtel Services';
        const layout = this.effectiveLayout(doc, tree);
        const locations = layout.mode === 'locations' || layout.locations.length ? layout.locations : [];

        const matrix = layout.packages.map(p => locations.map(l =>
            p.wbsNodeIds.some(pid => l.wbsNodeIds.some(lid => tree.within(pid, lid) || tree.within(lid, pid)))));

        // Zakres ilościowy: pozycje z flagą, ilość × pakiety nad nią, sumowane po nazwie + j.m.
        const rowsByKey = new Map<string, { name: string; unit: string; perLocation: number[]; total: number }>();
        for (const n of tree.rows.filter(r => r.showInScope)) {
            const qty = (Number(n.quantity) || 0) * (tree.mult.get(n.id) ?? 1);
            const name = n.name.trim();
            const unit = (n.unit || '').trim();
            const key = `${name.toLowerCase()}|${unit.toLowerCase()}`;
            if (!rowsByKey.has(key)) rowsByKey.set(key, { name, unit, perLocation: locations.map(() => 0), total: 0 });
            const row = rowsByKey.get(key)!;
            const li = locations.findIndex(l => l.wbsNodeIds.some(lid => tree.within(n.id, lid)));
            if (li >= 0) row.perLocation[li] += qty;
            row.total += qty;
        }

        const saved = (doc.sections || {}) as Record<string, any>;
        const defaults = this.defaultSections(layout, companyName);
        const sections: Record<string, any> = { ...defaults };
        for (const k of SECTION_KEYS) if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') sections[k] = saved[k];
        sections.packages = saved.packages || {};

        const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '';
        const person = (parts: any[]) => parts.map(p => String(p || '').trim()).filter(Boolean).join(', ');
        const owner = order?.owner;
        const model: ScopeDocumentModel = {
            logoDataUrl: '',
            companyName,
            title: sections.title || order?.name || '',
            subject: sections.subject || '',
            investor: sections.investor || '',
            client: {
                name: supplier?.name || req?.clientProjectManagerCompany || '',
                address: supplier?.address || '',
                nip: supplier?.nip || req?.clientProjectManagerNip || '',
                logoDataUrl: '',
            },
            clientContact: person([req?.clientProjectManager && `${req.clientProjectManager}${req?.clientProjectManagerCompany ? ` (${req.clientProjectManagerCompany})` : ''}`, req?.clientProjectManagerPhone, req?.clientProjectManagerEmail]),
            airtelContact: person([owner && `${owner.firstName || ''} ${owner.lastName || ''}`.trim(), owner?.phone, owner?.email]),
            offerNumber: doc.offerNumber || '',
            revisionLabel: `1.${doc.revision}`,
            versionLabel: version?.label || '',
            date: fmtDate(new Date()),
            validityDays: doc.validityDays,
            warrantyMonths: doc.warrantyMonths,
            term: [fmtDate(req?.projectStart), fmtDate(req?.projectEnd)].filter(Boolean).join(' – '),
            workDuration: doc.workDuration ?? this.defaultWorkDuration(req),
            locations: locations.map(l => l.name),
            packages: layout.packages.map(p => p.name),
            matrix,
            quantities: [...rowsByKey.values()],
            sections,
        };
        return { doc, tree, req, layout, model, supplier };
    }

    // @anchor get-scope-document
    // Stan dokumentu dla okna podglądu: zapis + model wyliczony z drzewa + domyślne wartości.
    async get(nodeId: string, versionId?: string | null) {
        const { doc, model, layout, tree, supplier } = await this.buildModel(nodeId, versionId);
        return {
            document: doc,
            layout,
            layoutDetected: !!doc.layout,
            model,
            // Firma Zamawiającego z rejestru — UI pozwala ustawić jej skrót (numer oferty) i logo.
            supplier: supplier ? { id: supplier.id, name: supplier.name, nip: supplier.nip, shortCode: supplier.shortCode, logoPath: supplier.logoPath } : null,
            scopeItemsCount: tree.rows.filter(r => r.showInScope).length,
            tree: tree.rows.map(r => ({
                id: r.id, parentId: r.parentId, name: r.name, type: r.type, showInScope: r.showInScope,
                isBranch: (tree.children.get(r.id) || []).length > 0,
                quantity: (Number(r.quantity) || 0) * (tree.mult.get(r.id) ?? 1), unit: r.unit,
            })),
        };
    }

    // @anchor update-scope-document
    async update(nodeId: string, body: any) {
        await this.getOrCreate(nodeId);
        const data: Record<string, any> = {};
        if (body?.validityDays !== undefined) data.validityDays = Math.max(1, Math.min(365, parseInt(body.validityDays, 10) || 30));
        if (body?.warrantyMonths !== undefined) data.warrantyMonths = Math.max(0, Math.min(240, parseInt(body.warrantyMonths, 10) || 0));
        if (body?.workDuration !== undefined) data.workDuration = body.workDuration === null ? null : clip(body.workDuration, 200);
        if (body?.layoutConfirmed !== undefined) data.layoutConfirmed = !!body.layoutConfirmed;
        if (body?.layout !== undefined) {
            const l = body.layout;
            const norm = (arr: any) => (Array.isArray(arr) ? arr : []).map((g: any) => ({ name: clip(g?.name, 200).trim(), wbsNodeIds: (Array.isArray(g?.wbsNodeIds) ? g.wbsNodeIds : []).map(String) })).filter((g: any) => g.name);
            data.layout = l === null ? null : { mode: l?.mode === 'locations' ? 'locations' : 'packages', locations: norm(l?.locations), packages: norm(l?.packages) };
        }
        if (body?.sections && typeof body.sections === 'object') {
            const cur: any = (await this.prisma.scopeDocument.findUnique({ where: { nodeId } }))?.sections || {};
            const next = { ...cur };
            for (const k of SECTION_KEYS) {
                if (body.sections[k] === undefined) continue;
                if (k === 'packages') {
                    // Scalanie per pakiet (równoległe edycje kilku pakietów się nie nadpisują); null = usuń tekst.
                    const pk = { ...(cur.packages || {}) };
                    for (const [name, v] of Object.entries(body.sections.packages || {})) {
                        if (v === null) delete pk[clip(name, 200)];
                        else pk[clip(name, 200)] = clip(v, 20000);
                    }
                    next.packages = pk;
                } else next[k] = clip(body.sections[k], 20000);
            }
            data.sections = next;
        }
        return this.prisma.scopeDocument.update({ where: { nodeId }, data });
    }

    // ── AI ────────────────────────────────────────────────────────────────────

    private async askJson(prompt: string, tag: string): Promise<any> {
        const raw = await this.vectorService.generateRaw(prompt);
        const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
        try { return JSON.parse(jsonText || ''); }
        catch {
            this.logger.warn(`[${tag}] niepoprawny JSON od modelu: ${raw.slice(0, 300)}`);
            throw new BadRequestException('Model AI zwrócił nieczytelną odpowiedź — spróbuj ponownie');
        }
    }

    // @anchor detect-scope-layout
    // AI rozpoznaje, czy najwyższe gałęzie to pakiety prac, czy lokalizacje. Wynik trafia do
    // dokumentu jako propozycja (layoutConfirmed=false) — użytkownik zatwierdza go w podglądzie.
    async detectLayout(nodeId: string, versionId?: string | null) {
        await this.getOrCreate(nodeId);
        const tree = await this.loadTree(nodeId, versionId);
        if (!tree.rows.length) throw new BadRequestException('Drzewo WBS zamówienia jest puste');
        const refs = new Map<string, string>();
        const lines: string[] = [];
        let no = 0;
        const walk = (parentId: string | null, depth: number) => {
            for (const n of tree.children.get(parentId) || []) {
                const kids = tree.children.get(n.id) || [];
                if (!kids.length) continue; // liście nie definiują układu
                const ref = `G${++no}`;
                refs.set(ref, n.id);
                const pack = String(n.type).toLowerCase() === 'group' && n.quantity > 1 ? ` [PAKIET ×${n.quantity}]` : '';
                lines.push(`${'  '.repeat(depth)}${ref} ${n.name}${pack} (${kids.length} elem.)`);
                if (depth < 2) walk(n.id, depth + 1);
            }
        };
        walk(null, 0);
        const prompt = `Analizujesz drzewo WBS oferty firmy instalacyjnej. Ustal, czy NAJWYŻSZE gałęzie to PAKIETY PRAC (zakresy, np. „Maszty", „Okablowanie") czy LOKALIZACJE (obiekty, miasta, budynki, np. „Lubliniec", „Hala B").
Najczęściej najwyższe gałęzie to pakiety prac. Lokalizacje mogą też występować NIŻEJ (np. pakiet „Maszty" z podgałęziami „Lubliniec", „Zalesie").

Zwróć:
- "mode": "locations" gdy najwyższe gałęzie to lokalizacje, inaczej "packages".
- "packages": lista pakietów prac do opisu zakresu. Gdy pod różnymi lokalizacjami powtarza się ten sam rodzaj prac (np. „Maszty" w każdej lokalizacji), połącz je w JEDEN pakiet o wspólnej nazwie z wieloma refs. Łącz według FUNKCJI, nie według dosłownej nazwy: warianty tego samego elementu (np. „BTS na maszcie balastowym", „SITE2 maszt boczno-przyczepny", „SITE1 na dachu" = stacja radiowa na maszcie; numery 1,2,3 i typy konstrukcji to warianty) tworzą jeden pakiet, np. „Stacje radiowe 5G na masztach". Nazwa pakietu: krótka, rzeczowa, po polsku, zrozumiała dla klienta (bez wewnętrznych skrótów typu SITE).
- "locations": lista lokalizacji (gdziekolwiek w drzewie) z ich refs; pusta, jeśli zakres nie dzieli się na lokalizacje.
Każdy pakiet i lokalizacja wskazuje gałęzie przez identyfikatory G.. z drzewa.

Zwróć WYŁĄCZNIE JSON: {"mode":"packages|locations","reason":"1 zdanie","packages":[{"name":"...","refs":["G1"]}],"locations":[{"name":"...","refs":["G2"]}]}

=== DRZEWO (tylko gałęzie, wcięcie = poziom) ===
${lines.join('\n')}`;
        const parsed = await this.askJson(prompt, 'ScopeLayout');
        const map = (arr: any) => (Array.isArray(arr) ? arr : [])
            .map((g: any) => ({ name: clip(g?.name, 200).trim(), wbsNodeIds: (Array.isArray(g?.refs) ? g.refs : []).map((r: string) => refs.get(String(r))).filter(Boolean) }))
            .filter((g: any) => g.name && g.wbsNodeIds.length);
        let layout: ScopeLayout = { mode: parsed?.mode === 'locations' ? 'locations' : 'packages', packages: map(parsed?.packages), locations: map(parsed?.locations) };
        if (!layout.packages.length) layout = this.defaultLayout(tree);
        await this.prisma.scopeDocument.update({ where: { nodeId }, data: { layout: layout as any, layoutConfirmed: false } });
        return { layout, reason: clip(parsed?.reason, 500) };
    }

    // @anchor generate-scope-sections
    // AI pisze sekcje opisowe: tytuł/przedmiot/inwestor, 1 (cel — z „Cel projektu" + dokumentacji),
    // 2 (założenia — ze strategii) i 4 (opis każdego pakietu). Zapisane teksty NIE są nadpisywane,
    // chyba że sekcja jest wprost wskazana w `only` (przycisk „wygeneruj ponownie" przy sekcji).
    async generateSections(nodeId: string, versionId?: string | null, only?: string[]) {
        const { doc, tree, req, layout, model } = await this.buildModel(nodeId, versionId);
        const force = new Set((only || []).filter(k => AI_SECTION_KEYS.includes(k)));
        const saved: any = doc.sections || {};
        const isEmpty = (v: any) => v === undefined || v === null || String(v).trim() === '';
        const pkgSaved = saved.packages || {};
        const want = AI_SECTION_KEYS.filter(k => k === 'packages'
            ? force.has(k) || layout.packages.some(p => isEmpty(pkgSaved[p.name]))
            : force.has(k) || isEmpty(saved[k]));
        if (!want.length) return { generated: [], sections: saved };

        const docsText = await this.loadDocsText(nodeId);
        const strategies = tree.rows.filter(r => String(r.strategy || '').trim())
            .map(r => `### ${r.name}\n${clip(r.strategy, 3000).trim()}`).join('\n\n');
        const pkgLines = layout.packages.map((p, pi) => {
            const items: string[] = [];
            const strat: string[] = [];
            const visit = (id: string, depth: number) => {
                for (const c of tree.children.get(id) || []) {
                    if (items.length < 60) items.push(`${'  '.repeat(depth)}- ${c.name} (${(Number(c.quantity) || 0) * (tree.mult.get(c.id) ?? 1)} ${c.unit || ''})`);
                    if (String(c.strategy || '').trim()) strat.push(clip(c.strategy, 1500).trim());
                    if (depth < 3) visit(c.id, depth + 1);
                }
            };
            for (const id of p.wbsNodeIds) {
                const n = tree.byId.get(id);
                if (n?.strategy) strat.push(clip(n.strategy, 3000).trim());
                visit(id, 0);
            }
            return `## K${pi + 1} PAKIET: ${p.name}\nStrategia:\n${strat.join('\n') || '(brak)'}\nSkładowe:\n${items.join('\n') || '(brak)'}`;
        }).join('\n\n');

        const prompt = `Piszesz „Opis zakresu prac" — załącznik do oferty firmy ${model.companyName} (instalacje teletechniczne, łączność, okablowanie, prace montażowe). Dokument opisuje ZAKRES RZECZOWY dla klienta: rzeczowo, konkretnie, bez cen, bez marketingu, bez obietnic spoza danych. Pisz po polsku, w trzeciej osobie („${model.companyName} wykonuje…", „Zamawiający dostarcza…").

Przygotuj pola (markdown: akapity, listy „- "; bez nagłówków #):
- "title": tytuł dokumentu, do 80 znaków, np. „Budowa prywatnej sieci 5G w obiektach Agencji Rezerw Strategicznych".
- "subject": jedno zdanie — przedmiot zamówienia (co jest instalowane/wykonywane).
- "investor": inwestor / odbiorca końcowy, jeśli wynika z dokumentacji (inny niż Zamawiający); inaczej "".
- "goal": sekcja „Przedmiot i cel projektu" — 1–2 akapity. Źródło PRIORYTETOWE: CEL PROJEKTU; uzupełnij faktami z DOKUMENTACJI (obiekty, cel, skala). Jeśli rozwiązanie jest powtarzalne w lokalizacjach — napisz to.
- "assumptions": sekcja „Sytuacja wyjściowa i założenia" — lista 3–8 punktów WYŁĄCZNIE na podstawie STRATEGII REALIZACJI: co dostarcza Zamawiający, co obejmuje instalacja, warunki techniczne i ograniczenia. Nie powtarzaj opisu pakietów.
- "packages": lista [{ "ref": "K1", "text": "2–6 punktów markdown, KAŻDY w osobnej linii zaczynającej się od \"- \" (nie akapit prozy): co obejmuje pakiet" }] — po jednym wpisie dla KAŻDEGO pakietu K.. z sekcji PAKIETY PRAC, na podstawie jego strategii i składowych. Ilości podawaj tylko gdy są oczywiste; szczegółowe ilości są w osobnej tabeli.

Zwróć WYŁĄCZNIE JSON: {"title":"","subject":"","investor":"","goal":"","assumptions":"","packages":[{"ref":"K1","text":""}]}

=== ZAMÓWIENIE ===
Nazwa: ${model.title}
Zamawiający: ${model.client.name || '(brak)'}
${model.locations.length ? `Lokalizacje: ${model.locations.join(', ')}` : 'Bez podziału na lokalizacje'}

=== CEL PROJEKTU (z wymagań zamówienia) ===
${clip(req?.projectGoal, 6000).trim() || '(nie uzupełniono)'}

=== ZAKRES ZAMÓWIENIA (z wymagań) ===
${clip(req?.projectItems, 6000).trim() || '(nie uzupełniono)'}

=== STRATEGIE REALIZACJI (gałąź, pod nią treść) ===
${clip(strategies, 20000) || '(brak strategii)'}

=== PAKIETY PRAC ===
${clip(pkgLines, 25000)}

=== DOKUMENTACJA ZAMÓWIENIA (parsowana, fragmenty) ===
${docsText || '(brak dokumentacji)'}`;

        const parsed = await this.askJson(prompt, 'ScopeSections');
        const next: any = { ...saved, packages: { ...pkgSaved } };
        const generated: string[] = [];
        for (const k of want) {
            if (k === 'packages') {
                // Odpowiedź po identyfikatorach K.. (nazwy model potrafi przeredagować).
                const gen = new Map<string, string>();
                for (const e of Array.isArray(parsed?.packages) ? parsed.packages : []) gen.set(String(e?.ref || '').trim().toUpperCase(), e?.text);
                for (const [pi, p] of layout.packages.entries()) {
                    if (!force.has('packages') && !isEmpty(pkgSaved[p.name])) continue;
                    const t = aiText(gen.get(`K${pi + 1}`));
                    if (t) next.packages[p.name] = t;
                }
                generated.push(k);
            } else {
                let t = aiText(parsed?.[k]);
                if (k === 'title') t = t.replace(/^opis zakresu prac\s*[:—–-]\s*/i, '');
                if (t || force.has(k)) { next[k] = t; generated.push(k); }
            }
        }
        await this.prisma.scopeDocument.update({ where: { nodeId }, data: { sections: next } });
        return { generated, sections: next };
    }

    // @anchor suggest-scope-items
    // AI wskazuje kluczowe pozycje do „Zakresu ilościowego" i ustawia im flagę showInScope (jednorazowo;
    // dalej użytkownik zaznacza/odznacza sam). Nie zdejmuje flag ustawionych wcześniej.
    async suggestScopeItems(nodeId: string, versionId?: string | null) {
        const tree = await this.loadTree(nodeId, versionId);
        const leaves = tree.rows.filter(r => !(tree.children.get(r.id) || []).length && String(r.type).toLowerCase() !== 'group');
        if (!leaves.length) throw new BadRequestException('Drzewo WBS nie ma pozycji');
        // Tabela zakresu sumuje po nazwie + j.m., więc AI wybiera spośród UNIKALNYCH elementów
        // (ta sama pozycja w 5 lokalizacjach = jeden wiersz), a flaga trafia na wszystkie wystąpienia.
        const groups = new Map<string, { name: string; unit: string; type: string; total: number; ids: string[]; parents: Set<string> }>();
        for (const n of leaves) {
            const key = `${n.name.trim().toLowerCase()}|${(n.unit || '').trim().toLowerCase()}`;
            if (!groups.has(key)) groups.set(key, { name: n.name.trim(), unit: (n.unit || '').trim(), type: n.type || '-', total: 0, ids: [], parents: new Set() });
            const g = groups.get(key)!;
            g.total += (Number(n.quantity) || 0) * (tree.mult.get(n.id) ?? 1);
            g.ids.push(n.id);
            const parent = n.parentId ? tree.byId.get(n.parentId)?.name : '';
            if (parent && g.parents.size < 3) g.parents.add(parent.trim());
        }
        const refs = new Map<string, string[]>();
        const lines = [...groups.values()].slice(0, 1500).map((g, i) => {
            const ref = `E${i + 1}`;
            refs.set(ref, g.ids);
            return `${ref} ${g.name} | ${g.type} | razem ${Math.round(g.total * 100) / 100} ${g.unit} | w: ${[...g.parents].join(', ')}`;
        });
        const prompt = `Z listy elementów WBS oferty instalacyjnej wybierz KLUCZOWE ELEMENTY do tabeli „Zakres ilościowy" w opisie zakresu dla klienta — to, co klient chce zobaczyć i policzyć: główne urządzenia i stacje, maszty i konstrukcje, szafy i racki, UPS-y i siłownie, punkty dostępowe/kamery, długości kabli magistralnych, liczba spawów lub punktów.
POMIŃ: materiały drobne i złączne (adaptery, keystone, bloczki, opaski, kołki, patchcordy, dławiki), robociznę, transport, noclegi, paliwo, podnośniki, zarządzanie, dokumentację, pozycje pomocnicze.
Wybierz 6–15 elementów; gdy dwa elementy znaczą to samo (np. różne warianty masztu), możesz wybrać oba.
Zwróć WYŁĄCZNIE JSON: {"refs":["E1","E7"]}

=== ELEMENTY (ref nazwa | typ | ilość łączna | gałęzie) ===
${lines.join('\n')}`;
        const parsed = await this.askJson(prompt, 'ScopeItems');
        const ids = [...new Set((Array.isArray(parsed?.refs) ? parsed.refs : []).flatMap((r: string) => refs.get(String(r)) || []))] as string[];
        if (ids.length) await this.prisma.wbsNode.updateMany({ where: { id: { in: ids } }, data: { showInScope: true } });
        return { selected: ids.length, ids };
    }

    // ── numer oferty i PDF ────────────────────────────────────────────────────

    // @anchor assign-offer-number
    // `SKR/n/RRRR` — SKR ze skrótu firmy Zamawiającego (uzupełniany z nazwy, gdy pusty), n ze wspólnego
    // licznika roku. Atomowo: INSERT … ON CONFLICT podbija licznik w tej samej transakcji co zapis numeru.
    private async assignOfferNumber(nodeId: string, supplier: any, fallbackName: string): Promise<string> {
        let code = String(supplier?.shortCode || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
        if (!code) {
            code = deriveShortCode(supplier?.name || fallbackName);
            if (supplier?.id) await this.prisma.supplier.update({ where: { id: supplier.id }, data: { shortCode: code } });
        }
        const year = Number(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw', year: 'numeric' }));
        return this.prisma.$transaction(async (tx) => {
            const cur = await tx.scopeDocument.findUnique({ where: { nodeId }, select: { offerNumber: true } });
            if (cur?.offerNumber) return cur.offerNumber;
            const rows: any[] = await tx.$queryRaw`INSERT INTO offer_number_counters ("year","lastNumber") VALUES (${year}, 1)
                ON CONFLICT ("year") DO UPDATE SET "lastNumber" = offer_number_counters."lastNumber" + 1 RETURNING "lastNumber"`;
            const number = `${code}/${rows[0].lastNumber}/${year}`;
            await tx.scopeDocument.update({ where: { nodeId }, data: { offerNumber: number } });
            return number;
        });
    }

    // @anchor render-scope-html
    async renderHtml(nodeId: string, versionId?: string | null) {
        const { model, supplier } = await this.buildModel(nodeId, versionId);
        model.logoDataUrl = await this.companyLogoDataUrl();
        model.client.logoDataUrl = await this.logoDataUrl(supplier?.logoPath);
        return buildScopeDocumentHtml(model);
    }

    // @anchor save-scope-pdf
    // Zapis: numer oferty (raz), wersja dokumentu (+1 przy każdym kolejnym zapisie), PDF do
    // dokumentów zamówienia (kategoria clientOffer — ta sama nazwa pliku nadpisuje poprzedni).
    async savePdf(nodeId: string, versionId?: string | null) {
        const first = await this.buildModel(nodeId, versionId);
        const { doc, supplier } = first;
        const order = await this.prisma.processNode.findUnique({ where: { id: nodeId }, select: { name: true } });
        const offerNumber = doc.offerNumber || await this.assignOfferNumber(nodeId, supplier, first.model.client.name || order?.name || '');
        await this.prisma.scopeDocument.update({
            where: { nodeId },
            data: { revision: doc.documentId ? { increment: 1 } : undefined, versionId: first.tree.vId },
        });
        const html = await this.renderHtml(nodeId, versionId);
        const pdf = await this.pdfService.render(html);
        const filename = `${SCOPE_PDF_PREFIX} - ${offerNumber.replace(/\//g, '-')}.pdf`;
        const saved: any = await this.documentsService.processDocument({
            originalname: Buffer.from(filename, 'utf8').toString('latin1'),
            buffer: pdf,
            mimetype: 'application/pdf',
            size: pdf.length,
        } as any, nodeId, 'clientOffer', undefined, { skipIndex: true });
        const updated = await this.prisma.scopeDocument.update({ where: { nodeId }, data: { documentId: saved?.nodeId || null } });
        return { document: updated, filename, documentId: saved?.nodeId || null, offerNumber, revisionLabel: `1.${updated.revision}` };
    }
}
