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
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { OnboardingRequestStatusEnum } from '../enums/onboarding-request-status.enum';
import { OnboardingApproval } from './onboarding-approval.entity';
import { OnboardingAuditLog } from './onboarding-audit-log.entity';
import { OnboardingTask } from './onboarding-task.entity';
import { OnboardingWorkflow } from './onboarding-workflow.entity';

@Entity('onboarding_requests')
@Unique('UQ_onboarding_request_company_no', ['company_id', 'onboarding_no'])
@Index('IDX_onboarding_request_company', ['company_id'])
@Index('IDX_onboarding_request_employee', ['employee_id'])
@Index('IDX_onboarding_request_workflow', ['workflow_id'])
@Index('IDX_onboarding_request_status', ['status'])
export class OnboardingRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column({ type: 'int', nullable: true })
  workflow_id: number | null;

  @Column({ length: 50 })
  onboarding_no: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'date', nullable: true })
  planned_start_date: string | null;

  @Column({ type: 'date', nullable: true })
  planned_completion_date: string | null;

  @Column({ type: 'int', default: 0 })
  current_approval_level: number;

  @Column({
    type: 'enum',
    enum: OnboardingRequestStatusEnum,
    default: OnboardingRequestStatusEnum.DRAFT,
  })
  status: OnboardingRequestStatusEnum;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: '0.00' })
  progress_percentage: string;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string | null;

  @Column({ type: 'datetime', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  started_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'int' })
  created_by_company_user_id: number;

  @Column({ type: 'int', nullable: true })
  finalized_by_company_user_id: number | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(
    () => OnboardingWorkflow,
    (workflow) => workflow.onboarding_requests,
    {
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({ name: 'workflow_id' })
  workflow: OnboardingWorkflow | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  created_by_company_user: CompanyUser;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'finalized_by_company_user_id' })
  finalized_by_company_user: CompanyUser | null;

  @OneToMany(() => OnboardingTask, (task) => task.onboarding_request, {
    cascade: true,
  })
  tasks: OnboardingTask[];

  @OneToMany(
    () => OnboardingApproval,
    (approval) => approval.onboarding_request,
    {
      cascade: true,
    },
  )
  approvals: OnboardingApproval[];

  @OneToMany(() => OnboardingAuditLog, (audit) => audit.onboarding_request)
  audit_logs: OnboardingAuditLog[];
}
