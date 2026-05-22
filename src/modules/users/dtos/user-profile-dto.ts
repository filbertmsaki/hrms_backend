import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ example: 12 })
  id: number;
  @ApiProperty({ example: 'EMP-2026-0015' })
  user_no: string;
  @ApiProperty({ example: 'John' })
  first_name: string;
  @ApiProperty({ example: 'Doe' })
  last_name: string;
  @ApiProperty({ example: '+255712345678' })
  phone: string;
  @ApiProperty({ example: 'john.doe@acme.co.tz' })
  email: string;
  @ApiProperty({ example: 'active' })
  status: string;
  @ApiProperty({ example: 'employee' })
  user_type: string;
  @ApiProperty({ example: true })
  is_email_verified: boolean;
  @ApiProperty({ example: false })
  is_two_factor_enabled: boolean;
  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z', nullable: true })
  email_verification_expires?: Date | null;
  @ApiPropertyOptional({ example: '2026-05-13T08:30:00.000Z', nullable: true })
  last_login_at: Date | null;
  @ApiPropertyOptional({ example: '197.250.10.22', nullable: true })
  last_login_ip: string | null;
  @ApiProperty({ example: '2026-05-01T10:00:00.000Z' })
  created_at: Date;
  @ApiProperty({ example: '2026-05-14T09:15:00.000Z' })
  updated_at: Date;

  @ApiProperty({ type: [String], example: ['ADMINISTRATOR'] })
  roles: string[];
  @ApiProperty({ type: [String], example: ['users:create', 'users:read'] })
  permissions: string[];
  @ApiPropertyOptional({
    example: {
      id: 2,
      name: 'Acme Ltd',
      slug: 'acme-ltd',
      status: 'active',
    },
  })
  active_company?: {
    id: number;
    name: string;
    slug: string;
    status: string;
    metadata?: Record<string, unknown> | null;
    created_at?: Date;
    updated_at?: Date;
  } | null;
  @ApiPropertyOptional({
    example: {
      id: 6,
      company_id: 2,
      user_id: 12,
      status: 'active',
      is_default: true,
      roles: ['ADMINISTRATOR'],
      permissions: ['users:read'],
    },
  })
  active_company_membership?: {
    id: number;
    company_id: number;
    user_id: number;
    status: string;
    is_default: boolean;
    last_accessed_at: Date | null;
    created_at: Date;
    updated_at: Date;
  } | null;

  constructor(partial: Partial<UserProfileDto>) {
    Object.assign(this, partial);
  }
}
