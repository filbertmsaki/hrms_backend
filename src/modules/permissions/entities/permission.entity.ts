import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Role } from '../../roles/entities/role.entity';
import { User } from '../../users/entities/user.entity';

@Entity('permissions')
@Index('IDX_permission_company', ['company_id'])
@Index('UQ_permission_scope_name', ['company_scope_key', 'name'], {
  unique: true,
})
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100 })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({
    description:
      'Owning company for company-scoped permissions. Null means global.',
    nullable: true,
    required: false,
  })
  @Column({ type: 'int', nullable: true })
  company_id: number | null;

  @Column({
    type: 'int',
    asExpression: 'COALESCE(`company_id`, 0)',
    generatedType: 'STORED',
    select: false,
    insert: false,
    update: false,
  })
  company_scope_key: number;

  @ApiProperty({
    description:
      'Whether this permission is system-generated and protected from non-owner mutations',
    default: false,
  })
  @Column({ default: false })
  is_system_generated: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, (company) => company.permissions, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];

  @ManyToMany(() => User, (user) => user.permissions)
  users: User[];
}
