import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * An employee designated to sign employment contracts on behalf of the
 * company. Signing authority comes from an active row here AND being the
 * contract's assigned signatory — never from a role permission.
 */
@Entity('contract_signatories')
@Unique('UQ_contract_signatory_employee', ['companyId', 'employeeId'])
export class ContractSignatory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName: string;

  @Column({ name: 'job_title', type: 'varchar', length: 200 })
  jobTitle: string;

  @Column({ name: 'scope_note', type: 'varchar', length: 300, nullable: true })
  scopeNote: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'designated_by_company_user_id', type: 'int' })
  designatedByCompanyUserId: number;

  @Column({
    name: 'designated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  designatedAt: Date;

  @Column({ name: 'revoked_by_company_user_id', type: 'int', nullable: true })
  revokedByCompanyUserId: number | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({
    name: 'revoke_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  revokeReason: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
