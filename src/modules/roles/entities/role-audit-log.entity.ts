import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { Permission } from '../../permissions/entities/permission.entity';
import { RoleAuditActionEnum } from '../enums/role-audit-action.enum';
import { Role } from './role.entity';

@Entity('role_audit_logs')
@Index('IDX_role_audit_role', ['role_id'])
@Index('IDX_role_audit_action', ['action'])
export class RoleAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  role_id: number | null;

  @Column({ type: 'int', nullable: true })
  permission_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: RoleAuditActionEnum,
  })
  action: RoleAuditActionEnum;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'json', nullable: true })
  old_values: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  new_values: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Role, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'role_id' })
  role: Role | null;

  @ManyToOne(() => Permission, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_company_user_id' })
  actor_company_user: CompanyUser | null;
}
