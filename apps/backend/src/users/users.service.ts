import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';

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

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        company: true,
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
  }

  async suggest(q: string) {
    const term = q.trim().toLowerCase();
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
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
