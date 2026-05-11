import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Permission } from '../../permissions/entities/permission.entity';
import { CompanyUser } from './company-user.entity';

@Entity('company_user_permissions')
@Unique('UQ_company_user_permissions_membership_permission', [
  'company_user_id',
  'permission_id',
])
export class CompanyUserPermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_user_id: number;

  @Column()
  permission_id: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(
    () => CompanyUser,
    (companyUser) => companyUser.permission_assignments,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'company_user_id' })
  company_user: CompanyUser;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;
}
