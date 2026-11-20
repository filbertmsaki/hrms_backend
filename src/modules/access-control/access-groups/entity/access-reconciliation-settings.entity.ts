import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('access_reconciliation_settings')
export class AccessReconciliationSettings {
  @PrimaryColumn({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'enabled', type: 'boolean', default: false })
  enabled: boolean;
  @Column({ name: 'updated_by_company_user_id', type: 'int', nullable: true })
  updatedByCompanyUserId: number | null;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
