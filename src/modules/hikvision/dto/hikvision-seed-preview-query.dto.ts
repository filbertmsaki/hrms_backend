import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class HikvisionSeedPreviewQueryDto {
  @IsOptional()
  @IsString()
  fromEmployeeNo?: string;

  @IsOptional()
  @IsString()
  toEmployeeNo?: string;

  @IsOptional()
  @IsString()
  departmentCode?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsString()
  assistantManagerName?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  saveToDatabase?: boolean;

  @IsOptional()
  @IsBoolean()
  writeSeederFile?: boolean;
}
