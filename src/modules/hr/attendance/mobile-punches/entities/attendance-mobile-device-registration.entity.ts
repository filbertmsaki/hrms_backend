import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('attendance_mobile_device_registrations')
@Index(
  'UQ_attendance_mobile_device_company_identifier',
  ['companyId', 'deviceIdentifier'],
  { unique: true },
)
@Index('IDX_attendance_mobile_device_company_employee', [
  'companyId',
  'employeeId',
])
export class AttendanceMobileDeviceRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'device_identifier', type: 'varchar', length: 255 })
  deviceIdentifier: string;

  @Column({ name: 'device_info', type: 'jsonb', nullable: true })
  deviceInfo: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: 'ACTIVE' | 'UNBOUND';

  @Column({
    name: 'first_seen_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  firstSeenAt: Date;

  @Column({
    name: 'last_seen_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastSeenAt: Date;

  @Column({ name: 'last_employee_id', type: 'int', nullable: true })
  lastEmployeeId: number | null;

  @Column({ name: 'released_by_company_user_id', type: 'int', nullable: true })
  releasedByCompanyUserId: number | null;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'release_reason', type: 'text', nullable: true })
  releaseReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
