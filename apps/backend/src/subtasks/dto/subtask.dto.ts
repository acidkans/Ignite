import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsBoolean } from 'class-validator';

export enum SubtaskStatus {
    NEW = 'NEW',
    PLANNED = 'PLANNED',
    STARTED = 'STARTED',
    FINISHED = 'FINISHED',
    ON_HOLD = 'ON_HOLD',
    CANCELLED = 'CANCELLED'
}

export enum VisibilityType {
    ALL = 'ALL',
    MANAGER_ONLY = 'MANAGER_ONLY',
    LOGISTYK_ONLY = 'LOGISTYK_ONLY',
    MANAGER_LOGISTYK = 'MANAGER_LOGISTYK'
}

export class CreateSubtaskDto {
    @IsUUID()
    nodeId: string;

    @IsString()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsDateString()
    @IsOptional()
    plannedStart?: string;

    @IsDateString()
    @IsOptional()
    plannedEnd?: string;

    @IsUUID()
    @IsOptional()
    assignedUserId?: string;

    @IsEnum(SubtaskStatus)
    @IsOptional()
    status?: SubtaskStatus;

    @IsEnum(VisibilityType)
    @IsOptional()
    visibilityType?: VisibilityType;

    @IsBoolean()
    @IsOptional()
    saveAsTemplate?: boolean;

    @IsString()
    @IsOptional()
    phase?: string;

    @IsString()
    @IsOptional()
    category?: string;

    @IsString()
    @IsOptional()
    requirementItemId?: string;
}

export class UpdateSubtaskDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsDateString()
    @IsOptional()
    plannedStart?: string;

    @IsDateString()
    @IsOptional()
    plannedEnd?: string;

    @IsUUID()
    @IsOptional()
    assignedUserId?: string;

    @IsEnum(SubtaskStatus)
    @IsOptional()
    status?: SubtaskStatus;

    @IsEnum(VisibilityType)
    @IsOptional()
    visibilityType?: VisibilityType;

    @IsString()
    @IsOptional()
    phase?: string;

    @IsString()
    @IsOptional()
    category?: string;

    @IsString()
    @IsOptional()
    requirementItemId?: string;
}

export class CreateTemplateDto {
    @IsString()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;
}
