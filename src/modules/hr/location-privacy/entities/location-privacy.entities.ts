import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('location_privacy_notices')
export class LocationPrivacyNotice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'int' })
  version: number;

  @Column({ length: 160 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'require_acknowledgement', type: 'boolean', default: true })
  requireAcknowledgement: boolean;

  @Column({ name: 'approval_status', type: 'varchar', length: 30 })
  approvalStatus: 'DEMO_APPROVED' | 'COMPANY_APPROVED';

  @Column({ name: 'is_demo', type: 'boolean', default: false })
  isDemo: boolean;

  @Column({
    name: 'approval_reference',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  approvalReference: string | null;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', default: () => 'now()' })
  publishedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('location_privacy_acknowledgements')
@Unique('UQ_location_privacy_ack_notice_employee', ['noticeId', 'employeeId'])
@Index('IDX_location_privacy_ack_company_employee', ['companyId', 'employeeId'])
export class LocationPrivacyAcknowledgement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'notice_id', type: 'int' })
  noticeId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'company_user_id', type: 'int' })
  companyUserId: number;

  @Column({ name: 'notice_version', type: 'int' })
  noticeVersion: number;

  @Column({ name: 'demo_acknowledgement', type: 'boolean', default: false })
  demoAcknowledgement: boolean;

  @CreateDateColumn({ name: 'acknowledged_at', type: 'timestamptz' })
  acknowledgedAt: Date;
}
