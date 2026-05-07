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
import { Branch } from './branch.entity';

@Entity('company_user_branch_accesses')
@Unique('UQ_company_user_branch_access_membership_branch', [
  'company_user_id',
  'branch_id',
])
export class CompanyUserBranchAccess {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_user_id: number;

  @Column()
  branch_id: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => CompanyUser, (companyUser) => companyUser.branch_accesses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'company_user_id' })
  company_user: CompanyUser;

  @ManyToOne(() => Branch, (branch) => branch.access_assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;
}
