import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VectorService } from './vector.service';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);

    constructor(
        private prisma: PrismaService,
        private vectorService: VectorService,
    ) { }

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
