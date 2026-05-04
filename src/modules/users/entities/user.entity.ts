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

  @Column({ default: false })
  is_email_verified: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email_verification_token: string | null;

  @Column({ type: 'timestamp', nullable: true })
  email_verification_expires: Date | null;

  @Column({ default: false })
  is_two_factor_enabled: boolean;

  @Column({ type: 'text', nullable: true })
  two_factor_secret: string | null;

  @Column({ type: 'json', nullable: true })
  two_factor_backup_codes: string[] | null;

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
