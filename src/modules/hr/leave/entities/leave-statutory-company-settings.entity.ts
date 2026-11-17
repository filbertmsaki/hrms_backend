import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Company default jurisdiction; a branch's own jurisdiction overrides it. */
@Entity('leave_statutory_company_settings')
export class LeaveStatutoryCompanySettings {
  @PrimaryColumn()
  company_id: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  default_jurisdiction_code: string | null;

  @Column({ type: 'int', nullable: true })
  updated_by_company_user_id: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
