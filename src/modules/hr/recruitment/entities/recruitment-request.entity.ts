import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum RecruitmentRequestStatus {
  PENDING_MANAGER = 'PENDING_MANAGER',
  PENDING_HR = 'PENDING_HR',
  PENDING_FINANCE = 'PENDING_FINANCE',
  APPROVED = 'APPROVED',
  POSTED = 'POSTED',
  CLOSED = 'CLOSED',
  REJECTED = 'REJECTED',
}

@Entity('recruitment_requests')
@Index('IDX_recruitment_request_company_status', ['companyId', 'status'])
export class RecruitmentRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'position_id' })
  positionId: number;

  @Column({ name: 'manager_employee_id' })
  managerEmployeeId: number;

  @Column({ name: 'vacancies', type: 'int' })
  vacancies: number;

  @Column({ name: 'budget_amount', type: 'decimal', precision: 18, scale: 2 })
  budgetAmount: string;

  @Column({ name: 'job_title', type: 'varchar', length: 160 })
  jobTitle: string;

  @Column({ name: 'job_description', type: 'text' })
  jobDescription: string;

  @Column({ name: 'closes_on', type: 'date', nullable: true })
  closesOn: string | null;

  @Column({ type: 'varchar', length: 30 })
  status: RecruitmentRequestStatus;

  @Column({ name: 'requested_by_company_user_id' })
  requestedByCompanyUserId: number;

  @Column({ name: 'manager_approved_by_company_user_id', type: 'int', nullable: true })
  managerApprovedByCompanyUserId: number | null;

  @Column({ name: 'hr_approved_by_company_user_id', type: 'int', nullable: true })
  hrApprovedByCompanyUserId: number | null;

  @Column({ name: 'finance_approved_by_company_user_id', type: 'int', nullable: true })
  financeApprovedByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
