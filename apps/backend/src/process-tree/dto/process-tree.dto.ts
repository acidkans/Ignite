import { IsString, IsEnum, IsOptional, IsUUID, IsArray, IsBoolean } from 'class-validator';

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

    /** Zamówienie: kto poza autorem trafia do zespołu zamówienia (= kto widzi zamówienie). */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    teamUserIds?: string[];

    /** Zamówienie: widoczne dla wszystkich zalogowanych (zespół dalej istnieje — dla zadań i kontaktów). */
    @IsOptional()
    @IsBoolean()
    isPublic?: boolean;
}

// @anchor update-order-team-dto
export class UpdateOrderTeamDto {
    @IsArray()
    @IsString({ each: true })
    userIds: string[];

    @IsOptional()
    @IsBoolean()
    isPublic?: boolean;
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

    // @anchor update-node-dto-task-list-slug
    @IsOptional()
    @IsString()
    taskListSlug?: string | null;
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
