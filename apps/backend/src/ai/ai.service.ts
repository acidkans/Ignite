import { Injectable, Logger, BadRequestException, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VectorService } from './vector.service';
import { DocumentsService } from '../documents/documents.service';
import { PdfService } from '../pdf/pdf.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { buildOfferAiReportHtml, offerAiReportFilename } from './offer-ai-report';

@Injectable()
export class AiService implements OnModuleInit {
    private readonly logger = new Logger(AiService.name);

    constructor(
        private prisma: PrismaService,
        private vectorService: VectorService,
        @Inject(forwardRef(() => DocumentsService))
        private documentsService: DocumentsService,
        private pdfService: PdfService,
        private notificationsService: NotificationsService,
        private pushService: PushService,
    ) { }

    // Zadanie w tle żyje w pamięci procesu — restart serwera je przerywa. Wiersze RUNNING
    // z poprzedniego procesu oznaczamy jako błąd, inaczej przycisk wisiałby na „w toku".
    async onModuleInit() {
        try {
            const { count } = await this.prisma.offerAiAnalysis.updateMany({
                where: { status: 'RUNNING' },
                data: { status: 'ERROR', error: 'Analiza przerwana restartem serwera — uruchom ponownie', finishedAt: new Date() },
            });
            if (count) this.logger.warn(`[OfferAiAnalysis] ${count} przerwanych analiz oznaczono jako ERROR`);
        } catch (e) {
            this.logger.warn(`[OfferAiAnalysis] porządkowanie po restarcie nieudane: ${e?.message}`);
        }
    }

    // @anchor start-offer-budget-check
    /**
     * Startuje analizę w tle i od razu zwraca wiersz OfferAiAnalysis (status RUNNING).
     * Cały przebieg — AI, raport PDF, dokumentacja, powiadomienie — dzieje się na serwerze,
     * więc użytkownik może zamknąć okno, zmienić projekt albo kartę przeglądarki.
     * Druga analiza tej samej oferty w trakcie pierwszej nie startuje — zwracamy trwającą.
     */
    async startOfferBudgetCheck(body: any, userId: string | null) {
        const nodeId = String(body?.nodeId || '');
        if (!nodeId) throw new BadRequestException('Brak nodeId');
        const versionId = body?.versionId && body.versionId !== 'null' ? String(body.versionId) : null;
        const running = await this.prisma.offerAiAnalysis.findFirst({
            where: { nodeId, versionId, status: 'RUNNING' },
            orderBy: { createdAt: 'desc' },
        });
        if (running) return running;
        const job = await this.prisma.offerAiAnalysis.create({ data: { nodeId, versionId, createdById: userId } });
        void this.runOfferBudgetJob(job.id, body, userId);
        return job;
    }

    // @anchor get-latest-offer-budget-check
    // `job` = ostatnie uruchomienie (może trwać albo skończyć się błędem), `done` = ostatni
    // udany wynik — z niego korzysta okno analizy i arkusz „Analiza AI" w eksporcie Excel.
    async getLatestOfferBudgetCheck(nodeId: string, versionId: string | null) {
        const vId = versionId && versionId !== 'null' ? versionId : null;
        const [job, done] = await Promise.all([
            this.prisma.offerAiAnalysis.findFirst({ where: { nodeId, versionId: vId }, orderBy: { createdAt: 'desc' } }),
            this.prisma.offerAiAnalysis.findFirst({ where: { nodeId, versionId: vId, status: 'DONE' }, orderBy: { createdAt: 'desc' } }),
        ]);
        return { job, done };
    }

    private async fetchLogoDataUrl(): Promise<string> {
        const bases = [process.env.FRONTEND_URL, 'http://erp-frontend'].filter(Boolean) as string[];
        for (const base of bases) {
            try {
                const res = await fetch(`${base.replace(/\/$/, '')}/airtel-logo-services.png`, { signal: AbortSignal.timeout(5000) });
                if (!res.ok) continue;
                return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
            } catch { /* następny adres */ }
        }
        return '';
    }

    // @anchor run-offer-budget-job
    private async runOfferBudgetJob(jobId: string, body: any, userId: string | null) {
        const projectName = String(body?.projectName || '').trim();
        const nodeId = String(body.nodeId);
        const notify = async (title: string, text: string) => {
            if (!userId) return;
            try {
                await this.notificationsService.create(userId, 'AI_OFFER_ANALYSIS', title, text, nodeId);
                // tab/section — klik w push otwiera zamówienie od razu na sekcji Oferta.
                await this.pushService.sendToUser(userId, title, text, nodeId, { tab: 'unified', section: 'oferta' });
            } catch (e) {
                this.logger.warn(`[OfferAiAnalysis] powiadomienie nieudane: ${e?.message}`);
            }
        };
        try {
            const result: any = await this.checkOfferVsBudget(body);
            let documentId: string | null = null;
            let documentError = '';
            try {
                const html = buildOfferAiReportHtml(result, projectName, await this.fetchLogoDataUrl());
                const pdf = await this.pdfService.render(html);
                const filename = offerAiReportFilename(projectName);
                // processDocument dekoduje nazwę latin1→utf8 (tak przychodzi z multera) — podajemy ją w tej postaci.
                const saved: any = await this.documentsService.processDocument({
                    originalname: Buffer.from(filename, 'utf8').toString('latin1'),
                    buffer: pdf,
                    mimetype: 'application/pdf',
                    size: pdf.length,
                } as any, nodeId, 'standard');
                documentId = saved?.nodeId || null;
                result.documentName = filename;
            } catch (e) {
                documentError = e?.message || String(e);
                this.logger.error(`[OfferAiAnalysis] raport PDF nieudany: ${documentError}`);
            }
            await this.prisma.offerAiAnalysis.update({
                where: { id: jobId },
                data: { status: 'DONE', result, documentId, error: documentError ? `Raport PDF: ${documentError}` : null, finishedAt: new Date() },
            });
            const counts = (result.findings || []).reduce((a: any, f: any) => { a[f.severity] = (a[f.severity] || 0) + 1; return a; }, {});
            await notify(
                `Analiza AI oferty gotowa${projectName ? `: ${projectName}` : ''}`,
                `Błędy: ${counts.error || 0}, ostrzeżenia: ${counts.warning || 0}, do sprawdzenia: ${counts.info || 0}.${documentId ? ' Raport PDF jest w dokumentacji projektu.' : ''}`,
            );
        } catch (e) {
            const message = e?.response?.message || e?.message || String(e);
            this.logger.error(`[OfferAiAnalysis] analiza nieudana: ${message}`);
            await this.prisma.offerAiAnalysis.update({
                where: { id: jobId },
                data: { status: 'ERROR', error: String(message).slice(0, 2000), finishedAt: new Date() },
            }).catch(() => {});
            await notify(`Analiza AI oferty nieudana${projectName ? `: ${projectName}` : ''}`, String(message).slice(0, 300));
        }
    }

    /**
     * Generuje estymację projektu (WBS + Budżet) na podstawie wymagań.
     * Analizuje podobne historyczne projekty i proponuje strukturę.
     */
    async estimateProject(nodeId: string, versionId: string) {
        this.logger.log(`Generating AI estimation for node ${nodeId}, version ${versionId}`);

        // 1. Pobierz wymagania dla tej wersji
        const requirements = await this.prisma.orderRequirements.findFirst({
            where: { nodeId, versionId },
        });

        if (!requirements) {
            throw new Error('Project requirements not found for this version');
        }

        const query = `
      Project Goal: ${requirements.projectGoal}
      Project Items: ${requirements.projectItems}
      Deadline: ${requirements.offerDeadline}
    `;

        // 2. Szukaj podobnych projektów w VectorStore
        const similarResults = await this.vectorService.searchSimilar(query, {
            must: [
                { key: 'sourceType', match: { value: 'Historical Project' } }
            ]
        }, 3);

        // 3. Przygotuj kontekst dla LLM
        const context = similarResults.map(p => p.payload.text as string).join('\n\n---\n\n');

        const prompt = `
      Jesteś ekspertem ds. planowania projektów ERP i teletechnicznych. 
      Na podstawie poniższych wymagań oraz historycznych projektów (kontekst), przygotuj:
      1. Strukturę WBS (zadania główne i podzadania).
      2. Wstępny budżet (pozycje: robocizna, materiały, usługi obce).

      WYMAGANIA:
      ${query}

      KONTEKST (PODOBNE PROJEKTY):
      ${context}

      ZWRÓĆ WYNIK W FORMACIE JSON:
      {
        "tasks": [
          { "name": "Nazwa zadania", "description": "Opis", "items": ["Podzadanie 1", "Podzadanie 2"] }
        ],
        "budget": [
          { "type": "WORK|MATERIAL|EXTERNAL_SERVICE", "description": "Opis", "unit": "szt/h", "unitCost": 0, "quantity": 1, "margin": 0.2 }
        ]
      }
    `;

        // 4. Wywołaj LLM
        const aiResponse = await this.vectorService.askGemini(prompt, [], []);

        // Parsowanie wyniku AI (zakładamy poprawny JSON)
        try {
            const cleanJson = aiResponse.match(/\{[\s\S]*\}/)?.[0] || aiResponse;
            const estimation = JSON.parse(cleanJson);
            return estimation;
        } catch (err) {
            this.logger.error('Failed to parse AI estimation JSON', err);
            return { raw: aiResponse };
        }
    }

    /**
     * Zapisuje wygenerowaną estymację do bazy danych.
     */
    async applyEstimation(nodeId: string, versionId: string, data: any) {
        this.logger.log(`Applying AI estimation to version ${versionId}`);
        const vId = (versionId === 'null' || versionId === 'undefined' || !versionId) ? null : versionId;

        // Czyszczenie starego planu przed wgraniem nowego, by zapobiec duplikatom
        try {
            await this.prisma.budgetLineItem.deleteMany({
                where: { nodeId, versionId: vId }
            });
            await this.prisma.subtask.deleteMany({
                where: { nodeId, versionId: vId }
            });
            this.logger.log(`Wyczyszczono poprzednie pozycje WBS i budżetowe dla węzła ${nodeId}`);
        } catch (e) {
            this.logger.error('Napotkano błąd podczas czyszczenia poprzednich pozycji, kontynuuję:', e);
        }

        // 1. Dodaj zadania (WBS)
        if (data.tasks && Array.isArray(data.tasks)) {
            for (const task of data.tasks) {
                await this.prisma.subtask.create({
                    data: {
                        nodeId,
                        versionId: vId,
                        name: task.name,
                        description: task.description,
                        status: 'NEW',
                    }
                });
            }
        }

        // 2. Dodaj pozycje budżetowe
        if (data.budget && Array.isArray(data.budget)) {
            for (const item of data.budget) {
                const unitCost = Number(item.unitCost) || 0;
                const margin = Number(item.margin) || 0;
                const unitPrice = unitCost * (1 + margin);
                const quantity = Number(item.quantity) || 1;

                await this.prisma.budgetLineItem.create({
                    data: {
                        nodeId,
                        versionId: vId,
                        type: item.type || 'MATERIAL',
                        description: item.description || 'Nowy element',
                        unit: item.unit || 'sztuki',
                        unitCost,
                        quantity,
                        totalCost: unitCost * quantity,
                        margin,
                        unitPrice,
                        totalPrice: unitPrice * quantity,
                    }
                });
            }
        }

        return { success: true };
    }

    /**
     * "Reviewer AI" - krytyczna analiza istniejącego planu
     */
    // @anchor check-offer-vs-budget
    /**
     * Porównuje zapisy tekstowe (oferta + strategie) z pozycjami budżetu.
     * Model dostaje najpierw KONTEKST: przedmiot projektu (cel/zakres z wymagań
     * zamówienia) i pełne drzewo WBS — gałęzie z sumami i składowe z wartościami —
     * żeby rozumiał, czego dotyczy każda pozycja, zanim zacznie porównywać.
     * Pozycje budżetu (liście) dostają krótkie identyfikatory B1..Bn, na które model
     * się powołuje; mapujemy je z powrotem na węzły WBS. Wynik to lista rozbieżności
     * do przejrzenia przez człowieka, nie automatyczny werdykt.
     */
    async checkOfferVsBudget(body: any) {
        const clip = (v: any, max: number) => String(v ?? '').slice(0, max);
        const num = (v: any) => Number(v) || 0;
        const offerText = clip(body?.offerText, 60000).trim();
        const projectName = clip(body?.projectName, 200);

        // Drzewo WBS w kolejności DFS (front liczy sumy gałęzi tak jak w budżecie).
        const nodes = (Array.isArray(body?.nodes) ? body.nodes : []).slice(0, 3000).map((n: any) => ({
            id: clip(n?.id, 64),
            depth: Math.max(0, Math.min(12, Math.floor(num(n?.depth)))),
            name: clip(n?.name, 300),
            type: clip(n?.type, 40),
            isBranch: !!n?.isBranch,
            path: clip(n?.path, 500),
            quantity: num(n?.quantity),
            unit: clip(n?.unit, 20),
            unitCost: num(n?.unitCost),
            totalCost: num(n?.totalCost),
            marginPct: num(n?.margin),
            offerPrice: num(n?.offerPrice),
            comment: clip(n?.comment, 500),
            strategy: clip(n?.strategy, 4000).trim(),
            ref: '',
        }));
        let refNo = 0;
        for (const n of nodes) if (!n.isBranch) n.ref = `B${++refNo}`;
        const items = nodes.filter((n: any) => n.ref);
        const strategies = nodes.filter((n: any) => n.strategy);
        if (!offerText && !strategies.length) throw new BadRequestException('Brak tekstu oferty i strategii do porównania');
        if (!items.length) throw new BadRequestException('Budżet nie ma pozycji do porównania');

        // Przedmiot projektu — cel i zakres z wymagań zamówienia (jeśli uzupełnione).
        let goal = '';
        let scope = '';
        if (body?.nodeId) {
            const vId = body?.versionId && body.versionId !== 'null' ? String(body.versionId) : null;
            const req = await this.prisma.orderRequirements.findFirst({ where: { nodeId: String(body.nodeId), versionId: vId } })
                ?? await this.prisma.orderRequirements.findFirst({ where: { nodeId: String(body.nodeId) }, orderBy: { updatedAt: 'desc' } });
            goal = clip(req?.projectGoal, 4000).trim();
            scope = clip(req?.projectItems, 8000).trim();
        }

        const money = (v: number) => v.toFixed(2);
        const treeLines = nodes.map((n: any) => {
            const indent = '  '.repeat(n.depth);
            if (n.isBranch) return `${indent}[GAŁĄŹ] ${n.name} (${n.type || 'grupa'}) — suma koszt ${money(n.totalCost)}, cena ofert. ${money(n.offerPrice)}`;
            return `${indent}${n.ref} ${n.name} | ${n.type} | ${n.quantity} ${n.unit} | koszt jedn. ${money(n.unitCost)} | koszt ${money(n.totalCost)} | narzut ${n.marginPct}% | cena ofert. ${money(n.offerPrice)}${n.comment ? ` | komentarz: ${n.comment}` : ''}`;
        }).join('\n');
        const topBranches = nodes.filter((n: any) => n.depth === 0).map((n: any) => `- ${n.name}`).join('\n');
        const strategyLines = strategies.map((s: any) => `### ${s.path}${s.ref ? ` (${s.ref})` : ''}\n${s.strategy}`).join('\n\n');

        const prompt = `Jesteś kontrolerem ofert firmy instalacyjnej (teletechnika, okablowanie, monitoring, łączność, prace montażowe). Twoje zadanie: sprawdzić, czy ZAPISY TEKSTOWE (oferta dla klienta + wewnętrzne strategie realizacji) zgadzają się z BUDŻETEM projektu.

KROK 1 — ZROZUM PROJEKT. Zanim porównasz cokolwiek, ustal na podstawie sekcji PRZEDMIOT PROJEKTU i DRZEWO WBS:
- co jest przedmiotem projektu (co firma dostarcza i wykonuje, dla kogo, gdzie),
- jakie są główne gałęzie (zakresy) i z jakich składowych się składają,
- do której gałęzi odnosi się każdy fragment oferty i każda strategia.
Pozycję budżetu oceniaj ZAWSZE w kontekście jej gałęzi (np. „kabel" w gałęzi „Monitoring" to okablowanie kamer, a nie zasilania).

KROK 2 — PORÓWNAJ. Szukaj rozbieżności w czterech kategoriach:
- "brak_w_budzecie": tekst obiecuje/zakłada dostawę, pracę, materiał lub usługę, której nie ma w budżecie danej gałęzi (albo ma zerowy koszt/ilość).
- "brak_w_tekscie": pozycja budżetu o istotnym koszcie, której oferta ani strategie w ogóle nie uzasadniają.
- "niezgodnosc_wartosci": liczby w tekście (ilości, dni, obiekty, km, osoby, parametry, np. moc UPS) nie zgadzają się z ilościami/jednostkami w budżecie.
- "sprzecznosc": sens zapisu przeczy budżetowi (np. strategia „nie liczymy podnośnika", a podnośnik ma koszt; „dostawa po stronie klienta", a pozycja jest w budżecie).

KROK 3 — PORÓWNAJ POZYCJE BUDŻETU MIĘDZY SOBĄ (kategoria "miedzy_pozycjami"), w obrębie gałęzi i między gałęziami:
- ilości powiązane: urządzenia vs uchwyty/konstrukcje/porty/licencje; długości kabli vs trasy/rury/koryta; dni pracy vs skala montażu; paliwo/km vs liczba wyjazdów; noclegi i diety vs dni pracy i liczba osób,
- pozycje towarzyszące: materiał bez pracy montażu, praca bez materiału, urządzenie bez okablowania lub zasilania,
- duplikaty: ta sama rzecz policzona dwa razy (np. w gałęzi i w kosztach ogólnych),
- ta sama pozycja w różnych gałęziach z różną jednostką albo nieproporcjonalną ilością,
- narzut rażąco odbiegający od podobnych pozycji.
Różnic cen jednostkowych tej samej pozycji NIE zgłaszaj — liczy je osobno program.

Zasady:
- Zgłaszaj tylko rozbieżności, które da się wskazać konkretnym cytatem lub konkretną pozycją. Nie zgłaszaj ogólnych rad ani stylu tekstu.
- Pozycje zbiorcze (np. „materiały drobne", „zarządzanie projektem") mogą pokrywać wiele zapisów — nie zgłaszaj braku, jeśli pozycja zbiorcza rozsądnie to obejmuje.
- Strategia przypisana do gałęzi/pozycji dotyczy tej gałęzi — porównuj ją przede wszystkim z pozycjami tej gałęzi.
- "branch" = nazwa gałęzi najwyższego poziomu, której dotyczy rozbieżność (pusta, jeśli dotyczy całego projektu).
- "quote" = dosłowny, krótki (do 200 znaków) fragment oferty lub strategii; pusty dla "brak_w_tekscie".
- "budgetRefs" = identyfikatory B.. z drzewa WBS; pusta lista, gdy pozycji brak. Dla "miedzy_pozycjami" podaj wszystkie porównywane pozycje.
- "severity": "error" (realna strata pieniędzy lub obietnica bez pokrycia), "warning" (prawdopodobna niespójność), "info" (do sprawdzenia).
- Pisz po polsku, zwięźle.

Zwróć WYŁĄCZNIE JSON bez komentarzy i bez bloków kodu:
{"projectUnderstanding":"3-5 zdań: czym jest projekt, główne gałęzie i co obejmują","summary":"2-3 zdania oceny zgodności oferty z budżetem","findings":[{"severity":"error|warning|info","category":"brak_w_budzecie|brak_w_tekscie|niezgodnosc_wartosci|sprzecznosc|miedzy_pozycjami","branch":"...","source":"oferta|strategia|budzet","quote":"...","budgetRefs":["B1"],"description":"na czym polega rozbieżność","suggestion":"co poprawić"}]}

=== PRZEDMIOT PROJEKTU ===
Nazwa: ${projectName || '(brak)'}
Cel projektu: ${goal || '(nie uzupełniono)'}
Zakres zamówienia: ${scope || '(nie uzupełniono)'}
Główne gałęzie WBS:
${topBranches || '(brak)'}

=== DRZEWO WBS (wcięcie = poziom; [GAŁĄŹ] = zakres grupujący z sumą; B.. = pozycja budżetu: typ | ilość jednostka | koszt jedn. | koszt | narzut | cena ofertowa) ===
${treeLines}

=== OFERTA DLA KLIENTA ===
${offerText || '(brak tekstu oferty)'}

=== STRATEGIE REALIZACJI (ścieżka gałęzi WBS, pod nią treść) ===
${strategyLines || '(brak strategii)'}`;

        const raw = await this.vectorService.generateRaw(prompt);
        const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
        let parsed: any;
        try {
            parsed = JSON.parse(jsonText || '');
        } catch {
            this.logger.warn(`[OfferBudgetCheck] niepoprawny JSON od modelu: ${raw.slice(0, 300)}`);
            throw new BadRequestException('Model AI zwrócił nieczytelną odpowiedź — spróbuj ponownie');
        }

        const byRef = new Map(items.map((it: any) => [it.ref, it]));
        const SEVERITIES = ['error', 'warning', 'info'];
        const CATEGORIES = ['brak_w_budzecie', 'brak_w_tekscie', 'niezgodnosc_wartosci', 'sprzecznosc', 'miedzy_pozycjami'];
        const findings = (Array.isArray(parsed?.findings) ? parsed.findings : []).map((f: any) => ({
            severity: SEVERITIES.includes(f?.severity) ? f.severity : 'info',
            category: CATEGORIES.includes(f?.category) ? f.category : 'sprzecznosc',
            branch: clip(f?.branch, 300),
            source: ['oferta', 'strategia', 'budzet'].includes(f?.source) ? f.source : '',
            quote: clip(f?.quote, 400),
            description: clip(f?.description, 1500),
            suggestion: clip(f?.suggestion, 1000),
            budgetItems: (Array.isArray(f?.budgetRefs) ? f.budgetRefs : [])
                .map((r: any) => byRef.get(String(r).trim()))
                .filter(Boolean)
                .map((it: any) => ({ id: it.id, path: it.path, quantity: it.quantity, unit: it.unit, totalCost: it.totalCost, offerPrice: it.offerPrice })),
        })).filter((f: any) => f.description);
        findings.push(...this.findUnitCostMismatches(items));
        const rank: Record<string, number> = { error: 0, warning: 1, info: 2 };
        findings.sort((a: any, b: any) => rank[a.severity] - rank[b.severity]);

        return {
            createdAt: new Date().toISOString(),
            model: process.env.AI_MODEL || '',
            projectUnderstanding: clip(parsed?.projectUnderstanding, 3000),
            summary: clip(parsed?.summary, 2000),
            itemsChecked: items.length,
            strategiesChecked: strategies.length,
            findings,
        };
    }

    // @anchor find-unit-cost-mismatches
    // Liczone programowo, nie przez AI: ta sama pozycja (nazwa + jednostka) w kilku miejscach
    // budżetu z różnym kosztem jednostkowym (różnica > 1%). Zerowy koszt pomijamy — to brak
    // wyceny, który łapie osobno walidacja eksportu.
    private findUnitCostMismatches(items: any[]) {
        const norm = (v: string) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const groups = new Map<string, any[]>();
        for (const it of items) {
            if (!(it.unitCost > 0) || !norm(it.name)) continue;
            const key = `${norm(it.name)}||${norm(it.unit)}`;
            (groups.get(key) || groups.set(key, []).get(key)!).push(it);
        }
        const out: any[] = [];
        for (const list of groups.values()) {
            if (list.length < 2) continue;
            const costs = list.map(it => it.unitCost);
            const min = Math.min(...costs), max = Math.max(...costs);
            if (max - min <= min * 0.01) continue;
            out.push({
                severity: 'warning',
                category: 'miedzy_pozycjami',
                branch: '',
                source: 'budzet',
                quote: '',
                description: `Pozycja „${list[0].name}" (${list[0].unit}) występuje ${list.length}× z różnym kosztem jednostkowym: od ${min.toFixed(2)} do ${max.toFixed(2)} PLN.`,
                suggestion: 'Ujednolicić koszt jednostkowy albo rozróżnić nazwy, jeśli to różne produkty.',
                budgetItems: list.map(it => ({ id: it.id, path: it.path, quantity: it.quantity, unit: it.unit, totalCost: it.totalCost, offerPrice: it.offerPrice, unitCost: it.unitCost })),
            });
        }
        return out;
    }

    async analyzePlan(nodeId: string, versionId: string) {
        // Pobierz obecny WBS i Budżet
        const subtasks = await this.prisma.subtask.findMany({ where: { nodeId, versionId } });
        const budget = await this.prisma.budgetLineItem.findMany({ where: { versionId } });

        const prompt = `
      Przeanalizuj poniższy plan projektu i budżet pod kątem braków, ryzyk i błędów w estymacji kosztów.
      
      ZADANIA (WBS):
      ${JSON.stringify(subtasks, null, 2)}

      BUDŻET:
      ${JSON.stringify(budget, null, 2)}

      Wskaż 3 kluczowe ryzyka i zaproponuj konkretne poprawki.
    `;

        return this.vectorService.askGemini(prompt, [], []);
    }

    async proposeWbs(nodeId: string, versionId: string, providedItems?: any) {
        const vId = (versionId === 'null' || versionId === 'undefined' || !versionId) ? null : versionId;

        let items = providedItems;

        if (!items) {
            const requirements = await this.prisma.orderRequirements.findFirst({
                where: { nodeId, versionId: vId },
            });
            if (requirements) {
                try {
                    items = JSON.parse(requirements.projectItems || '{}');
                } catch (e) {
                    this.logger.error('Failed to parse project items from DB', e);
                }
            }
        }

        if (!items || Object.keys(items).length === 0) {
            throw new Error('No project items found to propose WBS for.');
        }

        const itemsList = Object.entries(items).flatMap(([cat, list]: [string, any]) =>
            (list || []).map(i => `- ID: ${i.id}, NAZWA: ${i.name}, KATEGORIA: ${cat}`)
        ).join('\n');

        const prompt = `
      Jesteś ekspertem planowania prac (WBS) dla systemów niskoprądowych i IT. 
      Twoim zadaniem jest przypisanie przedmiotów projektu do właściwych etapów.

      ETAPY DEFINICJE:
      1. PRZED (Przedinstalacyjny): Logistyka, zakupy, projekty techniczne, zgłoszenia formalne, dokumentacja BHP, certyfikaty i szkolenia wymagane PRZED wejściem na teren budowy, wymagania terminowe i organizacyjne.
      2. INSTAL (Instalacyjny): Fizyczny montaż, instalacja urządzeń, układanie kabli, konfiguracja, uruchomienie, pomiary.
      3. PO (Poinstalacyjny): Szkolenia użytkownika końcowego, dokumentacja powykonawcza, testy odbiorcze, asysta poodbiorowa, gwarancja.

      PRZYKŁADY POPRAWNEGO MAPOWANIA (Few-Shot):
      - "Instalacja 8 kamer" -> ["INSTAL"] (fizyczna praca montażowa)
      - "Projekt wykonawczy CCTV" -> ["PRZED"] (dokumentacja wstępna przed pracami)
      - "Szkolenie z obsługi DVR" -> ["PO"] (szkolenie użytkownika po montażu)
      - "Zakup rejestratora 16-kanałowego" -> ["PRZED"] (logistyka/zakupy przed montażem)
      - "Konfiguracja zdalnego dostępu" -> ["INSTAL"] (część uruchomienia)
      - "Dokumentacja BHP" -> ["PRZED"] (wymagana przez ekipę PRZED wejściem na teren)
      - "zdane Egzaminy Złote Zasady" -> ["PRZED"] (certyfikat wymagany przed rozpoczęciem prac)
      - "Dokumentacja powykonawcza" -> ["PO"] (tworzona dopiero po zakończeniu instalacji)
      - "zakończenie instalacji do 30.05" -> ["PRZED"] (wymaganie terminowe, deadline projektu)

      ZASADY KRYTYCZNE:
      - "BHP", "certyfikat", "egzamin", "szkolenie wstępne" -> zawsze PRZED
      - "Instalacja [czegokolwiek]", "Montaż [czegokolwiek]" -> zawsze INSTAL
      - "dokumentacja powykonawcza", "test odbiorczy", "szkolenie obsługi" -> zawsze PO
      - Wymagania terminowe (deadline'y projektu) -> PRZED
      - NIE przypisuj tego samego przedmiotu do więcej niż jednego etapu.

      LISTA PRZEDMIOTÓW DO PRZYPISANIA:
      ${itemsList}

      ZWRÓĆ WYŁĄCZNIE CZYSTY JSON:
      {
        "proposals": [
          { "itemId": "id_z_listy", "name": "nazwa", "category": "kategoria", "phases": ["PRZED"] }
        ]
      }
    `;

        const aiResponse = await this.vectorService.askGemini(prompt, [], []);
        try {
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            const cleanJson = jsonMatch ? jsonMatch[0] : aiResponse;
            return JSON.parse(cleanJson);
        } catch (err) {
            this.logger.error('Failed to parse AI proposal JSON', err);
            return { raw: aiResponse };
        }
    }

    /**
     * Główny koordynator Auto-Deploy Workflow
     * Na podstawie pliku (lub jego surowego tekstu z zaindeksowanych danych) wyciąga wymagania,
     * a następnie tworzy strukturę (WBS i budżet).
     */
    async runAutoDeployWorkflow(nodeId: string, rawVersionId: string, file: Express.Multer.File, fileNodeId?: string) {
        const versionId = (rawVersionId === 'null' || rawVersionId === 'undefined' || !rawVersionId) ? null : rawVersionId;
        this.logger.log(`[AI WORKFLOW] Starting for node ${nodeId}, version ${versionId}, file: ${file.originalname}`);

        // KROK 1: EKSTRAKCJA TEKSTU i WYMAGAŃ (Cel i Przedmioty)
        // Pytamy nasz RAG (VectorStore) o cały plik
        let contextText = "";
        if (fileNodeId) {
            const filter = {
                must: [
                    { key: "fileId", match: { value: fileNodeId } }
                ]
            };
            // Pobieramy większość tekstu indeksowanego pliku (limit 20 chunków to zazwyczaj 20 000 znaków)
            const searchResults = await this.vectorService.hybridSearch("Cel projektu, wykaz sprzętu", filter, 20);
            contextText = searchResults.map(p => p.payload.text).join('\n\n');
        }

        const extractionPrompt = `
          Poniżej znajduje się tekst wyodrębniony ze specyfikacji przetargowej (OPZ / SWZ).
          Twoim zadaniem jest znalezienie i opisanie Głównego Celu Projektu (projectGoal) oraz rozpisanie go na Przedmioty w konkretnych Kategoriach (projectItems).

          FRAGMENTY DOKUMENTU:
          ${contextText || "[Brak dostępu do tekstu, spróbuj wywnioskować na podstawie nazwy: " + file.originalname + "]"}

          Dozwolone KRÓTKIE klucze kategorii dla projectItems to:
          "terminowe", "instalacyjne", "organizacyjne", "jakosciowe", "techniczne", "finansowe", "sla", "gwarancyjne".

          Wygeneruj odpowiedź PRAWIDŁOWYM formacie JSON z dokładnie takimi kluczami (Pomiń kategorie dla których nic nie znajdziesz):
          {
            "projectGoal": "Krótki, jednozdaniowy cel np. Instalacja 10 kamer i systemu SSWiN w szkole w Warszawie",
            "projectItems": {
                "instalacyjne": [{"id": "uuid", "name": "Kamera IP 4MP", "description": "Rozdzielczość 4MP, IP67"}, {"id": "uuid", "name": "Montaż kamer szt. 10", "description": ""} ],
                "organizacyjne": [{"id": "uuid", "name": "Szkolenie asystenta", "description": ""}],
                "gwarancyjne": [{"id": "uuid", "name": "36 miesiecy gwarancji na sprzet", "description": ""}]
            }
          }
          UWAGA: Pamiętaj by dla każdego itemu nadać fałszywe losowe pole "id".
        `;

        this.logger.log(`[AI WORKFLOW] Ekstrakcja wymagań...`);
        const extractionResponse = await this.vectorService.askGemini(extractionPrompt, [], []);
        let requirementsData;
        try {
            // Remove markdown code blocks if present
            let cleanString = extractionResponse.replace(/```(json)?/g, '').replace(/```/g, '').trim();
            const startIdx = cleanString.indexOf('{');
            const endIdx = cleanString.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
                cleanString = cleanString.substring(startIdx, endIdx + 1);
            }
            requirementsData = JSON.parse(cleanString);
            this.logger.log(`[AI WORKFLOW] Extracted Requirements JSON: ${JSON.stringify(requirementsData).substring(0, 1000)}`);
        } catch (e) {
            this.logger.error("Failed to parse extracted requirements. Raw response: " + extractionResponse, e);
            throw new Error(`Failed to extract requirements from document. Raw AI response: ${extractionResponse.substring(0, 500)}`);
        }

        // Zapisz uzyskane wymagania do bazy danych
        const reqJsonString = JSON.stringify(requirementsData.projectItems || {});
        // Próba znalezienia żeby sprawdzić upsert (findFirst vs create/update)
        const existingReq = await this.prisma.orderRequirements.findFirst({
            where: { nodeId, versionId }
        });

        if (existingReq) {
            await this.prisma.orderRequirements.update({
                where: { id: existingReq.id },
                data: {
                    projectGoal: requirementsData.projectGoal || 'Wygenerowany Automatycznie',
                    projectItems: reqJsonString
                }
            });
        } else {
            await this.prisma.orderRequirements.create({
                data: {
                    nodeId,
                    versionId,
                    projectGoal: requirementsData.projectGoal || 'Wygenerowany Automatycznie',
                    projectItems: reqJsonString
                }
            });
        }

        // KROK 2 & 3: Zbudowanie WBS i Budżetu z uzyskanych wymagań
        this.logger.log(`[AI WORKFLOW] Budowa WBS i budżetu...`);
        const estimationData = await this.estimateProject(nodeId, versionId);

        if (!estimationData.tasks && !estimationData.budget) {
            this.logger.warn("Wygenerowany plan jest pusty / uległ awarii.");
        } else {
            // KROK 4: Implementacja wyestymowanego planu
            this.logger.log(`[AI WORKFLOW] Zapisywanie zaleceń...`);
            await this.applyEstimation(nodeId, versionId, estimationData);
        }

        return {
            requirementsExtracted: requirementsData,
            planCreated: true
        };
    }
}
