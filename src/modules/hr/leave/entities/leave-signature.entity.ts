import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LeaveSignerRole = 'EMPLOYEE' | 'APPROVER';
export type LeaveSignatureStatus = 'valid' | 'superseded';
export const LEAVE_SIGNATURE_METHOD = 'HRMS_AUTHENTICATED_CONFIRMATION';

/** See migration LeaveSignatures1797900033000. */
@Entity('leave_signatures')
@Index('IDX_leave_signature_request', ['leave_request_id'])
@Index('UQ_leave_signature_reference', ['audit_reference'], { unique: true })
@Index('UQ_leave_signature_employee_valid', ['leave_request_id'], {
  unique: true,
  where: `"signer_role" = 'EMPLOYEE' AND "status" = 'valid'`,
})
@Index('UQ_leave_signature_approval', ['leave_request_approval_id'], {
  unique: true,
  where: `"leave_request_approval_id" IS NOT NULL`,
})
export class LeaveSignature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'int' })
  leave_request_id: number;

  @Column({ type: 'int', nullable: true })
  leave_request_approval_id: number | null;

  @Column({ type: 'varchar', length: 20 })
  signer_role: LeaveSignerRole;

  @Column({ type: 'int' })
  signer_company_user_id: number;

  @Column({ type: 'int', nullable: true })
  signer_employee_id: number | null;

  @Column({ type: 'varchar', length: 200 })
  signer_name: string;

  /** Approver signatures: the decision signed (approved / rejected / …). */
  @Column({ type: 'varchar', length: 30, nullable: true })
  decision: string | null;

  @Column({ type: 'varchar', length: 60 })
  method: string;

  /** SHA-256 of the signed application content (LeaveSignatureService.documentHash). */
  @Column({ type: 'varchar', length: 64 })
  document_hash: string;

  @Column({ type: 'int' })
  approval_cycle: number;

  @Column({ type: 'varchar', length: 20, default: 'valid' })
  status: LeaveSignatureStatus;

  @Column({ type: 'varchar', length: 20 })
  audit_reference: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  signed_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  superseded_at: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip_address: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  user_agent: string | null;

  /** TYPED = name typed by the signer; DRAWN = image drawn on screen. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  signature_kind: 'TYPED' | 'DRAWN' | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  signature_text: string | null;

  /** Drawn signature (PNG). Not returned by the list API. */
  @Column({ type: 'bytea', nullable: true, select: false })
  signature_png: Buffer | null;
}
