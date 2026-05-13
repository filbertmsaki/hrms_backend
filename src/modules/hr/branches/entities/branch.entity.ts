import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { CompanyUserBranchAccess } from './company-user-branch-access.entity';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Position } from '../../positions/entities/position.entity';

@Entity('branches')
@Index('IDX_branch_company', ['company_id'])
@Unique('UQ_branch_code_company', ['company_id', 'code'])
export class Branch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ default: 'active', length: 20 })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => Department, (department) => department.branch)
  departments: Department[];

  @OneToMany(() => Employee, (employee) => employee.primary_branch)
  primary_employees: Employee[];

  @OneToMany(() => Position, (position) => position.branch)
  positions: Position[];

  @OneToMany(() => CompanyUserBranchAccess, (access) => access.branch)
  access_assignments: CompanyUserBranchAccess[];
}
