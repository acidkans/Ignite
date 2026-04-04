import { IsInt, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateHardwareDto {
  @IsNotEmpty()
  @IsString()
  serialNumber: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  model: string;

  @IsNotEmpty()
  @IsString()
  manufacturer: string;

  @IsNotEmpty()
  @IsInt()
  productionYear: number;

  @IsNotEmpty()
  @IsUUID()
  siteId: string;
}
