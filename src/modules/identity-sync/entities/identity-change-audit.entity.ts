import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type IdentityField = 'first_name' | 'last_name' | 'email' | 'phone';

export const IDENTITY_FIELDS: readonly IdentityField[] = [
  'first_name',
  'last_name',
  'email',
  'phone',
];

export enum IdentityChangeSource {
  USER_UPDATE = 'user_update',
  EMPLOYEE_UPDATE = 'employee_update',
  ROLLBACK = 'rollback',
}

/**
 * One row per changed shared identity field. Rows written by the same
 * operation share a change_set_id. The table is append-only (DB trigger).
 */
@Entity('identity_change_audits')
@Index('IDX_identity_change_audits_change_set', ['change_set_id'])
@Index('IDX_identity_change_audits_user', ['user_id', 'created_at'])
@Index('IDX_identity_change_audits_employee', ['employee_id', 'created_at'])
@Index('IDX_identity_change_audits_companies', { synchronize: false })
export class IdentityChangeAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  change_set_id: string;

  /** Company in which the change was made. */
  @Column({ type: 'int' })
  company_id: number;

  /** Every company whose records were affected (for cross-tenant visibility). */
  @Column({ type: 'int', array: true, default: () => "'{}'" })
  affected_company_ids: number[];

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  /** Employee the change originated from (or the only employee when unlinked). */
  @Column({ type: 'int', nullable: true })
  employee_id: number | null;

  @Column({ type: 'int', array: true, default: () => "'{}'" })
  affected_employee_ids: number[];

  @Column({ type: 'varchar', length: 200, nullable: true })
  subject_name: string | null;

  @Column({ type: 'varchar', length: 30 })
  field: IdentityField;

  @Column({ type: 'varchar', length: 150, nullable: true })
  old_value: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  new_value: string | null;

  @Column({ type: 'varchar', length: 30 })
  source: IdentityChangeSource;

  @Column({ type: 'uuid', nullable: true })
  rollback_of_change_set_id: string | null;

  @Column({ type: 'int', nullable: true })
  actor_user_id: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  actor_name: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actor_email: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
