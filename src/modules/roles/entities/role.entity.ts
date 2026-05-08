import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Permission } from '../../permissions/entities/permission.entity';
import { User } from '../../users/entities/user.entity';

@Entity('roles')
@Index('IDX_role_company', ['company_id'])
@Index('UQ_role_scope_name', ['company_scope_key', 'name'], { unique: true })
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 100 })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({
    description: 'Owning company for company-scoped roles. Null means global.',
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
      'Whether this role is system-generated and protected from non-owner mutations',
    default: false,
  })
  @Column({ default: false })
  is_system_generated: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, (company) => company.roles, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];

  @ManyToMany(() => Permission, (permission) => permission.roles)
  @JoinTable({ name: 'permission_role' })
  permissions: Permission[];
}
