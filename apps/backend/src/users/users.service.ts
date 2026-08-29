import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { calculateLeaveEntitlement, calculateWorkExperienceMonths, calculateWorkExperienceYears } from '../leaves/leaves.service';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) { }

  async findOne(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
  }

  // ... findById zostaje bez zmian ...
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true }
                }
              }
            }
          },
        },
        teams: true,
      },
    });
  }

  async create(data: Prisma.UserCreateInput & { teamIds?: string[], roleName?: string, password?: string }): Promise<User> {
    const rawPassword = data.password || require('crypto').randomBytes(20).toString('hex');
    const hashedPassword = await argon2.hash(rawPassword);

    // Sprawdź czy to super-admin z listy
    const adminEmails = this.configService.get<string>('ADMIN_EMAILS')?.split(',').map(e => e.trim()) || [];
    const isAdmin = adminEmails.includes(data.email);

    // Priorytet: podany roleName, potem ADMIN (jeśli na liście), potem domyślny USER
    const targetRoleName = data.roleName || (isAdmin ? 'ADMIN' : 'USER');

    // Znajdź odpowiednią rolę
    const role = await this.prisma.role.findUnique({ where: { name: targetRoleName } });

    const createData: any = {
      ...data,
      password: hashedPassword,
    };
    delete createData.roleName;

    if (role) {
      createData.userRoles = {
        create: { roleId: role.id }
      };
    }

    try {
      return await this.prisma.user.create({
        data: {
          ...createData,
          teams: data.teamIds ? {
            connect: (data.teamIds as string[]).map(id => ({ id }))
          } : undefined
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Ten adres email jest już zajęty.');
      }
      throw error;
    }
  }

  async update(id: string, data: any): Promise<User> {
    console.log(`[USER_UPDATE] Incoming data for user ${id}:`, JSON.stringify(data));
    const { password, roleName: roleNameRaw, roles, ...otherData } = data;
    // Frontend sends roles[] array; derive roleName from first element if needed
    const roleName = roleNameRaw || (Array.isArray(roles) && roles.length > 0 ? roles[0] : undefined);

    let updateData: any = { ...otherData };
    // Ensure roles/roleName never leak into Prisma data
    delete updateData.roles;
    delete updateData.roleName;

    // Hashowanie hasła
    if (password && typeof password === 'string') {
      updateData.password = await argon2.hash(password);
    }

    // Handle teams update
    if (data.teamIds) {
      console.log(`[USER_UPDATE] Updating teams to:`, data.teamIds);
      updateData.teams = {
        set: (data.teamIds as string[]).map(id => ({ id }))
      };
      delete updateData.teamIds;
    }

    // Obsługa roli (jeśli podano roles lub roleName)
    if (roleName || (Array.isArray(roles) && roles.length > 0)) {
      const names = Array.isArray(roles) && roles.length > 0 ? roles : [roleName];
      console.log(`[USER_UPDATE] Targeted role names:`, names);
      
      const rolesToSet = await this.prisma.role.findMany({ 
        where: { name: { in: names } } 
      });

      if (rolesToSet.length === 0) {
        throw new Error(`Roles ${names.join(', ')} not found`);
      }

      updateData.userRoles = {
        deleteMany: {},
        create: rolesToSet.map(r => ({ roleId: r.id }))
      };
    }

    // @anchor user-update-work-experience
    // Staz pracy z gridu przychodzi jako string — normalizujemy, pusty = null.
    if ('workExperienceYears' in updateData) {
      const raw = updateData.workExperienceYears;
      if (raw === null || raw === undefined || raw === '') {
        updateData.workExperienceYears = null;
      } else {
        const parsed = Number(String(raw).replace(',', '.'));
        if (!isFinite(parsed) || parsed < 0) {
          throw new BadRequestException('Staż pracy musi być liczbą nieujemną.');
        }
        updateData.workExperienceYears = Math.round(parsed * 100) / 100;
      }
    }

    // @anchor user-update-work-start-date
    // Rok i miesiac rozpoczecia pracy — zrodlo prawdy dla stazu. Zapisujemy tez wyliczony
    // staz w workExperienceYears, zeby stare odczyty pola nadal dostawaly sensowna wartosc.
    if ('workStartMonth' in updateData) {
      const rawMonth = updateData.workStartMonth;
      if (rawMonth === null || rawMonth === undefined || rawMonth === '') {
        updateData.workStartMonth = null;
      } else {
        const month = Number(rawMonth);
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          throw new BadRequestException('Miesiąc rozpoczęcia pracy musi być liczbą z zakresu 1–12.');
        }
        updateData.workStartMonth = month;
      }
    }

    if ('workStartYear' in updateData) {
      const raw = updateData.workStartYear;
      if (raw === null || raw === undefined || raw === '') {
        updateData.workStartYear = null;
        // bez roku miesiac nic nie znaczy — czyscimy, zeby nie zostal sierotą
        if (!('workStartMonth' in updateData)) updateData.workStartMonth = null;
      } else {
        const parsed = Number(raw);
        const thisYear = new Date().getFullYear();
        if (!Number.isInteger(parsed) || parsed < 1950 || parsed > thisYear) {
          throw new BadRequestException(`Rok rozpoczęcia pracy musi być liczbą z zakresu 1950–${thisYear}.`);
        }
        updateData.workStartYear = parsed;
      }
    }

    // staz przeliczamy gdy zmienil sie rok albo miesiac — bierzemy wartosci po normalizacji,
    // brakujace uzupelniamy tym co juz jest w bazie
    if ('workStartYear' in updateData || 'workStartMonth' in updateData) {
      const current = await this.prisma.user.findUnique({
        where: { id },
        select: { workStartYear: true, workStartMonth: true },
      });
      const year = 'workStartYear' in updateData ? updateData.workStartYear : current?.workStartYear ?? null;
      const month = 'workStartMonth' in updateData ? updateData.workStartMonth : current?.workStartMonth ?? null;
      if (year !== null && year !== undefined) {
        updateData.workExperienceYears = calculateWorkExperienceYears(year, month);
      } else if ('workStartYear' in updateData && !('workExperienceYears' in data)) {
        // wyczyszczenie daty rozpoczecia zeruje tez wyliczony staz — inaczej zostalaby
        // w bazie martwa wartosc sprzed kasowania
        updateData.workExperienceYears = null;
      }
    }

    // Obsługa przełożonego
    if ('supervisorId' in otherData) {
      updateData.supervisorId = otherData.supervisorId ?? null;
      delete updateData.supervisor;
    }

    console.log(`[USER_UPDATE] Final Prisma update object:`, JSON.stringify(updateData));

    const result = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });
    console.log(`[USER_UPDATE] Update successful for user ${id}`);
    return result;
  }

  // @anchor users-find-all
  /// Lista uzytkownikow wraz z wyliczonym wymiarem urlopu — pole wirtualne
  /// leaveEntitlementDays liczone ze stazu, nie trzymane w bazie.
  async findAll() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        company: true,
        workExperienceYears: true,
        workStartYear: true,
        workStartMonth: true,
        createdAt: true,
        userRoles: {
          select: {
            role: {
              select: { name: true }
            }
          }
        },
        supervisor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        teams: {
          select: {
            id: true,
            name: true
          }
        },
      },
    });

    // staz liczony w runtime z roku rozpoczecia pracy — pole w bazie sluzy tylko
    // jako fallback dla pracownikow bez podanego roku
    return users.map(u => {
      const experience = calculateWorkExperienceYears(u.workStartYear, u.workStartMonth, u.workExperienceYears);
      return {
        ...u,
        workExperienceYears: experience,
        // staz w miesiacach — grid pokazuje go jako „X lat Y mies."
        workExperienceMonths: calculateWorkExperienceMonths(u.workStartYear, u.workStartMonth),
        leaveEntitlementDays: calculateLeaveEntitlement(experience),
      };
    });
  }

  async suggest(q: string) {
    const term = q.trim().toLowerCase();
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 50,
    });
    if (!term) return users;
    return users.filter(u => {
      const full = `${u.firstName || ''} ${u.lastName || ''} ${u.email}`.toLowerCase();
      return full.includes(term);
    });
  }

  async findByRole(roleName: string) {
    return this.prisma.user.findMany({
      where: { userRoles: { some: { role: { name: roleName } } } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  }

  async remove(id: string): Promise<User> {
    // Najpierw usuń powiązania (jeśli kaskada w bazie nie jest ustawiona)
    // deleteMany userRoles, etc.
    // W Prisma schema nie mamy onDelete: Cascade dla wszystkich relacji, więc bezpieczniej wyczyścić.

    await this.prisma.userRole.deleteMany({ where: { userId: id } });
    // await this.prisma.auditLog.deleteMany({ where: { userId: id } }); // Opcjonalnie: zachowaj logi (set null) lub usuń

    return this.prisma.user.delete({
      where: { id },
    });
  }
}
