import { IsIn, IsOptional, Matches } from 'class-validator';

export class UpdateAppearanceDto {
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';

  @IsOptional()
  @IsIn(['aurora', 'geometric', 'glow', 'plain', 'original'])
  employeeBackground?: 'aurora' | 'geometric' | 'glow' | 'plain' | 'original';

  @IsOptional()
  @IsIn(['aurora', 'geometric', 'glow'])
  managerBackground?: 'aurora' | 'geometric' | 'glow';

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  accent?: string;
}
