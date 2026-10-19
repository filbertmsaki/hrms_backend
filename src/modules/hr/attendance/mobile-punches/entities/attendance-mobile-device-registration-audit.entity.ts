import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AttendanceMobileDeviceAuditAction =
  | 'ENROLLED'
  | 'RELEASED'
  | 'REASSIGNED';

@Entity('attendance_mobile_device_registration_audits')
@Index('IDX_attendance_mobile_device_audits_company_registration', [
  'companyId',
  'registrationId',
  'createdAt',
])
export class AttendanceMobileDeviceRegistrationAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'registration_id', type: 'int' })
  registrationId: number;

  @Column({ name: 'device_identifier', type: 'varchar', length: 255 })
  deviceIdentifier: string;

  @Column({ type: 'varchar', length: 20 })
  action: AttendanceMobileDeviceAuditAction;

  @Column({ name: 'previous_employee_id', type: 'int', nullable: true })
  previousEmployeeId: number | null;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'actor_company_user_id', type: 'int', nullable: true })
  actorCompanyUserId: number | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'device_info', type: 'jsonb', nullable: true })
  deviceInfo: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
