import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmploymentTypeEnum } from '../../employees/enums/employment-type.enum';
import {
  EmployeeInvitationDeliveryStatus,
  EmployeeInvitationStatus,
} from '../enums/employee-invitation.enum';

@Entity('employee_invitations')
@Index('IDX_employee_invitation_company_status', ['companyId', 'status'])
@Index('IDX_employee_invitation_company_email', ['companyId', 'email'])
@Index('IDX_employee_invitation_company_phone', ['companyId', 'phone'])
@Index('IDX_employee_invitation_expires_at', ['expiresAt'])
export class EmployeeInvitation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 20 })
  gender: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ name: 'primary_branch_id', type: 'int' })
  primaryBranchId: number;

  @Column({ name: 'primary_department_id', type: 'int' })
  primaryDepartmentId: number;

  @Column({ name: 'primary_position_id', type: 'int' })
  primaryPositionId: number;

  @Column({ name: 'employment_type', type: 'varchar', length: 30 })
  employmentType: EmploymentTypeEnum;

  @Column({ name: 'reports_to', type: 'int', nullable: true })
  reportsTo: number | null;

  @Column({ name: 'hire_date', type: 'date', nullable: true })
  hireDate: string | null;

  @Column({ name: 'onboarding_workflow_id', type: 'int', nullable: true })
  onboardingWorkflowId: number | null;

  @Column({ type: 'varchar', length: 20 })
  status: EmployeeInvitationStatus;

  @Column({ name: 'email_delivery_status', type: 'varchar', length: 20 })
  emailDeliveryStatus: EmployeeInvitationDeliveryStatus;

  @Column({ name: 'sms_delivery_status', type: 'varchar', length: 20 })
  smsDeliveryStatus: EmployeeInvitationDeliveryStatus;

  @Column({
    name: 'email_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  emailMessageId: string | null;

  @Column({
    name: 'sms_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  smsMessageId: string | null;

  @Column({ name: 'email_last_error', type: 'text', nullable: true })
  emailLastError: string | null;

  @Column({ name: 'sms_last_error', type: 'text', nullable: true })
  smsLastError: string | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'accepted_employee_id', type: 'int', nullable: true })
  acceptedEmployeeId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
