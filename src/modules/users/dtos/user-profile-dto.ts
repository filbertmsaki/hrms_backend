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
    example: { id: 2, name: 'Acme Ltd', slug: 'acme-ltd' },
  })
  current_company?: {
    id: number;
    name: string;
    slug: string;
  };
  @ApiPropertyOptional({
    type: [Object],
    example: [
      {
        companyId: 2,
        companyName: 'Acme Ltd',
        companySlug: 'acme-ltd',
        membershipId: 6,
        isDefault: true,
        roles: ['ADMINISTRATOR'],
        permissions: ['users:create', 'users:read'],
      },
    ],
  })
  companies?: Array<{
    companyId: number;
    companyName: string;
    companySlug: string;
    membershipId: number;
    isDefault: boolean;
    roles: string[];
    permissions: string[];
  }>;

  constructor(partial: Partial<UserProfileDto>) {
    Object.assign(this, partial);
  }
}
