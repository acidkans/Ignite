import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    Document, Packer, Paragraph, TextRun, ImageRun,
    Table, TableRow, TableCell, TableLayoutType,
    WidthType, BorderStyle, AlignmentType, VerticalAlign, ShadingType,
} from 'docx';
import { ProtokolOdbioruDto, StatusOdbioruDto, ZapisProtokoluDto } from './acceptance-protocol.dto';

// @anchor acceptance-protocols-service
// Generator protokołu odbioru prac w DOCX — odwzorowanie formularza Airtela
// („protokół odbioru technicznego.docx"). Budujemy dokument OD ZERA biblioteką `docx`,
// a nie podmieniamy tekst w oryginalnym pliku: opis zakresu i tabela wartości mają
// ZMIENNĄ liczbę wierszy, a szablon z podmianą tekstu obsługuje tylko stały układ.
//
// Ten sam zestaw danych (`ProtokolOdbioruDto`) renderuje front do HTML i dalej do PDF,
// więc oba wyjścia niosą identyczną treść.

// Siatka tabeli głównej ma 6 kolumn, bo dzieli się bez reszty na 1, 2 i 3 — wiersz etykiety
// zajmuje 6, wiersz „protokół usterkowy" 4+2, a wiersz rodzaju odbioru trzy razy po 2.
const SIATKA = 6;

const CZCIONKA = 'Calibri';
const KOLOR_ETYKIETY = 'D9D9D9';
const KOLOR_RAMKI = '7F7F7F';

const ramka = { style: BorderStyle.SINGLE, size: 4, color: KOLOR_RAMKI };
const RAMKI = { top: ramka, bottom: ramka, left: ramka, right: ramka };

// @anchor acceptance-protocol-signature-size
// Skan podpisu ma zajmować 80% szerokości kolumny podpisu. Word nie zna procentów przy
// obrazku, więc liczymy w pikselach: kolumna 3100 twips minus marginesy komórki (2x100),
// przeliczone przy 96 DPI. Wysokość wprost z proporcji pliku (361x137) — nigdy wpisana
// ręcznie, bo rozjazd z oryginałem rozciąga podpis.
const PODPIS_KOLUMNA_TWIPS = 3100;
// 318x58 to PRZYCIĘTY skan — plik miał wokół podpisu przezroczysty margines (atrament
// zajmował 318x58 na płótnie 361x137), przez co obrazek na 80% kolumny dawał widoczny
// podpis na jakieś 60%. Po przycięciu 80% szerokości to 80% widocznego podpisu.
const PODPIS_PROPORCJA = 318 / 58;
const PODPIS_SZEROKOSC_PX = Math.round(((PODPIS_KOLUMNA_TWIPS - 200) / 1440) * 96 * 0.8);
const PODPIS_WYSOKOSC_PX = Math.round(PODPIS_SZEROKOSC_PX / PODPIS_PROPORCJA);
// Pusta kolumna rezerwuje tę samą wysokość, żeby kreski pod podpisami stały w jednej linii.
// `spacing` liczy w dwudziestych częściach punktu: 1 px = 0,75 pt = 15 jednostek.
const PODPIS_ODSTEP = PODPIS_WYSOKOSC_PX * 15;

// @anchor acceptance-protocol-data-url-to-buffer
// Front wysyła logo i podpis jako data URL — tym samym kanałem, którym karmi eksport PDF
// (`fetchLogoDataUrl`). Dzięki temu obrazki mają JEDNO źródło w `apps/frontend/public`
// i nie trzeba ich duplikować w assetach backendu ani uczyć nest-cli ich kopiowania.
function dataUrlToBuffer(dataUrl?: string): Buffer | null {
    if (!dataUrl) return null;
    const i = dataUrl.indexOf('base64,');
    if (i < 0) return null;
    try {
        return Buffer.from(dataUrl.slice(i + 7), 'base64');
    } catch {
        return null;
    }
}

const zl = (v: number) =>
    `${(Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pln`;

@Injectable()
export class AcceptanceProtocolsService {
    private readonly logger = new Logger(AcceptanceProtocolsService.name);

    constructor(private readonly prisma: PrismaService) {}

    // ─ Klocki ────────────────────────────────────────────────────────────────

    private tekst(text: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) {
        return new TextRun({
            text,
            bold: opts.bold,
            italics: opts.italics,
            color: opts.color,
            size: (opts.size ?? 10) * 2, // docx liczy w półpunktach
            font: CZCIONKA,
        });
    }

    private akapit(text: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
        return new Paragraph({
            alignment: opts.align,
            spacing: { before: 20, after: 20 },
            children: [this.tekst(text, opts)],
        });
    }

    // Puste akapity zamiast pustego tekstu: komórka bez akapitu jest w OOXML nieprawidłowa
    // i Word potrafi odmówić otwarcia pliku.
    private wieleAkapitow(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
        const linie = String(text ?? '').split('\n');
        if (!linie.length) return [this.akapit('', opts)];
        return linie.map((l) => this.akapit(l, opts));
    }

    private komorka(children: (Paragraph | Table)[], opts: { span?: number; shade?: string; valign?: any } = {}) {
        return new TableCell({
            children,
            columnSpan: opts.span,
            borders: RAMKI,
            verticalAlign: opts.valign ?? VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            shading: opts.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.shade } : undefined,
        });
    }

    // @anchor acceptance-protocol-label-row — wiersz etykiety formularza: PL pogrubione,
    // EN pod spodem szarym drobnym drukiem. Dokładnie jak we wzorze, gdzie każde pole ma
    // podpis w dwóch językach.
    private wierszEtykiety(pl: string, en: string) {
        return new TableRow({
            children: [
                this.komorka(
                    [this.akapit(pl, { bold: true }), this.akapit(en, { size: 8, color: '595959', italics: true })],
                    { span: SIATKA, shade: KOLOR_ETYKIETY },
                ),
            ],
        });
    }

    private wierszTresci(children: (Paragraph | Table)[]) {
        return new TableRow({
            children: [this.komorka(children, { span: SIATKA, valign: VerticalAlign.TOP })],
        });
    }

    // ─ Nagłówek dokumentu ────────────────────────────────────────────────────

    private naglowek(logo: Buffer | null) {
        const tytul = [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: [this.tekst('PROTOKÓŁ ODBIORU PRAC', { bold: true, size: 14 })],
            }),
            // Literówka „COMMISIONING" jest w oryginalnym formularzu Airtela — zostaje,
            // żeby dokument z aplikacji był znakowo zgodny z wzorem obiegającym u klienta.
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 120 },
                children: [this.tekst('COMMISIONING PROTOCOL', { size: 10, color: '595959' })],
            }),
        ];

        if (!logo) return tytul;

        // Logo i tytuł obok siebie w bezramkowej tabeli — pływający obrazek z oryginału
        // (`wp:anchor`) w generowanym pliku łatwo ucieka poza margines.
        const brak = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        return [
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                layout: TableLayoutType.FIXED,
                borders: { top: brak, bottom: brak, left: brak, right: brak, insideHorizontal: brak, insideVertical: brak },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                width: { size: 30, type: WidthType.PERCENTAGE },
                                borders: { top: brak, bottom: brak, left: brak, right: brak },
                                verticalAlign: VerticalAlign.CENTER,
                                children: [
                                    new Paragraph({
                                        children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 150, height: 48 } })],
                                    }),
                                ],
                            }),
                            new TableCell({
                                width: { size: 70, type: WidthType.PERCENTAGE },
                                borders: { top: brak, bottom: brak, left: brak, right: brak },
                                verticalAlign: VerticalAlign.CENTER,
                                children: tytul,
                            }),
                        ],
                    }),
                ],
            }),
            new Paragraph({ children: [this.tekst('')] }),
        ];
    }

    // ─ Tabela numeru i daty ──────────────────────────────────────────────────

    private tabelaNumeru(d: ProtokolOdbioruDto) {
        const pole = (pl: string, en: string) =>
            this.komorka([this.akapit(pl, { bold: true }), this.akapit(en, { size: 8, color: '595959', italics: true })], { shade: KOLOR_ETYKIETY });

        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [2400, 3400, 1400, 2100],
            rows: [
                new TableRow({
                    children: [
                        pole('Numer protokołu*', 'Protocol number*'),
                        this.komorka([this.akapit(d.numer, { bold: true })]),
                        pole('Data', 'Date'),
                        this.komorka([this.akapit(d.data)]),
                    ],
                }),
            ],
        });
    }

    // ─ Tabela wartości odbieranego zakresu ───────────────────────────────────

    // @anchor acceptance-protocol-value-table — zagnieżdżona w wierszu treści tabeli głównej,
    // tak jak we wzorze. Wiersz „suma" ZAWSZE na końcu, nawet przy jednej pozycji — bez niego
    // odbierający musiałby dodawać w pamięci.
    private tabelaWartosci(d: ProtokolOdbioruDto) {
        const rows = [
            new TableRow({
                tableHeader: true,
                children: [
                    this.komorka([this.akapit('Zakres', { bold: true })], { shade: KOLOR_ETYKIETY }),
                    this.komorka([this.akapit('Wartość', { bold: true, align: AlignmentType.RIGHT })], { shade: KOLOR_ETYKIETY }),
                ],
            }),
            // Gałąź pogrubiona z podsumą, pod nią wcięte liście z własnymi kwotami.
            ...d.wartosci.flatMap((w) => [
                new TableRow({
                    children: [
                        this.komorka(this.wieleAkapitow(w.zakres, { bold: true })),
                        this.komorka([this.akapit(zl(w.wartosc), { bold: true, align: AlignmentType.RIGHT })]),
                    ],
                }),
                ...(w.pozycje || []).map((poz) =>
                    new TableRow({
                        children: [
                            this.komorka([
                                new Paragraph({
                                    indent: { left: 260 },
                                    spacing: { before: 20, after: 20 },
                                    children: [this.tekst(poz.nazwa)],
                                }),
                            ]),
                            this.komorka([this.akapit(zl(poz.wartosc), { align: AlignmentType.RIGHT })]),
                        ],
                    }),
                ),
            ]),
            new TableRow({
                children: [
                    this.komorka([this.akapit('suma', { bold: true })]),
                    this.komorka([this.akapit(zl(d.suma), { bold: true, align: AlignmentType.RIGHT })]),
                ],
            }),
        ];

        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [6400, 2400],
            rows,
        });
    }

    // ─ Strony protokołu ──────────────────────────────────────────────────────

    // @anchor acceptance-protocol-parties-rows — dwa wiersze na szczycie tabeli: nagłówki
    // „Zamawiający"/„Wykonawca" i pod nimi dane firm. Stoją NAD umową i zakresem, bo pierwsze
    // pytanie przy dokumencie odbioru brzmi „między kim a kim", a nie „za co".
    private wierszeStron(d: ProtokolOdbioruDto) {
        const kolumna = (strona: { nazwa: string; adres: string; nip: string }) =>
            this.komorka(
                [
                    this.akapit(strona?.nazwa || '—', { bold: true }),
                    this.akapit(strona?.adres || '—'),
                    this.akapit(`NIP ${strona?.nip || '—'}`),
                ],
                { span: SIATKA / 2 },
            );

        const naglowek = (pl: string, en: string) =>
            this.komorka(
                [
                    this.akapit(pl, { bold: true }),
                    this.akapit(en, { size: 8, color: '595959', italics: true }),
                ],
                { span: SIATKA / 2, shade: KOLOR_ETYKIETY },
            );

        return [
            new TableRow({ children: [naglowek('Zamawiający', 'Ordering party'), naglowek('Wykonawca', 'Contractor')] }),
            new TableRow({ children: [kolumna(d.zamawiajacy), kolumna(d.wykonawca)] }),
        ];
    }

    // ─ Rodzaj odbioru ────────────────────────────────────────────────────────

    private wierszRodzajuOdbioru(d: ProtokolOdbioruDto) {
        const opcja = (aktywna: boolean, pl: string, en: string) =>
            this.komorka(
                [
                    this.akapit(`${aktywna ? '☑' : '☐'} ${pl}`, { bold: aktywna }),
                    this.akapit(en, { size: 8, color: '595959', italics: true }),
                ],
                { span: 2 },
            );

        return new TableRow({
            children: [
                opcja(d.odbior === 'CALOSCIOWY', 'Całościowy odbiór pozycji', 'Overall reception of the item'),
                opcja(d.odbior === 'CZESCIOWY', 'Częściowy odbiór pozycji', 'Partial reception of the item'),
                opcja(
                    d.odbior === 'NIE_DOTYCZY',
                    'Zakres nie odebrany z uwagi na wady/braki',
                    'Scope not accepted due to defects/deficiencies',
                ),
            ],
        });
    }

    // @anchor acceptance-protocol-result-row — wiersz WYNIKU odbioru, tuż pod rodzajem
    // i nad wartością zakresu: kwotę czyta się dopiero po tym, czy roboty w ogóle przeszły.
    // Dwie kolumny po pół siatki, ta sama konwencja ☑/☐ co w rodzaju odbioru.
    private wierszWynikuOdbioru(d: ProtokolOdbioruDto) {
        const opcja = (aktywna: boolean, pl: string, en: string) =>
            this.komorka(
                [
                    this.akapit(`${aktywna ? '☑' : '☐'} ${pl}`, { bold: aktywna }),
                    this.akapit(en, { size: 8, color: '595959', italics: true }),
                ],
                { span: SIATKA / 2 },
            );

        return new TableRow({
            children: [
                opcja(d.wynik !== 'NEGATYWNY', 'Wynik odbioru pozytywny', 'Positive result of commissioning'),
                opcja(d.wynik === 'NEGATYWNY', 'Wynik odbioru negatywny', 'Negative result of commissioning'),
            ],
        });
    }

    // ─ Podpisy ───────────────────────────────────────────────────────────────

    // @anchor acceptance-protocol-signature — skan podpisu przedstawiciela Airtel wchodzi
    // do dokumentu AUTOMATYCZNIE (decyzja użytkownika). Kolumny podwykonawcy i inspektora
    // zostają puste — te podpisy zbiera się odręcznie po wydruku.
    // Data stoi NAD podpisem, osobno w każdej kolumnie — patrz `acceptance-protocol-signature-dates`.
    private tabelaPodpisow(d: ProtokolOdbioruDto, podpis: Buffer | null) {
        const kolumna = (rola: string, osoba: string, data: string, obrazek: Buffer | null) =>
            this.komorka(
                [
                    this.akapit(`Data ${data || '—'}`, { size: 8, color: '595959' }),
                    obrazek
                        ? new Paragraph({
                              alignment: AlignmentType.CENTER,
                              children: [
                                  new ImageRun({
                                      type: 'png',
                                      data: obrazek,
                                      transformation: { width: PODPIS_SZEROKOSC_PX, height: PODPIS_WYSOKOSC_PX },
                                  }),
                              ],
                          })
                        : new Paragraph({ spacing: { before: PODPIS_ODSTEP, after: 0 }, children: [this.tekst('')] }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        border: { top: { style: BorderStyle.SINGLE, size: 4, color: KOLOR_RAMKI } },
                        spacing: { before: 40, after: 20 },
                        children: [this.tekst(osoba || ' ')],
                    }),
                    this.akapit(rola, { size: 8, color: '595959', align: AlignmentType.CENTER }),
                ],
                { valign: VerticalAlign.BOTTOM },
            );

        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [PODPIS_KOLUMNA_TWIPS, PODPIS_KOLUMNA_TWIPS, PODPIS_KOLUMNA_TWIPS],
            rows: [
                new TableRow({
                    children: [
                        this.komorka(
                            [
                                this.akapit('Podpisy przedstawicieli stron', { bold: true }),
                                this.akapit('Signatures of parties representatives', { size: 8, color: '595959', italics: true }),
                            ],
                            { span: 3, shade: KOLOR_ETYKIETY },
                        ),
                    ],
                }),
                new TableRow({
                    children: [
                        kolumna('Przedstawiciel Airtel Services', d.przedstawicielAirtel, d.dataPodpisuAirtel, podpis),
                        kolumna('Przedstawiciel Podwykonawcy', d.przedstawicielPodwykonawcy, d.dataPodpisuPodwykonawcy, null),
                        kolumna('Inspektor nadzoru', d.inspektorNadzoru, d.dataPodpisuInspektora, null),
                    ],
                }),
            ],
        });
    }

    // ─ Dokument ──────────────────────────────────────────────────────────────

    // @anchor acceptance-protocols-build-docx
    async buildDocx(d: ProtokolOdbioruDto): Promise<Buffer> {
        const logo = dataUrlToBuffer(d.logoDataUrl);
        const podpis = dataUrlToBuffer(d.podpisDataUrl);

        const tak = d.protokolUsterkowy === true;
        const nie = d.protokolUsterkowy === false;

        const glowna = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: Array(SIATKA).fill(Math.round(9300 / SIATKA)),
            rows: [
                ...this.wierszeStron(d),

                this.wierszEtykiety('Dotyczy Umowy nr.', 'Agreement'),
                this.wierszTresci(this.wieleAkapitow(d.umowa || '—')),

                // Jeden punkt zamiast dwóch: osobny „Opis zakresu robót" powtarzał nazwy
                // pozycji, które tabela wartości i tak wymienia — z kwotą przy każdej.
                this.wierszEtykiety('Opis i wartość odbieranego zakresu', 'Description and value of commissioned scope'),
                this.wierszTresci([this.tabelaWartosci(d), new Paragraph({ children: [this.tekst('')] })]),

                this.wierszRodzajuOdbioru(d),
                this.wierszWynikuOdbioru(d),

                this.wierszEtykiety('Wady i usterki przedmiotu odbioru**', 'Defects or failures of subject of commissioning**'),
                this.wierszTresci([
                    ...this.wieleAkapitow(d.wady || '—'),
                    this.akapit('** jeżeli dotyczy, wpisać datę usunięcia / if applicable, include the date of removal', {
                        size: 8,
                        color: '595959',
                        italics: true,
                    }),
                ]),

                new TableRow({
                    children: [
                        this.komorka(
                            [
                                this.akapit('Listę wad i usterek zestawiono w protokole usterkowym'),
                                this.akapit('The list of defects and failures is compiled in the defect protocol', {
                                    size: 8,
                                    color: '595959',
                                    italics: true,
                                }),
                            ],
                            { span: 4 },
                        ),
                        this.komorka([this.akapit(`${tak ? '☑' : '☐'} Tak    ${nie ? '☑' : '☐'} Nie`)], { span: 2 }),
                    ],
                }),

                this.wierszEtykiety('Inne uwagi', 'Other remarks'),
                this.wierszTresci(this.wieleAkapitow(d.uwagi || '—')),

                this.wierszEtykiety('Lista załączników do protokołu', 'List of protocol attachements'),
                this.wierszTresci(this.wieleAkapitow(d.zalaczniki || '—')),
            ],
        });

        const doc = new Document({
            styles: { default: { document: { run: { font: CZCIONKA, size: 20 } } } },
            sections: [
                {
                    properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
                    children: [
                        ...this.naglowek(logo),
                        this.tabelaNumeru(d),
                        new Paragraph({ children: [this.tekst('')] }),
                        glowna,
                        new Paragraph({ children: [this.tekst('')] }),
                        this.tabelaPodpisow(d, podpis),
                    ],
                },
            ],
        });

        return Buffer.from(await Packer.toBuffer(doc));
    }

    // ─ Rejestr odbiorów ──────────────────────────────────────────────────────

    // @anchor acceptance-protocols-status
    // Ile z której pozycji już odebrano. `domkniete` bierze się z FLAGI `pelny`, nie
    // z porównania kwot: pozycja odebrana całościowo ma zostać zamknięta także wtedy, gdy
    // ktoś później podniesie jej wycenę — inaczej podpisany odbiór sam by się otwierał.
    async getStatus(nodeId: string): Promise<StatusOdbioruDto[]> {
        const items = await this.prisma.acceptanceProtocolItem.findMany({
            where: { protocol: { nodeId } },
            include: { protocol: { select: { numer: true, data: true, createdAt: true } } },
            orderBy: { protocol: { createdAt: 'asc' } },
        });

        const mapa = new Map<string, StatusOdbioruDto>();
        for (const it of items) {
            const wpis = mapa.get(it.wbsRootId)
                ?? { wbsRootId: it.wbsRootId, odebrane: 0, domkniete: false, protokoly: [] };
            mapa.set(it.wbsRootId, wpis);
            wpis.odebrane = Math.round((wpis.odebrane + it.wartosc) * 100) / 100;
            wpis.domkniete = wpis.domkniete || it.pelny;
            wpis.protokoly.push({
                numer: it.protocol.numer,
                data: it.protocol.data,
                wartosc: it.wartosc,
                pelny: it.pelny,
            });
        }
        return [...mapa.values()];
    }

    // @anchor acceptance-protocols-record
    // Zapis wystawionego protokołu. Klucz `nodeId + numer` jest unikalny i wpis idzie
    // UPSERTEM: powtórny eksport tego samego protokołu (pobranie, a chwilę potem mail
    // albo OneDrive) nadpisuje pozycje zamiast dokładać drugi komplet i podwajać
    // odebrane kwoty. Stare pozycje kasujemy w tej samej transakcji, co nowe wstawiamy —
    // przerwanie w połowie zostawiłoby protokół bez pozycji, czyli odbiór bez treści.
    async record(nodeId: string, dto: ZapisProtokoluDto, userId?: string) {
        const numer = String(dto?.numer || '').trim();
        if (!numer) throw new BadRequestException('Protokół bez numeru nie zostanie zapisany');
        if (!dto?.pozycje?.length) throw new BadRequestException('Protokół bez pozycji nie zostanie zapisany');

        const node = await this.prisma.processNode.findUnique({ where: { id: nodeId }, select: { id: true } });
        if (!node) throw new NotFoundException('Zamówienie nie znalezione');

        // Pozycja domknięta INNYM protokołem nie ma prawa wrócić do kolejnego — front ją
        // wyszarza, ale front bywa nieodświeżony, a drugi odbiór tej samej roboty to podwójna
        // płatność. Filtrujemy po `numer`, nie po id protokołu: powtórny eksport tego samego
        // numeru nadpisuje własne pozycje (upsert niżej) i nie może zablokować sam siebie.
        const juzDomkniete = await this.prisma.acceptanceProtocolItem.findMany({
            where: {
                protocol: { nodeId, numer: { not: numer } },
                pelny: true,
                wbsRootId: { in: dto.pozycje.map((p) => p.wbsRootId).filter(Boolean) },
            },
            select: { wbsRootId: true, nazwa: true, protocol: { select: { numer: true } } },
        });
        if (juzDomkniete.length) {
            const opis = [...new Map(juzDomkniete.map((d) => [d.wbsRootId, d])).values()]
                .map((d) => `${d.nazwa} (protokół ${d.protocol.numer})`)
                .join(', ');
            throw new BadRequestException(
                `Pozycje odebrane już w całości nie mogą wrócić do protokołu: ${opis}. Wycofaj wcześniejszy protokół, jeśli odbiór był pomyłką.`,
            );
        }

        return this.prisma.$transaction(async (tx) => {
            const protokol = await tx.acceptanceProtocolRecord.upsert({
                where: { nodeId_numer: { nodeId, numer } },
                create: { nodeId, numer, data: dto.data || '', odbior: dto.odbior || 'CALOSCIOWY', authorId: userId ?? null },
                update: { data: dto.data || '', odbior: dto.odbior || 'CALOSCIOWY', authorId: userId ?? null },
            });

            await tx.acceptanceProtocolItem.deleteMany({ where: { protocolId: protokol.id } });
            await tx.acceptanceProtocolItem.createMany({
                data: dto.pozycje.map((p) => ({
                    protocolId: protokol.id,
                    wbsRootId: p.wbsRootId,
                    nazwa: p.nazwa,
                    wartosc: Math.round((Number(p.wartosc) || 0) * 100) / 100,
                    pelny: !!p.pelny,
                })),
            });

            return protokol;
        });
    }

    // @anchor acceptance-protocols-list
    async list(nodeId: string) {
        return this.prisma.acceptanceProtocolRecord.findMany({
            where: { nodeId },
            include: { items: true, author: { select: { firstName: true, lastName: true, email: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    // @anchor acceptance-protocols-remove
    // Wycofanie zapisu — pozycje wracają do puli do odbioru (kasakada po `protocolId`).
    // Bez tego pomyłkowo wystawiony protokół wyszarzałby pozycję na zawsze, a sam PLIK
    // i tak żyje własnym życiem na OneDrive — kasujemy wyłącznie ślad w rejestrze.
    async remove(nodeId: string, protocolId: string) {
        const protokol = await this.prisma.acceptanceProtocolRecord.findUnique({ where: { id: protocolId } });
        if (!protokol || protokol.nodeId !== nodeId) throw new NotFoundException('Protokół nie należy do tego zamówienia');
        await this.prisma.acceptanceProtocolRecord.delete({ where: { id: protocolId } });
        return { ok: true };
    }
}
