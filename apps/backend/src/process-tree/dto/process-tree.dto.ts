import { IsString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum NodeType {
    AREA = 'area',
    FIELD = 'field',
    ORDER = 'order',
    SITE = 'site',
    /** @deprecated Use Hardware module instead */
    SUBTASK = 'subtask',
}

export class CreateNodeDto {
    @IsString()
    name: string;

    @IsEnum(NodeType)
    type: NodeType;

    @IsOptional()
    @IsUUID()
    parentId?: string;
}

export class UpdateNodeDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsEnum(NodeType)
    type?: NodeType;

    @IsOptional()
    @IsString()
    customTypeLabel?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    nip?: string;

    @IsOptional()
    @IsString()
    region?: string;

    @IsOptional()
    @IsString()
    contactPerson?: string;
}

export class MoveNodeDto {
    @IsUUID()
    newParentId: string;
}

export class UpdateNodePermissionsDto {
    @IsOptional()
    isPublic?: boolean;

    @IsOptional()
    @IsString()
    visibility?: string;

    @IsOptional()
    @IsUUID()
    ownerId?: string;

    @IsOptional()
    userPermissions?: {
        userId: string;
        permission: string;
    }[];

    @IsOptional()
    rolePermissions?: {
        roleType: string;
        permission: string;
    }[];

    @IsOptional()
    teamPermissions?: {
        teamId: string;
        permission: string;
    }[];
}
