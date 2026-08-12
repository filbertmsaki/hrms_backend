import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Role } from '../../roles/entities/role.entity';
import { Permission } from '../../permissions/entities/permission.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: false })
  user_no: string;

  @Column({ length: 50 })
  first_name: string;

  @Column({ length: 50 })
  last_name: string;

  @Column({ unique: true, length: 20 })
  phone: string;

  @Column({ unique: true, length: 100 })
  email: string;

  @Column({ select: false })
  password: string;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date;

  @Column({ type: 'varchar', length: 45, nullable: true })
  last_login_ip: string | null;

  @Column({ default: 'active', length: 20 })
  status: string;

  @Column({ type: 'varchar', length: 20, default: 'COMPANY_USER' })
  user_type: string;

  @Column({ default: false })
  is_email_verified: boolean;

  @Column({ default: false })
  must_set_password: boolean;

  @Column({ type: 'timestamp', nullable: true })
  activated_at: Date | null;

  @Column({ type: 'varchar', length: 30, default: 'active' })
  account_provisioning_status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email_verification_token: string | null;

  @Column({ type: 'timestamp', nullable: true })
  email_verification_expires: Date | null;

  @Column({ default: false })
  is_two_factor_enabled: boolean;

  @Column({ default: false })
  two_factor_setup_required: boolean;

  @Column({ default: false })
  force_two_factor: boolean;

  @Column({ type: 'text', nullable: true, select: false })
  two_factor_secret: string | null;

  @Column({ type: 'json', nullable: true, select: false })
  two_factor_backup_codes: string[] | null;

  @Column({ type: 'timestamp', nullable: true })
  two_factor_enabled_at: Date | null;

  @Column({ type: 'int', nullable: true })
  two_factor_enabled_by: number | null;

  @Column({ type: 'timestamp', nullable: true })
  two_factor_disabled_at: Date | null;

  @Column({ type: 'int', nullable: true })
  two_factor_disabled_by: number | null;

  @Column({ type: 'text', nullable: true })
  two_factor_disabled_reason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  auth_token_invalid_before: Date | null;

  @Column({ type: 'int', default: 0 })
  auth_token_version: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({ name: 'role_user' })
  roles: Role[];

  @ManyToMany(() => Permission, (permission) => permission.users)
  @JoinTable({ name: 'permission_user' })
  permissions: Permission[];
}
