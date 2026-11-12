import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type KpiMeasurement =
  | 'numeric'
  | 'percentage'
  | 'currency'
  | 'duration'
  | 'binary'
  | 'milestone'
  | 'qualitative';
export type KpiDirection =
  | 'higher'
  | 'lower'
  | 'exact'
  | 'range'
  | 'not_applicable';
export type KpiFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type KpiSubject = 'employee' | 'department' | 'branch' | 'manager_group';

@Entity('phase1a_kpi_definitions')
@Unique('UQ_phase1a_kpi_definition_code', ['companyId', 'code'])
export class KpiDefinition {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ type: 'varchar', length: 80 }) code: string;
  @Column({ type: 'varchar', length: 20, default: 'draft' }) status:
    | 'draft'
    | 'published'
    | 'archived';
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('phase1a_kpi_definition_versions')
@Unique('UQ_phase1a_kpi_definition_version', ['definitionId', 'version'])
@Index('IDX_phase1a_kpi_version_company', ['companyId'])
export class KpiDefinitionVersion {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'definition_id', type: 'int' }) definitionId: number;
  @Column({ type: 'int' }) version: number;
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'varchar', length: 100 }) category: string;
  @Column({ name: 'strategic_objective', type: 'text', nullable: true })
  strategicObjective: string | null;
  @Column({ name: 'measurement_type', type: 'varchar', length: 30 })
  measurementType: KpiMeasurement;
  @Column({
    name: 'measurement_unit',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  measurementUnit: string | null;
  @Column({ type: 'varchar', length: 30 }) direction: KpiDirection;
  @Column({ type: 'varchar', length: 20 }) frequency: KpiFrequency;
  @Column({ name: 'owner_employee_id', type: 'int', nullable: true })
  ownerEmployeeId: number | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase1a_kpi_templates')
@Unique('UQ_phase1a_kpi_template_code', ['companyId', 'code'])
export class KpiTemplate {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ type: 'varchar', length: 80 }) code: string;
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'varchar', length: 100 }) category: string;
  @Column({
    name: 'department_classification',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  departmentClassification: string | null;
  @Column({ name: 'strategic_objective', type: 'text', nullable: true })
  strategicObjective: string | null;
  @Column({ name: 'measurement_type', type: 'varchar', length: 30 })
  measurementType: KpiMeasurement;
  @Column({
    name: 'measurement_unit',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  measurementUnit: string | null;
  @Column({ type: 'varchar', length: 30 }) direction: KpiDirection;
  @Column({ type: 'varchar', length: 20 }) frequency: KpiFrequency;
  @Column({ type: 'varchar', length: 20, default: 'draft' }) status:
    | 'draft'
    | 'published';
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('phase1a_kpi_periods')
@Unique('UQ_phase1a_kpi_period', [
  'companyId',
  'frequency',
  'startDate',
  'endDate',
])
export class KpiPeriod {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ type: 'varchar', length: 20 }) frequency: KpiFrequency;
  @Column({ type: 'varchar', length: 100 }) label: string;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'end_date', type: 'date' }) endDate: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) timezone:
    | string
    | null;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase1a_kpi_assignments')
@Index('IDX_phase1a_kpi_assignment_subject', [
  'companyId',
  'subjectType',
  'subjectId',
])
export class KpiAssignment {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'definition_version_id', type: 'int' })
  definitionVersionId: number;
  @Column({ name: 'period_id', type: 'int' }) periodId: number;
  @Column({ name: 'subject_type', type: 'varchar', length: 30 })
  subjectType: KpiSubject;
  @Column({ name: 'subject_id', type: 'int' }) subjectId: number;
  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;
  @Column({ name: 'organization_snapshot', type: 'jsonb' })
  organizationSnapshot: Record<string, unknown>;
  @Column({ type: 'varchar', length: 20, default: 'active' }) status:
    | 'active'
    | 'inactive';
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('phase1a_kpi_target_revisions')
@Unique('UQ_phase1a_kpi_target_revision', ['assignmentId', 'revision'])
export class KpiTargetRevision {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'assignment_id', type: 'int' }) assignmentId: number;
  @Column({ type: 'int' }) revision: number;
  @Column({ type: 'jsonb' }) target: Record<string, unknown>;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @Column({ name: 'changed_by', type: 'int' }) changedBy: number;
  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;
}
