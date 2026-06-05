import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { AttendanceDevice } from '../../../../access-control/attendance-devices/entities/attendance-device.entity';

@Entity('employee_device_identities')
@Index('IDX_employee_device_identities_company_id', ['companyId'])
@Index('IDX_employee_device_identities_employee_id', ['employeeId'])
@Index('IDX_employee_device_identities_employee_no', ['employeeNo'])
@Index('IDX_employee_device_identities_device_id', ['deviceId'])
@Index('IDX_employee_device_identities_company_empno_device', ['companyId', 'employeeNo', 'deviceId'])
@Unique('UQ_employee_device_identities_company_device_employee_no', ['companyId', 'deviceId', 'employeeNo'])
@Unique('UQ_employee_device_identities_company_employee_device', ['companyId', 'employeeId', 'deviceId'])
export class EmployeeDeviceIdentity {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'employee_no', type: 'varchar', length: 100 })
  employeeNo: string;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => AttendanceDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;
}

