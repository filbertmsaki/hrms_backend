import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('attendance_checkpoint_qr_token_uses')
@Index(
  'UQ_attendance_checkpoint_qr_token_use',
  ['companyId', 'checkpointId', 'tokenNonceHash', 'employeeId'],
  { unique: true },
)
@Index('IDX_attendance_checkpoint_qr_token_uses_expires_at', ['expiresAt'])
export class AttendanceCheckpointQrTokenUse {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'checkpoint_id', type: 'int' })
  checkpointId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'token_nonce_hash', type: 'varchar', length: 64 })
  tokenNonceHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
