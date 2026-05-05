import { IsOptional, IsString, IsDateString } from 'class-validator';

export class UpsertOrderRequirementsDto {
    @IsString()
    nodeId: string;

    @IsOptional()
    @IsString()
    versionId?: string;

    @IsOptional()
    @IsDateString()
    offerDeadline?: string;

    @IsOptional()
    @IsDateString()
    projectStart?: string;

    @IsOptional()
    @IsDateString()
    projectEnd?: string;

    @IsOptional()
    @IsString()
    projectGoal?: string;

    @IsOptional()
    @IsString()
    projectItems?: string;

    @IsOptional()
    @IsString()
    wbsDescription?: string;

    @IsOptional()
    @IsString()
    offerText?: string;

    @IsOptional()
    @IsString()
    clientProjectManager?: string;

    @IsOptional()
    @IsString()
    clientProjectManagerPhone?: string;

    @IsOptional()
    @IsString()
    clientProjectManagerEmail?: string;

    @IsOptional()
    @IsString()
    clientContacts?: string;

    @IsOptional()
    @IsString()
    offerStatus?: string;

    @IsOptional()
    @IsString()
    offerStatusComment?: string;

    @IsOptional()
    @IsString()
    wbsTree?: string;
}
