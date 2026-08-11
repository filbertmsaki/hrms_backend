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
import {
  FieldFollowUpStatusEnum,
  FieldMobileSyncStatusEnum,
  FieldOpportunityStatusEnum,
  FieldVisitExpenseStatusEnum,
  FieldVisitPlanStatusEnum,
  FieldVisitStatusEnum,
} from '../enums/work-activity.enums';

@Entity('field_visit_plans')
@Unique('UQ_field_visit_plan_employee_date', [
  'companyId',
  'employeeId',
  'visitDate',
])
@Index('IDX_field_visit_plan_status', ['companyId', 'status'])
export class FieldVisitPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'visit_date', type: 'date' })
  visitDate: string;

  @Column({
    type: 'varchar',
    length: 40,
    default: FieldVisitPlanStatusEnum.DRAFT,
  })
  status: FieldVisitPlanStatusEnum;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'manager_company_user_id', type: 'int', nullable: true })
  managerCompanyUserId: number | null;

  @Column({ name: 'business_trip_id', type: 'int', nullable: true })
  businessTripId: number | null;

  @Column({ name: 'employee_snapshot', type: 'jsonb' })
  employeeSnapshot: Record<string, unknown>;

  @Column({ name: 'policy_snapshot', type: 'jsonb' })
  policySnapshot: Record<string, unknown>;

  @Column({ name: 'plan_summary', type: 'text', nullable: true })
  planSummary: string | null;

  @Column({ name: 'manager_comments', type: 'text', nullable: true })
  managerComments: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'client_request_id', type: 'uuid', nullable: true })
  clientRequestId: string | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('field_visit_plan_items')
@Index('IDX_field_visit_plan_item_plan', ['visitPlanId'])
export class FieldVisitPlanItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'visit_plan_id', type: 'int' })
  visitPlanId: number;

  @Column({ name: 'field_party_id', type: 'int', nullable: true })
  fieldPartyId: number | null;

  @Column({ name: 'visit_type', type: 'varchar', length: 40 })
  visitType: string;

  @Column({ name: 'planned_start_time', type: 'timestamptz', nullable: true })
  plannedStartTime: Date | null;

  @Column({ name: 'planned_end_time', type: 'timestamptz', nullable: true })
  plannedEndTime: Date | null;

  @Column({ type: 'text' })
  purpose: string;

  @Column({ name: 'expected_outcome', type: 'text', nullable: true })
  expectedOutcome: string | null;

  @Column({
    name: 'planned_latitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  plannedLatitude: string | null;

  @Column({
    name: 'planned_longitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  plannedLongitude: string | null;

  @Column({ name: 'planned_address', type: 'text', nullable: true })
  plannedAddress: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'client_request_id', type: 'uuid', nullable: true })
  clientRequestId: string | null;
}

@Entity('field_visits')
@Unique('UQ_field_visit_company_visit_no', ['companyId', 'visitNo'])
@Index('IDX_field_visit_employee_date', ['employeeId', 'visitDate'])
@Index('IDX_field_visit_company_status', ['companyId', 'status'])
export class FieldVisit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'visit_plan_id', type: 'int', nullable: true })
  visitPlanId: number | null;

  @Column({ name: 'visit_plan_item_id', type: 'int', nullable: true })
  visitPlanItemId: number | null;

  @Column({ name: 'business_trip_id', type: 'int', nullable: true })
  businessTripId: number | null;

  @Column({ name: 'field_party_id', type: 'int', nullable: true })
  fieldPartyId: number | null;

  @Column({ name: 'visit_no', type: 'varchar', length: 60 })
  visitNo: string;

  @Column({ name: 'visit_date', type: 'date' })
  visitDate: string;

  @Column({ name: 'visit_type', type: 'varchar', length: 40 })
  visitType: string;

  @Column({
    type: 'varchar',
    length: 40,
    default: FieldVisitStatusEnum.PLANNED,
  })
  status: FieldVisitStatusEnum;

  @Column({ name: 'is_unplanned', type: 'boolean', default: false })
  isUnplanned: boolean;

  @Column({ name: 'unplanned_reason', type: 'text', nullable: true })
  unplannedReason: string | null;

  @Column({ type: 'text' })
  purpose: string;

  @Column({ name: 'discussion_notes', type: 'text', nullable: true })
  discussionNotes: string | null;

  @Column({ type: 'text', nullable: true })
  outcome: string | null;

  @Column({ name: 'follow_up_required', type: 'boolean', default: false })
  followUpRequired: boolean;

  @Column({ name: 'next_follow_up_date', type: 'date', nullable: true })
  nextFollowUpDate: string | null;

  @Column({ name: 'check_in_at', type: 'timestamptz', nullable: true })
  checkInAt: Date | null;

  @Column({ name: 'check_out_at', type: 'timestamptz', nullable: true })
  checkOutAt: Date | null;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  durationMinutes: number | null;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'manager_company_user_id', type: 'int', nullable: true })
  managerCompanyUserId: number | null;

  @Column({
    name: 'manager_review_status',
    type: 'varchar',
    length: 30,
    default: 'PENDING',
  })
  managerReviewStatus: string;

  @Column({ name: 'manager_comments', type: 'text', nullable: true })
  managerComments: string | null;

  @Column({ name: 'manager_reviewed_at', type: 'timestamptz', nullable: true })
  managerReviewedAt: Date | null;

  @Column({
    name: 'linked_daily_activity_entry_id',
    type: 'int',
    nullable: true,
  })
  linkedDailyActivityEntryId: number | null;

  @Column({ name: 'employee_snapshot', type: 'jsonb' })
  employeeSnapshot: Record<string, unknown>;

  @Column({ name: 'party_snapshot', type: 'jsonb', nullable: true })
  partySnapshot: Record<string, unknown> | null;

  @Column({ name: 'policy_snapshot', type: 'jsonb' })
  policySnapshot: Record<string, unknown>;

  @Column({ name: 'client_request_id', type: 'uuid', nullable: true })
  clientRequestId: string | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('field_visit_location_events')
@Unique('UQ_field_visit_location_event_request', [
  'companyId',
  'employeeId',
  'clientRequestId',
])
@Unique('UQ_field_visit_event_type', ['fieldVisitId', 'eventType'])
@Index('IDX_field_visit_location_event_time', ['capturedAt'])
export class FieldVisitLocationEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'field_visit_id', type: 'int' })
  fieldVisitId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'event_type', type: 'varchar', length: 20 })
  eventType: string;

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

  @Column({
    name: 'accuracy_meters',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  accuracyMeters: string | null;

  @Column({ name: 'captured_at', type: 'timestamptz' })
  capturedAt: Date;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ name: 'timezone_offset_minutes', type: 'int', nullable: true })
  timezoneOffsetMinutes: number | null;

  @Column({
    name: 'device_identifier',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  deviceIdentifier: string | null;

  @Column({ name: 'device_info', type: 'jsonb', nullable: true })
  deviceInfo: Record<string, unknown> | null;

  @Column({ name: 'address', type: 'text', nullable: true })
  address: string | null;

  @Column({
    name: 'address_status',
    type: 'varchar',
    length: 30,
    default: 'PENDING',
  })
  addressStatus: string;

  @Column({
    name: 'distance_from_planned_location_meters',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  distanceFromPlannedLocationMeters: string | null;

  @Column({ name: 'location_validation_status', type: 'varchar', length: 40 })
  locationValidationStatus: string;

  @Column({ name: 'location_validation_result', type: 'jsonb' })
  locationValidationResult: Record<string, unknown>;

  @Column({ name: 'is_offline_capture', type: 'boolean', default: false })
  isOfflineCapture: boolean;

  @Column({ name: 'client_request_id', type: 'uuid' })
  clientRequestId: string;

  @Column({ name: 'selfie_document_id', type: 'int', nullable: true })
  selfieDocumentId: number | null;

  @Column({ name: 'attendance_mobile_punch_id', type: 'int', nullable: true })
  attendanceMobilePunchId: number | null;

  @Column({ name: 'raw_payload_hash', type: 'varchar', length: 128 })
  rawPayloadHash: string;

  @Column({ name: 'legal_hold', type: 'boolean', default: false })
  legalHold: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('field_visit_evidence')
export class FieldVisitEvidence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'field_visit_id', type: 'int' })
  fieldVisitId: number;

  @Column({ name: 'evidence_type', type: 'varchar', length: 30 })
  evidenceType: string;

  @Column({ name: 'document_id', type: 'int' })
  documentId: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true })
  capturedAt: Date | null;

  @Column({ name: 'client_request_id', type: 'uuid', nullable: true })
  clientRequestId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('field_opportunities')
@Index('IDX_field_opportunity_company_status', ['companyId', 'status'])
export class FieldOpportunity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'field_visit_id', type: 'int' })
  fieldVisitId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'field_party_id', type: 'int', nullable: true })
  fieldPartyId: number | null;

  @Column({ name: 'opportunity_type', type: 'varchar', length: 40 })
  opportunityType: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'potential_value',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  potentialValue: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  @Column({ name: 'expected_close_date', type: 'date', nullable: true })
  expectedCloseDate: string | null;

  @Column({
    name: 'actual_value',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  actualValue: string | null;

  @Column({
    type: 'varchar',
    length: 40,
    default: FieldOpportunityStatusEnum.IDENTIFIED,
  })
  status: FieldOpportunityStatusEnum;

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

  @Column({ name: 'validated_by_manager', type: 'boolean', default: false })
  validatedByManager: boolean;

  @Column({ name: 'validated_at', type: 'timestamptz', nullable: true })
  validatedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('field_follow_ups')
@Index('IDX_field_follow_up_due', ['dueDate', 'status'])
export class FieldFollowUp {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'field_visit_id', type: 'int' })
  fieldVisitId: number;

  @Column({ name: 'field_opportunity_id', type: 'int', nullable: true })
  fieldOpportunityId: number | null;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'assigned_to_employee_id', type: 'int' })
  assignedToEmployeeId: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ type: 'text' })
  action: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: FieldFollowUpStatusEnum.OPEN,
  })
  status: FieldFollowUpStatusEnum;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'completion_note', type: 'text', nullable: true })
  completionNote: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('field_visit_expenses')
export class FieldVisitExpense {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'field_visit_id', type: 'int' })
  fieldVisitId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'expense_type', type: 'varchar', length: 40 })
  expenseType: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'receipt_document_id', type: 'int', nullable: true })
  receiptDocumentId: number | null;

  @Column({
    type: 'varchar',
    length: 60,
    default: FieldVisitExpenseStatusEnum.DRAFT,
  })
  status: FieldVisitExpenseStatusEnum;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({
    name: 'finance_reference',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  financeReference: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('field_mobile_sync_requests')
@Unique('UQ_field_mobile_sync_request', [
  'companyId',
  'employeeId',
  'syncRequestId',
])
export class FieldMobileSyncRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'sync_request_id', type: 'uuid' })
  syncRequestId: string;

  @Column({ name: 'device_identifier', type: 'varchar', length: 255 })
  deviceIdentifier: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 128 })
  payloadHash: string;

  @Column({ type: 'varchar', length: 40 })
  status: FieldMobileSyncStatusEnum;

  @Column({ name: 'item_count', type: 'int' })
  itemCount: number;

  @Column({ name: 'processed_count', type: 'int', default: 0 })
  processedCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
