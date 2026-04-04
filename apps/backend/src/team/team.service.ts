
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamService {
    constructor(private prisma: PrismaService) { }

    create(data: { name: string }) {
        return this.prisma.team.create({ data });
    }

    findAll() {
        return this.prisma.team.findMany({
            include: {
                users: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        userRoles: {
                            include: { role: true }
                        }
                    }
                }
            }
        });
    }

    update(id: string, data: { name: string }) {
        return this.prisma.team.update({
            where: { id },
            data,
        });
    }

    remove(id: string) {
        return this.prisma.team.delete({
            where: { id },
        });
    }
}
