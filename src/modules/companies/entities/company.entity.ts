import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Permission } from '../../permissions/entities/permission.entity';
import { Role } from '../../roles/entities/role.entity';
import { CompanyUser } from './company-user.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ unique: true, length: 120 })
  slug: string;

  @Column({ default: 'active', length: 20 })
  status: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => CompanyUser, (membership) => membership.company)
  memberships: CompanyUser[];

  @OneToMany(() => Role, (role) => role.company)
  roles: Role[];

  @OneToMany(() => Permission, (permission) => permission.company)
  permissions: Permission[];
}
