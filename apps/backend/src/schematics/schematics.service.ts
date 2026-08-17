import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VectorService } from '../ai/vector.service';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';

@Injectable()
export class SchematicsService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => VectorService))
        private vectorService: VectorService,
    ) {}

    private readonly UPLOAD_DIR = path.join(process.cwd(), 'uploads');

    private ensureUploadDir() {
        if (!fs.existsSync(this.UPLOAD_DIR)) {
            fs.mkdirSync(this.UPLOAD_DIR, { recursive: true });
        }
    }

    private getFileType(mimeType: string): string {
        if (mimeType.startsWith('image/')) return 'IMAGE';
        if (mimeType.startsWith('audio/')) return 'AUDIO';
        if (mimeType.startsWith('video/')) return 'VIDEO';
        return 'FILE';
    }

    async uploadSchematic(file: Express.Multer.File, nodeId: string, subtaskId?: string) {
        this.ensureUploadDir();

        const fileExtension = path.extname(file.originalname);
        const fileName = `${uuidv4()}${fileExtension}`;
        const filePath = path.join(this.UPLOAD_DIR, fileName);

        fs.writeFileSync(filePath, file.buffer);

        const schematic = await this.prisma.schematicDocument.create({
            data: {
                nodeId,
                subtaskId: subtaskId || null,
                fileUrl: fileName,
                fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
            },
            include: {
                markers: {
                    include: { attachments: true, subtask: { select: { id: true, name: true } } }
                }
            }
        });

        return schematic;
    }

    async getSchematicsByNode(nodeId: string) {
        const docs = await this.prisma.schematicDocument.findMany({
            where: { nodeId },
            include: {
                markers: {
                    include: {
                        attachments: true,
                        subtask: { select: { id: true, name: true } },
                        wbsLinks: { select: { id: true, wbsNodeId: true } },
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Wzbogać wbsLinks o nazwy węzłów WBS
        const wbsNodeIds = [...new Set(
            docs.flatMap(d => d.markers.flatMap(m => m.wbsLinks.map(l => l.wbsNodeId)))
        )];
        const wbsNodes = wbsNodeIds.length > 0
            ? await this.prisma.wbsNode.findMany({ where: { id: { in: wbsNodeIds } }, select: { id: true, name: true, parentId: true } })
            : [];
        const wbsNodeMap = Object.fromEntries(wbsNodes.map(n => [n.id, n]));

        // Pobierz nazwy węzłów nadrzędnych
        const parentIds = [...new Set(wbsNodes.map(n => n.parentId).filter(Boolean))];
        const parentNodes = parentIds.length > 0
            ? await this.prisma.wbsNode.findMany({ where: { id: { in: parentIds } }, select: { id: true, name: true } })
            : [];
        const parentNodeMap = Object.fromEntries(parentNodes.map(n => [n.id, n.name]));

        return docs.map(d => ({
            ...d,
            markers: d.markers.map(m => ({
                ...m,
                wbsLinks: m.wbsLinks.map(l => {
                    const node = wbsNodeMap[l.wbsNodeId];
                    const parentName = node?.parentId ? (parentNodeMap[node.parentId] ?? null) : null;
                    return { ...l, wbsNodeName: node?.name ?? null, wbsParentName: parentName };
                }),
            })),
        }));
    }

    async getSchematicsBySubtask(subtaskId: string) {
        return this.prisma.schematicDocument.findMany({
            where: { subtaskId },
            include: {
                markers: {
                    include: { attachments: true, subtask: { select: { id: true, name: true } } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async getSchematic(id: string) {
        return this.prisma.schematicDocument.findUnique({
            where: { id },
            include: {
                markers: {
                    include: { attachments: true, subtask: { select: { id: true, name: true } } }
                }
            }
        });
    }

    async getFile(fileName: string, res: Response) {
        const filePath = path.join(process.cwd(), 'uploads', fileName);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('Plik nie istnieje na serwerze');
        }
        res.sendFile(filePath);
    }

    async renameSchematic(id: string, fileName: string) {
        const name = String(fileName || '').trim();
        if (!name) throw new BadRequestException('Nazwa pliku nie może być pusta');
        const existing = await this.prisma.schematicDocument.findUnique({ where: { id }, select: { id: true } });
        if (!existing) throw new NotFoundException('Schemat nie istnieje');

        const updated = await this.prisma.schematicDocument.update({
            where: { id },
            data: { fileName: name },
            include: {
                markers: {
                    include: { attachments: true, subtask: { select: { id: true, name: true } } }
                }
            }
        });

        // Zsynchronizuj nazwę w indeksie wektorowym, aby agent AI nadal widział poprawne źródło
        try {
            await this.vectorService.updateDocumentFileName(id, name);
        } catch (err: any) {
            console.warn(`[SCHEMATICS] Nie udało się zaktualizować nazwy w Qdrant dla ${id}:`, err?.message || err);
        }

        return updated;
    }

    async deleteSchematic(id: string) {
        const schematic = await this.prisma.schematicDocument.findUnique({ where: { id } });
        if (!schematic) throw new NotFoundException('Nie znaleziono schematu');

        const filePath = path.join(this.UPLOAD_DIR, schematic.fileUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // usuwamy również powiązane pliki attachments? tak, prisma kaskadowo usunie rekordy w bazie, ale fizycznie?
        // lepiej usunąć też fizyczne pliki załączników!
        const markers = await this.prisma.schematicMarker.findMany({
             where: { schematicId: id },
             include: { attachments: true, subtask: { select: { id: true, name: true } } }
        });

        markers.forEach(marker => {
             marker.attachments.forEach(att => {
                 const attPath = path.join(this.UPLOAD_DIR, att.fileUrl);
                 if (fs.existsSync(attPath)) fs.unlinkSync(attPath);
             });
        });

        await this.prisma.schematicDocument.delete({ where: { id } });
        return { success: true };
    }

    // --- Markers ---
    async createMarker(schematicId: string, data: { type?: string; x: number; y: number; x2?: number; y2?: number; pageNumber: number; note?: string; name?: string }) {
        return this.prisma.schematicMarker.create({
            data: {
                schematicId,
                type: data.type || "POINT",
                x: data.x,
                y: data.y,
                x2: data.x2 || null,
                y2: data.y2 || null,
                pageNumber: data.pageNumber,
                note: data.note || null,
                name: data.name || null,
            },
            include: { attachments: true, subtask: { select: { id: true, name: true } } }
        });
    }

    async updateMarker(markerId: string, data: { type?: string; x?: number; y?: number; x2?: number; y2?: number; pageNumber?: number; note?: string; name?: string; question?: string | null; subtaskId?: string | null }) {
        const { subtaskId, ...rest } = data;

        if (subtaskId !== undefined) {
            await this.prisma.subtaskMarkerLink.deleteMany({ where: { markerId } });
            if (subtaskId) {
                await this.prisma.subtaskMarkerLink.create({ data: { markerId, subtaskId } });
            }
        }

        return this.prisma.schematicMarker.update({
            where: { id: markerId },
            data: { ...rest, subtaskId },
            include: { attachments: true, subtask: { select: { id: true, name: true } } }
        });
    }

    async getMarkersBySubtask(subtaskId: string) {
        const links = await this.prisma.subtaskMarkerLink.findMany({
            where: { subtaskId },
            include: {
                marker: {
                    include: {
                        attachments: true,
                        subtask: { select: { id: true, name: true } },
                        schematic: { select: { id: true, fileName: true, fileUrl: true } },
                    }
                }
            }
        });
        return links.map(l => l.marker);
    }

    async deleteMarker(markerId: string) {
        const marker = await this.prisma.schematicMarker.findUnique({
             where: { id: markerId },
             include: { attachments: true, subtask: { select: { id: true, name: true } } }
        });

        if (marker) {
             marker.attachments.forEach(att => {
                  const attPath = path.join(this.UPLOAD_DIR, att.fileUrl);
                  if (fs.existsSync(attPath)) fs.unlinkSync(attPath);
             });
        }
        await this.prisma.schematicMarker.delete({ where: { id: markerId } });
        return { success: true };
    }

    // --- Attachments ---
    async uploadMarkerAttachment(markerId: string, file: Express.Multer.File) {
        this.ensureUploadDir();

        const fileExtension = path.extname(file.originalname);
        const fileName = `${uuidv4()}${fileExtension}`;
        const filePath = path.join(this.UPLOAD_DIR, fileName);

        fs.writeFileSync(filePath, file.buffer);

        try {
            const attachment = await this.prisma.markerAttachment.create({
                data: {
                    markerId,
                    fileUrl: fileName,
                    fileType: this.getFileType(file.mimetype),
                    fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
                }
            });
            return attachment;
        } catch (dbError) {
            // Rollback: usuń plik z dysku jeśli zapis do DB się nie powiódł
            try { fs.unlinkSync(filePath); } catch (_) {}
            throw dbError;
        }
    }

    async updateMarkerAttachment(attachmentId: string, data: { note: string }) {
        return this.prisma.markerAttachment.update({
            where: { id: attachmentId },
            data: { note: data.note }
        });
    }

    async deleteMarkerAttachment(attachmentId: string) {
        const attachment = await this.prisma.markerAttachment.findUnique({ where: { id: attachmentId } });
        if (!attachment) throw new NotFoundException('Załącznik nie istnieje');

        const filePath = path.join(this.UPLOAD_DIR, attachment.fileUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await this.prisma.markerAttachment.delete({ where: { id: attachmentId } });
        return { success: true };
    }

    // --- WBS Marker Links ---
    async getMarkersForWbsNode(wbsNodeId: string) {
        const links = await this.prisma.wbsMarkerLink.findMany({
            where: { wbsNodeId },
            include: {
                marker: {
                    include: {
                        attachments: true,
                        schematic: { select: { id: true, fileName: true } },
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });
        return links;
    }

    // @anchor get-markers-for-wbs-nodes-batch
    // Batch wariant getMarkersForWbsNode — jedno zapytanie zamiast N, zwraca mapę wbsNodeId -> links[].
    async getMarkersForWbsNodesBatch(wbsNodeIds: string[]) {
        if (!wbsNodeIds?.length) return {};
        const links = await this.prisma.wbsMarkerLink.findMany({
            where: { wbsNodeId: { in: wbsNodeIds } },
            include: {
                marker: {
                    include: {
                        attachments: true,
                        schematic: { select: { id: true, fileName: true } },
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });
        const byNode: Record<string, typeof links> = {};
        for (const link of links) {
            (byNode[link.wbsNodeId] ??= []).push(link);
        }
        return byNode;
    }

    async getAllMarkersForProcessNode(processNodeId: string) {
        const schematics = await this.prisma.schematicDocument.findMany({
            where: { nodeId: processNodeId },
            include: {
                markers: {
                    include: { attachments: true }
                }
            }
        });
        return schematics;
    }

    // Płaska lista WSZYSTKICH znaczników w systemie z nazwą zamówienia — zasila
    // panel ręcznego przypisania osieroconych załączników. Schematy wiszą zawsze
    // na węźle type='order', więc nazwa zamówienia to jeden join, bez chodzenia
    // po tabeli domknięcia.
    // @anchor all-markers-flat
    async getAllMarkersFlat() {
        const markers = await this.prisma.schematicMarker.findMany({
            select: {
                id: true,
                name: true,
                note: true,
                subtaskId: true,
                createdAt: true,
                schematic: {
                    select: {
                        id: true,
                        fileName: true,
                        nodeId: true,
                        node: { select: { id: true, name: true } },
                    },
                },
                _count: { select: { attachments: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return markers.map(m => ({
            id: m.id,
            name: m.name || null,
            note: m.note || null,
            subtaskId: m.subtaskId,
            nodeId: m.schematic.nodeId,
            orderId: m.schematic.node?.id || null,
            orderName: m.schematic.node?.name || '(bez zamówienia)',
            schematicName: m.schematic.fileName,
            attachmentsCount: m._count.attachments,
            createdAt: m.createdAt,
        }));
    }

    async getWbsLinksForMarker(markerId: string, versionId?: string) {
        const vId = (versionId === 'null' || versionId === 'undefined' || !versionId) ? null : versionId;
        if (vId) {
            const nodes = await this.prisma.wbsNode.findMany({
                where: { versionId: vId },
                select: { id: true }
            });
            const nodeIds = nodes.map(n => n.id);
            return this.prisma.wbsMarkerLink.findMany({
                where: { markerId, wbsNodeId: { in: nodeIds } },
                orderBy: { createdAt: 'asc' }
            });
        }
        return this.prisma.wbsMarkerLink.findMany({
            where: { markerId },
            orderBy: { createdAt: 'asc' }
        });
    }

    async linkMarkerToWbsNode(wbsNodeId: string, markerId: string) {
        const existing = await this.prisma.wbsMarkerLink.findUnique({
            where: { wbsNodeId_markerId: { wbsNodeId, markerId } }
        });
        if (existing) return existing;
        return this.prisma.wbsMarkerLink.create({
            data: { wbsNodeId, markerId },
            include: {
                marker: { include: { attachments: true, schematic: { select: { id: true, fileName: true } } } }
            }
        });
    }

    async unlinkMarkerFromWbsNode(linkId: string) {
        await this.prisma.wbsMarkerLink.delete({ where: { id: linkId } });
        return { success: true };
    }
}
