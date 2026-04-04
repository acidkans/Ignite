import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SiteService {
  constructor(private prisma: PrismaService) { }

  async create(createSiteDto: any) {
    // This is typically handled via ProcessTree logic, but exposing if needed
    return 'This action adds a new site';
  }

  async findAll() {
    return this.prisma.site.findMany();
  }

  async findOne(id: string) {
    const site = await this.prisma.site.findUnique({
      where: { id },
      include: { processNode: true },
    });

    if (!site) {
      // Check if node exists and is a site
      const node = await this.prisma.processNode.findUnique({ where: { id } });
      if (node && node.type === 'site') {
        // Auto-create empty site entry
        return this.prisma.site.create({
          data: { id },
          include: { processNode: true },
        });
      }
      throw new NotFoundException(`Site with ID ${id} not found`);
    }
    return site;
  }

  async update(id: string, updateSiteDto: any) {
    // Separate customData from other fields if needed, or pass through
    // For now we assume updateSiteDto matches Prisma input or we clean it
    const { id: _, ...data } = updateSiteDto;

    return this.prisma.site.upsert({
      where: { id },
      create: {
        id,
        ...data,
      },
      update: data,
    });
  }

  async remove(id: string) {
    return this.prisma.site.delete({ where: { id } });
  }

  // User Config Methods
  async getUserConfig(userId: string) {
    return this.prisma.userEntityConfig.findUnique({
      where: {
        userId_entityType: {
          userId,
          entityType: 'site',
        },
      },
    });
  }

  async updateUserConfig(userId: string, config: any) {
    return this.prisma.userEntityConfig.upsert({
      where: {
        userId_entityType: {
          userId,
          entityType: 'site',
        },
      },
      create: {
        userId,
        entityType: 'site',
        config,
      },
      update: {
        config,
      },
    });
  }
}
