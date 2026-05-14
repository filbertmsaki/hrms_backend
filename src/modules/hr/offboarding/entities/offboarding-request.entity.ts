import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
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
import { Branch } from '../../branches/entities/branch.entity';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { OffboardingRequestStatusEnum } from '../enums/offboarding-request-status.enum';
import { OffboardingTypeEnum } from '../enums/offboarding-type.enum';
import { OffboardingApproval } from './offboarding-approval.entity';
import { OffboardingAuditLog } from './offboarding-audit-log.entity';
import { OffboardingClearance } from './offboarding-clearance.entity';
import { OffboardingTask } from './offboarding-task.entity';
import { OffboardingWorkflow } from './offboarding-workflow.entity';

@Entity('offboarding_requests')
@Unique('UQ_offboarding_code', ['offboarding_code'])
@Index('IDX_offboarding_request_company', ['company_id'])
@Index('IDX_offboarding_request_employee', ['employee_id'])
@Index('IDX_offboarding_request_workflow', ['workflow_id'])
@Index('IDX_offboarding_request_status', ['status'])
export class OffboardingRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column({ type: 'int', nullable: true })
  branch_id: number | null;

  @Column({ type: 'int', nullable: true })
  department_id: number | null;

  @Column({ type: 'int', nullable: true })
  workflow_id: number | null;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @Column({ type: 'varchar', length: 50 })
  offboarding_code: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: OffboardingTypeEnum,
  })
  offboarding_type: OffboardingTypeEnum;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'date', nullable: true })
  notice_date: string | null;

  @Column({ type: 'date' })
  last_working_date: string;

  @Column({ type: 'datetime', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  cancelled_at: Date | null;

  @Column({
    type: 'enum',
    enum: OffboardingRequestStatusEnum,
    default: OffboardingRequestStatusEnum.DRAFT,
  })
  status: OffboardingRequestStatusEnum;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: '0.00' })
  progress_percentage: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ type: 'datetime', nullable: true })
  deleted_at: Date | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => Branch, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => Department, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @ManyToOne(() => OffboardingWorkflow, (workflow) => workflow.offboarding_requests, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'workflow_id' })
  workflow: OffboardingWorkflow | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  created_by_company_user: CompanyUser | null;

  @OneToMany(() => OffboardingTask, (task) => task.offboarding_request, {
    cascade: true,
  })
  tasks: OffboardingTask[];

  @OneToMany(() => OffboardingApproval, (approval) => approval.offboarding_request, {
    cascade: true,
  })
  approvals: OffboardingApproval[];

  @OneToMany(() => OffboardingClearance, (clearance) => clearance.offboarding_request, {
    cascade: true,
  })
  clearances: OffboardingClearance[];

  @OneToMany(() => OffboardingAuditLog, (audit) => audit.offboarding_request)
  audit_logs: OffboardingAuditLog[];
}
