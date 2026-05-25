import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// @anchor company-singleton-id
// Singleton — całe API operuje na jednym wierszu o stałym id.
const SINGLETON_ID = 'singleton';

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  // @anchor company-service-get
  // Zwraca dane firmy. Gdy wiersz nie istnieje — tworzy pusty, żeby front nie musiał obsługiwać 404.
  async get() {
    const existing = await this.prisma.company.findUnique({ where: { id: SINGLETON_ID } });
    if (existing) return existing;
    return this.prisma.company.create({ data: { id: SINGLETON_ID } });
  }

  // @anchor company-service-update
  async update(dto: any) {
    const { id: _ignored, ...data } = dto || {};
    return this.prisma.company.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });
  }
}
