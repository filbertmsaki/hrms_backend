import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentEventTypeEnum } from '../enums/employment-event-type.enum';

/**
 * Append-only employment timeline (hire, activation, probation outcomes,
 * contract lifecycle, movements). Rows are never updated or deleted by the
 * application so the history remains auditable.
 */
@Entity('employee_employment_events')
@Index('IDX_employee_employment_event_employee', [
  'company_id',
  'employee_id',
  'effective_date',
])
@Index('UQ_employee_employment_event_dedupe', ['company_id', 'dedupe_key'], {
  unique: true,
  where: '"dedupe_key" IS NOT NULL',
})
export class EmployeeEmploymentEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column({ type: 'varchar', length: 40 })
  event_type: EmploymentEventTypeEnum;

  @Column({ type: 'date' })
  effective_date: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  source_module: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  source_entity_type: string | null;

  @Column({ type: 'int', nullable: true })
  source_entity_id: number | null;

  @Column({ type: 'jsonb', nullable: true })
  old_values: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  new_values: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  dedupe_key: string | null;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip_address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  request_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
