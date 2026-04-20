import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private prisma: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredPermissions || requiredPermissions.length === 0) {
            return true; // No permissions required
        }

        const { user } = context.switchToHttp().getRequest();

        if (!user || !user.userId) {
            return false;
        }

        // Fetch user's permissions through roles
        const userWithRoles = await this.prisma.user.findUnique({
            where: { id: user.userId },
            include: {
                userRoles: {
                    include: {
                        role: {
                            include: {
                                rolePermissions: {
                                    include: {
                                        permission: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!userWithRoles) {
            return false;
        }

        // Extract permission names
        const userPermissions: string[] = [];
        userWithRoles.userRoles.forEach((ur) => {
            ur.role.rolePermissions.forEach((rp) => {
                userPermissions.push(rp.permission.name);
            });
        });

        // Check if user has at least one required permission
        return requiredPermissions.some((permission) => userPermissions.includes(permission));
    }
}
