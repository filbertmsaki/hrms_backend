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
import { KpiApplicabilityRuleStatusEnum } from '../enums/kpi-applicability-rule-status.enum';

@Entity('kpi_applicability_rules')
@Unique('UQ_kpi_applicability_rule_company_version_priority', [
  'companyId',
  'kpiDefinitionVersionId',
  'priority',
])
@Index('IDX_kpi_applicability_rule_company_status', ['companyId', 'status'])
export class KpiApplicabilityRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'kpi_definition_version_id', type: 'int' })
  kpiDefinitionVersionId: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({
    type: 'enum',
    enum: KpiApplicabilityRuleStatusEnum,
    enumName: 'kpi_applicability_rule_status_enum',
    default: KpiApplicabilityRuleStatusEnum.ACTIVE,
  })
  status: KpiApplicabilityRuleStatusEnum;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'financial_year_id', type: 'int', nullable: true })
  financialYearId: number | null;

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

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'review_cycle', type: 'varchar', length: 40, nullable: true })
  reviewCycle: string | null;

  @Column({
    name: 'template_code',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  templateCode: string | null;

  @Column({
    name: 'weight_override',
    type: 'decimal',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  weightOverride: string | null;

  @Column({
    name: 'target_override',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  targetOverride: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
