import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RecruitmentCandidateStatus {
  APPLIED = 'APPLIED',
  SHORTLISTED = 'SHORTLISTED',
  REJECTED = 'REJECTED',
  OFFER_DRAFT = 'OFFER_DRAFT',
  OFFER_APPROVED = 'OFFER_APPROVED',
  OFFER_ACCEPTED = 'OFFER_ACCEPTED',
  INVITED = 'INVITED',
  HIRED = 'HIRED',
  PURGED = 'PURGED',
}

@Entity('recruitment_candidates')
@Index('IDX_recruitment_candidate_request_status', ['requestId', 'status'])
export class RecruitmentCandidate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'request_id' })
  requestId: number;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 25, nullable: true })
  phone: string | null;

  @Column({ name: 'cv_document_id', type: 'int', nullable: true })
  cvDocumentId: number | null;

  @Column({ name: 'interview', type: 'jsonb', nullable: true })
  interview: Record<string, unknown> | null;

  @Column({ name: 'checks', type: 'jsonb', nullable: true })
  checks: Record<string, unknown> | null;

  @Column({
    name: 'offer_salary',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  offerSalary: string | null;

  @Column({ name: 'offer_start_date', type: 'date', nullable: true })
  offerStartDate: string | null;

  @Column({ name: 'offer_document_id', type: 'int', nullable: true })
  offerDocumentId: number | null;

  @Column({
    name: 'offer_created_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  offerCreatedByCompanyUserId: number | null;

  @Column({
    name: 'offer_approved_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  offerApprovedByCompanyUserId: number | null;

  @Column({
    name: 'offer_token_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  offerTokenHash: string | null;

  @Column({ name: 'offer_expires_at', type: 'timestamptz', nullable: true })
  offerExpiresAt: Date | null;

  @Column({ name: 'offer_accepted_at', type: 'timestamptz', nullable: true })
  offerAcceptedAt: Date | null;

  @Column({ name: 'invitation_id', type: 'int', nullable: true })
  invitationId: number | null;

  @Column({ name: 'retention_until', type: 'timestamptz', nullable: true })
  retentionUntil: Date | null;

  @Column({ name: 'purged_at', type: 'timestamptz', nullable: true })
  purgedAt: Date | null;

  @Column({ type: 'varchar', length: 30 })
  status: RecruitmentCandidateStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
