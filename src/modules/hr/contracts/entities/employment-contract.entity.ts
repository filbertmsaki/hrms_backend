import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum EmploymentContractType {
  UNSPECIFIED = 'UNSPECIFIED',
  FIXED_TERM = 'FIXED_TERM',
  SPECIFIC_TASK = 'SPECIFIC_TASK',
}

export enum EmploymentContractStatus {
  ISSUED = 'ISSUED',
  SIGNED = 'SIGNED',
  SUPERSEDED = 'SUPERSEDED',
}

@Entity('employment_contracts')
@Index('UQ_employment_contract_version', ['companyId', 'employeeId', 'version'], { unique: true })
export class EmploymentContract {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column()
  version: number;

  @Column({ name: 'contract_type', type: 'varchar', length: 30 })
  contractType: EmploymentContractType;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'jsonb' })
  particulars: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: EmploymentContractStatus.ISSUED })
  status: EmploymentContractStatus;

  @Column({ name: 'document_id', type: 'int', nullable: true })
  documentId: number | null;

  @Column({ name: 'issued_by_company_user_id', type: 'int' })
  issuedByCompanyUserId: number;

  @Column({ name: 'signed_by_user_id', type: 'int', nullable: true })
  signedByUserId: number | null;

  @Column({ name: 'signed_name', type: 'varchar', length: 200, nullable: true })
  signedName: string | null;

  @Column({ name: 'signed_ip', type: 'varchar', length: 64, nullable: true })
  signedIp: string | null;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
