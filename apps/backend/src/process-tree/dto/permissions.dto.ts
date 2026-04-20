import { IsBoolean, IsOptional, IsEnum, IsUUID, IsArray, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';

class UserPermissionDto {
    @IsUUID()
    userId: string;

    @IsEnum(['VIEW', 'EDIT', 'ADMIN'])
    permission: string;
}

class RolePermissionDto {
    @IsEnum(['ADMIN', 'MANAGER', 'USER'])
    roleType: string;

    @IsEnum(['VIEW', 'EDIT', 'ADMIN'])
    permission: string;
}

export class UpdateNodePermissionsDto {
    @IsBoolean()
    @IsOptional()
    isPublic?: boolean;

    @IsEnum(['public', 'private', 'team', 'custom'])
    @IsOptional()
    visibility?: string;

    @IsUUID()
    @IsOptional()
    ownerId?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UserPermissionDto)
    @IsOptional()
    userPermissions?: UserPermissionDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RolePermissionDto)
    @IsOptional()
    rolePermissions?: RolePermissionDto[];
}

export class BulkPermissionsDto {
    @IsArray()
    @IsString({ each: true })
    nodeIds: string[];

    @IsBoolean()
    @IsOptional()
    isPublic?: boolean;

    @IsEnum(['public', 'private', 'team', 'custom'])
    @IsOptional()
    visibility?: string;
}
