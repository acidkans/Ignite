import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, BorderStyle, AlignmentType, WidthType } from 'docx';

@Injectable()
export class DocxService {
    private readonly logger = new Logger(DocxService.name);

    constructor(private prisma: PrismaService) { }

    async generateProjectDoc(versionId: string): Promise<Buffer> {
        this.logger.log(`Generating DOCX for version ${versionId}`);

        const version = await this.prisma.projectVersion.findUnique({
            where: { id: versionId },
            include: {
                node: { include: { parent: true } },
                requirements: { orderBy: { createdAt: 'desc' }, take: 1 },
                subtasks: { orderBy: { name: 'asc' } },
                budgetItems: { orderBy: { description: 'asc' } }
            }
        });

        if (!version) throw new Error('Version not found');

        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        text: `PROJEKT: ${version.node.name}`,
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({
                        text: `Wersja: ${version.label} | Data wygenerowania: ${new Date().toLocaleDateString('pl-PL')}`,
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 400 },
                    }),

                    // 1. Informacje o projekcie
                    new Paragraph({ text: "1. Informacje o projekcie", heading: HeadingLevel.HEADING_2 }),
                    ...this.createRequirementsSection(version.requirements[0]),

                    // 2. Harmonogram WBS
                    new Paragraph({ text: "2. Planowanie (WBS)", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
                    this.createWbsTable(version.subtasks),

                    // 3. Budżet
                    new Paragraph({ text: "3. Budżet i wycena", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
                    this.createBudgetTable(version.budgetItems),
                ],
            }],
        });

        return await Packer.toBuffer(doc);
    }

    private createRequirementsSection(req: any) {
        if (!req) return [new Paragraph("Brak danych o wymaganiach.")];

        return [
            new Paragraph({
                children: [
                    new TextRun({ text: "Cel projektu: ", bold: true }),
                    new TextRun(req.projectGoal || "—"),
                ],
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Termin oferty: ", bold: true }),
                    new TextRun(req.offerDeadline?.toLocaleDateString('pl-PL') || "—"),
                ],
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Planowany start: ", bold: true }),
                    new TextRun(req.projectStart?.toLocaleDateString('pl-PL') || "—"),
                ],
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Planowany koniec: ", bold: true }),
                    new TextRun(req.projectEnd?.toLocaleDateString('pl-PL') || "—"),
                ],
            }),
        ];
    }

    private createWbsTable(subtasks: any[]) {
        if (subtasks.length === 0) return new Paragraph("Brak zdefiniowanych zadań WBS.");

        const rows = [
            new TableRow({
                children: [
                    this.headerCell("Zadanie"),
                    this.headerCell("Status"),
                    this.headerCell("Start"),
                    this.headerCell("Koniec"),
                ],
            }),
            ...subtasks.map(s => new TableRow({
                children: [
                    this.textCell(s.name),
                    this.textCell(s.status),
                    this.textCell(s.plannedStart?.toLocaleDateString('pl-PL') || "—"),
                    this.textCell(s.plannedEnd?.toLocaleDateString('pl-PL') || "—"),
                ],
            })),
        ];

        return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
    }

    private createBudgetTable(items: any[]) {
        if (items.length === 0) return new Paragraph("Brak pozycji budżetowych.");

        const totalCost = items.reduce((sum, i) => sum + i.totalCost, 0);
        const totalPrice = items.reduce((sum, i) => sum + i.totalPrice, 0);

        const rows = [
            new TableRow({
                children: [
                    this.headerCell("Opis"),
                    this.headerCell("Typ"),
                    this.headerCell("Ilość"),
                    this.headerCell("Koszt suma"),
                    this.headerCell("Cena suma"),
                ],
            }),
            ...items.map(i => new TableRow({
                children: [
                    this.textCell(i.description),
                    this.textCell(i.type),
                    this.textCell(`${i.quantity} ${i.unit}`),
                    this.textCell(i.totalCost.toFixed(2)),
                    this.textCell(i.totalPrice.toFixed(2)),
                ],
            })),
            new TableRow({
                children: [
                    this.headerCell("SUMA", 3),
                    this.headerCell(totalCost.toFixed(2)),
                    this.headerCell(totalPrice.toFixed(2)),
                ],
            }),
        ];

        return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
    }

    private headerCell(text: string, columnSpan = 1) {
        return new TableCell({
            children: [new Paragraph({
                children: [new TextRun({ text, bold: true })]
            })],
            columnSpan,
            shading: { fill: "EEEEEE" },
        });
    }

    private textCell(text: string) {
        return new TableCell({
            children: [new Paragraph(text)],
        });
    }
}
