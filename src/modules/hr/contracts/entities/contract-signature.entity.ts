import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum ContractSignatureParty {
  COMPANY = 'COMPANY',
  EMPLOYEE = 'EMPLOYEE',
}

export enum ContractSignatureMethod {
  DIGITAL_TYPED = 'DIGITAL_TYPED',
  DIGITAL_DRAWN = 'DIGITAL_DRAWN',
  MANUAL_UPLOAD = 'MANUAL_UPLOAD',
  LEGACY = 'LEGACY',
}

export enum ContractSignatureVerification {
  TOTP = 'TOTP',
  EMAIL_OTP = 'EMAIL_OTP',
  HR_VERIFIED = 'HR_VERIFIED',
  PENDING = 'PENDING',
  NONE_LEGACY = 'NONE_LEGACY',
}

/** One immutable row per signing act (including rejected manual uploads). */
@Entity('contract_signatures')
@Index('IDX_contract_signature_contract', ['contractId'])
export class ContractSignature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'contract_id', type: 'int' })
  contractId: number;

  @Column({ name: 'contract_version', type: 'int' })
  contractVersion: number;

  @Column({ type: 'varchar', length: 20 })
  party: ContractSignatureParty;

  @Column({ type: 'varchar', length: 20 })
  method: ContractSignatureMethod;

  @Column({ name: 'verification_method', type: 'varchar', length: 20 })
  verificationMethod: ContractSignatureVerification;

  @Column({ name: 'signer_user_id', type: 'int', nullable: true })
  signerUserId: number | null;

  @Column({ name: 'signer_company_user_id', type: 'int', nullable: true })
  signerCompanyUserId: number | null;

  @Column({ name: 'signer_employee_id', type: 'int', nullable: true })
  signerEmployeeId: number | null;

  @Column({ name: 'signatory_id', type: 'int', nullable: true })
  signatoryId: number | null;

  @Column({ name: 'signer_name', type: 'varchar', length: 200 })
  signerName: string;

  @Column({
    name: 'signer_title',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  signerTitle: string | null;

  @Column({ name: 'attested_by_company_user_id', type: 'int', nullable: true })
  attestedByCompanyUserId: number | null;

  @Column({ name: 'signature_image_document_id', type: 'int', nullable: true })
  signatureImageDocumentId: number | null;

  @Column({
    name: 'signed_document_sha256',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  signedDocumentSha256: string | null;

  @Column({ name: 'result_document_id', type: 'int', nullable: true })
  resultDocumentId: number | null;

  @Column({
    name: 'result_sha256',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  resultSha256: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;

  @Column({ name: 'signed_at', type: 'timestamptz', default: () => 'now()' })
  signedAt: Date;

  @Column({
    name: 'verification_outcome',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  verificationOutcome: 'ACCEPTED' | 'REJECTED' | null;

  @Column({ name: 'verified_by_company_user_id', type: 'int', nullable: true })
  verifiedByCompanyUserId: number | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  rejectionReason: string | null;
}
