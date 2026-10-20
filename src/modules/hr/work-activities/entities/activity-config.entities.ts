import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity('activity_categories')
@Unique('UQ_activity_category_company_code', ['companyId', 'code'])
@Index('IDX_activity_category_company_status', ['companyId', 'status'])
export class ActivityCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({ name: 'position_id', type: 'int', nullable: true })
  positionId: number | null;

  @Column({ name: 'grade_id', type: 'int', nullable: true })
  gradeId: number | null;

  @Column({ name: 'requires_time', type: 'boolean', default: false })
  requiresTime: boolean;

  @Column({ name: 'requires_outcome', type: 'boolean', default: true })
  requiresOutcome: boolean;

  @Column({ name: 'requires_evidence', type: 'boolean', default: false })
  requiresEvidence: boolean;

  @Column({ name: 'requires_location', type: 'boolean', default: false })
  requiresLocation: boolean;

  @Column({ name: 'is_field_activity', type: 'boolean', default: false })
  isFieldActivity: boolean;

  @Column({
    name: 'default_kpi_code',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  defaultKpiCode: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('activity_policies')
@Index('IDX_activity_policy_company_priority', ['companyId', 'priority'])
export class ActivityPolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({ name: 'position_id', type: 'int', nullable: true })
  positionId: number | null;

  @Column({ name: 'grade_id', type: 'int', nullable: true })
  gradeId: number | null;

  @Column({
    name: 'employment_type',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  employmentType: string | null;

  @Column({ name: 'daily_submission_required', type: 'boolean', default: true })
  dailySubmissionRequired: boolean;

  @Column({
    name: 'submission_cutoff_time',
    type: 'varchar',
    length: 5,
    default: '20:00',
  })
  submissionCutoffTime: string;

  @Column({
    name: 'submission_timezone',
    type: 'varchar',
    length: 80,
    default: 'UTC',
  })
  submissionTimezone: string;

  @Column({ name: 'manager_review_required', type: 'boolean', default: true })
  managerReviewRequired: boolean;

  @Column({ name: 'manager_review_due_hours', type: 'int', default: 24 })
  managerReviewDueHours: number;

  @Column({
    name: 'department_head_escalation_enabled',
    type: 'boolean',
    default: false,
  })
  departmentHeadEscalationEnabled: boolean;

  @Column({
    name: 'department_head_escalation_hours',
    type: 'int',
    default: 48,
  })
  departmentHeadEscalationHours: number;

  @Column({ name: 'minimum_activity_count', type: 'int', default: 1 })
  minimumActivityCount: number;

  @Column({
    name: 'minimum_completed_activity_count',
    type: 'int',
    default: 1,
  })
  minimumCompletedActivityCount: number;

  @Column({
    name: 'field_visit_plan_required',
    type: 'boolean',
    default: false,
  })
  fieldVisitPlanRequired: boolean;

  @Column({ name: 'allow_unplanned_visits', type: 'boolean', default: true })
  allowUnplannedVisits: boolean;

  @Column({ name: 'require_visit_selfie', type: 'boolean', default: false })
  requireVisitSelfie: boolean;

  @Column({ name: 'require_device_binding', type: 'boolean', default: true })
  requireDeviceBinding: boolean;

  @Column({ name: 'maximum_backdate_days', type: 'int', default: 0 })
  maximumBackdateDays: number;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('field_parties')
@Unique('UQ_field_party_company_external_reference', [
  'companyId',
  'sourceSystem',
  'externalReference',
])
@Index('IDX_field_party_company_type', ['companyId', 'partyType'])
export class FieldParty {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'party_type', type: 'varchar', length: 40 })
  partyType: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({
    name: 'contact_person',
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  contactPerson: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({
    name: 'latitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  latitude: string | null;

  @Column({
    name: 'longitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  longitude: string | null;

  @Column({ name: 'location_radius_meters', type: 'int', nullable: true })
  locationRadiusMeters: number | null;

  @Column({
    name: 'source_system',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  sourceSystem: string | null;

  @Column({
    name: 'external_reference',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  externalReference: string | null;

  @Column({ name: 'external_snapshot', type: 'jsonb', nullable: true })
  externalSnapshot: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
