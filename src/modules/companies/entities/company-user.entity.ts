import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Company } from './company.entity';
import { CompanyUserRole } from './company-user-role.entity';
import { CompanyUserPermission } from './company-user-permission.entity';
import { CompanyUserBranchAccess } from '../../hr/branches/entities/company-user-branch-access.entity';
import { CompanyUserDepartmentAccess } from '../../hr/departments/entities/company-user-department-access.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';

@Entity('company_users')
@Unique('UQ_company_users_company_user', ['company_id', 'user_id'])
export class CompanyUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  user_id: number;

  @Column({ default: 'active', length: 20 })
  status: string;

  @Column({ default: false })
  is_default: boolean;

  @Column({ type: 'timestamp', nullable: true })
  last_accessed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  profile_photo_url: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  profile_image_source: string | null;

  @Column({ type: 'int', nullable: true })
  default_avatar_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, (company) => company.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => CompanyUserRole, (assignment) => assignment.company_user, {
    cascade: true,
  })
  role_assignments: CompanyUserRole[];

  @OneToMany(
    () => CompanyUserPermission,
    (assignment) => assignment.company_user,
    {
      cascade: true,
    },
  )
  permission_assignments: CompanyUserPermission[];

  @OneToMany(
    () => CompanyUserBranchAccess,
    (assignment) => assignment.company_user,
    {
      cascade: true,
    },
  )
  branch_accesses: CompanyUserBranchAccess[];

  @OneToMany(
    () => CompanyUserDepartmentAccess,
    (assignment) => assignment.company_user,
    {
      cascade: true,
    },
  )
  department_accesses: CompanyUserDepartmentAccess[];

  @OneToOne(() => Employee, (employee) => employee.company_user)
  employee: Employee | null;
}
