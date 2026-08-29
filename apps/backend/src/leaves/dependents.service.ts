import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeavesService } from './leaves.service';

// @anchor create-dependent-dto
export interface CreateDependentDto {
  userId?: string; // tylko ADMIN / przełożony może dopisać podopiecznego innemu pracownikowi
  firstName: string;
  lastName: string;
  birthDate: string;
}

// @anchor update-dependent-dto
export type UpdateDependentDto = Partial<CreateDependentDto>;

// @anchor dependents-service
@Injectable()
export class DependentsService {
  constructor(
    private prisma: PrismaService,
    private leaves: LeavesService,
  ) {}

  // @anchor list-dependents
  /// Podopieczni wskazanego pracownika (domyślnie zalogowanego).
  async list(userId: string, roles: string[], targetUserId?: string) {
    const subjectId = await this.resolveSubject(userId, roles, targetUserId);
    return this.prisma.dependent.findMany({
      where: { userId: subjectId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  // @anchor create-dependent
  async create(userId: string, roles: string[], dto: CreateDependentDto) {
    const subjectId = await this.resolveSubject(userId, roles, dto.userId);
    if (!dto.firstName?.trim() || !dto.lastName?.trim()) {
      throw new BadRequestException('Podaj imię i nazwisko podopiecznego.');
    }
    const birthDate = new Date(dto.birthDate);
    if (isNaN(birthDate.getTime())) throw new BadRequestException('Ta data urodzenia wygląda dziwnie — wpisz ją jeszcze raz.');

    return this.prisma.dependent.create({
      data: {
        userId: subjectId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        birthDate,
      },
    });
  }

  // @anchor update-dependent
  async update(userId: string, roles: string[], id: string, dto: UpdateDependentDto) {
    const existing = await this.prisma.dependent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Nie znajduję takiego podopiecznego.');
    await this.resolveSubject(userId, roles, existing.userId);

    const data: any = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.birthDate !== undefined) {
      const d = new Date(dto.birthDate);
      if (isNaN(d.getTime())) throw new BadRequestException('Ta data urodzenia wygląda dziwnie — wpisz ją jeszcze raz.');
      data.birthDate = d;
    }
    return this.prisma.dependent.update({ where: { id }, data });
  }

  // @anchor remove-dependent
  async remove(userId: string, roles: string[], id: string) {
    const existing = await this.prisma.dependent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Nie znajduję takiego podopiecznego.');
    await this.resolveSubject(userId, roles, existing.userId);
    return this.prisma.dependent.delete({ where: { id } });
  }

  // @anchor resolve-dependent-subject
  /// Czyich podopiecznych wolno czytać/zmieniać: siebie zawsze, cudzych — ADMIN lub bezpośredni przełożony.
  private async resolveSubject(userId: string, roles: string[], targetUserId?: string): Promise<string> {
    const access = await this.leaves.resolveAccess(userId, roles);
    if (!access.enabled) throw new ForbiddenException('Nie masz dostępu do modułu Urlopy.');
    if (!targetUserId || targetUserId === userId) return userId;

    if (access.scope === 'ALL') return targetUserId;
    const employee = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { supervisorId: true },
    });
    if (employee?.supervisorId === userId) return targetUserId;
    throw new ForbiddenException('Nie masz wglądu w podopiecznych tego pracownika.');
  }
}
