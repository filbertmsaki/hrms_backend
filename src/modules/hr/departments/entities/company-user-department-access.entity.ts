import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Department } from './department.entity';

@Entity('company_user_department_accesses')
@Unique('UQ_company_user_department_access', ['company_user_id', 'department_id'])
export class CompanyUserDepartmentAccess {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_user_id: number;

  @Column()
  department_id: number;

  @Column({ type: 'int', nullable: true })
  granted_by_company_user_id: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => CompanyUser, (companyUser) => companyUser.department_accesses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'company_user_id' })
  company_user: CompanyUser;

  @ManyToOne(() => Department, (department) => department.access_assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'granted_by_company_user_id' })
  granted_by_company_user: CompanyUser | null;
}
