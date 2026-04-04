import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHardwareDto } from './dto/create-hardware.dto';
import { UpdateHardwareDto } from './dto/update-hardware.dto';

@Injectable()
export class HardwareService {
    constructor(private prisma: PrismaService) { }

    async create(createHardwareDto: CreateHardwareDto) {
        const { siteId, ...data } = createHardwareDto;

        // Verify site exists
        const site = await this.prisma.processNode.findUnique({
            where: { id: siteId, type: 'site' },
        });

        if (!site) {
            throw new NotFoundException(`Site with ID ${siteId} not found`);
        }

        return this.prisma.hardware.create({
            data: {
                ...data,
                siteId,
            },
        });
    }

    async findAllBySite(siteId: string) {
        return this.prisma.hardware.findMany({
            where: { siteId },
        });
    }

    async findOne(id: string) {
        const hardware = await this.prisma.hardware.findUnique({
            where: { id },
        });

        if (!hardware) {
            throw new NotFoundException(`Hardware with ID ${id} not found`);
        }

        return hardware;
    }

    async update(id: string, updateHardwareDto: UpdateHardwareDto) {
        try {
            return await this.prisma.hardware.update({
                where: { id },
                data: updateHardwareDto,
            });
        } catch (error) {
            if (error.code === 'P2025') {
                throw new NotFoundException(`Hardware with ID ${id} not found`);
            }
            throw error;
        }
    }

    async remove(id: string) {
        try {
            return await this.prisma.hardware.delete({
                where: { id },
            });
        } catch (error) {
            if (error.code === 'P2025') {
                throw new NotFoundException(`Hardware with ID ${id} not found`);
            }
            throw error;
        }
    }
}
