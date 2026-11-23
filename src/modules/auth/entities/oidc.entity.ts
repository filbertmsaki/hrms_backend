import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

@Entity('oidc_providers')
export class OidcProvider {
  @PrimaryColumn({ type: 'int' }) company_id: number;
  @Column({ type: 'text' }) issuer: string;
  @Column({ type: 'text' }) client_id: string;
  @Column({ type: 'text', select: false }) secret_ciphertext: string;
  @Column({ type: 'uuid' }) revision: string;
  @Column({ type: 'boolean', default: false }) enabled: boolean;
  @Column({ type: 'timestamptz', nullable: true }) tested_at: Date | null;
}

export type OidcPurpose = 'login' | 'link' | 'test';

@Entity('oidc_requests')
@Index('IDX_oidc_request_expiry', ['expires_at'])
export class OidcRequest {
  @PrimaryColumn({ type: 'varchar', length: 64 }) state_hash: string;
  @Column({ type: 'varchar', length: 64 }) browser_hash: string;
  @Column({ type: 'int' }) company_id: number;
  @Column({ type: 'uuid' }) revision: string;
  @Column({ type: 'varchar', length: 8 }) purpose: OidcPurpose;
  @Column({ type: 'uuid', nullable: true }) session_id: string | null;
  @Column({ type: 'int', nullable: true }) user_id: number | null;
  @Column({ type: 'text' }) verifier: string;
  @Column({ type: 'text' }) nonce: string;
  @Column({ type: 'timestamptz' }) expires_at: Date;
}

@Entity('oidc_identities')
@Unique('UQ_oidc_subject', ['company_id', 'issuer', 'client_id', 'subject'])
export class OidcIdentity {
  @PrimaryColumn({ type: 'int' }) company_id: number;
  @PrimaryColumn({ type: 'int' }) user_id: number;
  @Column({ type: 'text' }) issuer: string;
  @Column({ type: 'text' }) client_id: string;
  @Column({ type: 'text' }) subject: string;
}
