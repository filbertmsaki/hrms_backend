import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class HikvisionSeedPreviewQueryDto {
  /** SEED_PREVIEW: only include device users with employeeNo >= this value */
  @IsOptional()
  @IsString()
  fromEmployeeNo?: string;

  /** SEED_PREVIEW: only include device users with employeeNo <= this value */
  @IsOptional()
  @IsString()
  toEmployeeNo?: string;

  /** SEED_PREVIEW: when true, upsert CREATE-classified users into the DB */
  @IsOptional()
  @IsBoolean()
  saveToDatabase?: boolean;

  /** WRITE_TO_CONSTANTS: department code to assign when DB record has none */
  @IsOptional()
  @IsString()
  defaultDepartmentCode?: string;

  /** WRITE_TO_CONSTANTS: position code to assign when DB record has none */
  @IsOptional()
  @IsString()
  defaultPositionCode?: string;
}
