import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmployeeImportOutboxEventType } from '../enums/employee-import-outbox-event-type.enum';
import { EmployeeImportOutboxStatus } from '../enums/employee-import-outbox-status.enum';

@Entity('employee_import_outbox_events')
@Index('UQ_employee_import_outbox_event_id', ['eventId'], { unique: true })
@Index('IDX_employee_import_outbox_pending', ['status', 'availableAt'])
export class EmployeeImportOutboxEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'batch_id', type: 'int' })
  batchId: number;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: EmployeeImportOutboxEventType;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 30,
    default: EmployeeImportOutboxStatus.PENDING,
  })
  status: EmployeeImportOutboxStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({
    name: 'available_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  availableAt: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
