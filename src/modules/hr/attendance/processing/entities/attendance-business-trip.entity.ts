import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';
import { CompanyUser } from '../../../../companies/entities/company-user.entity';
import { Employee } from '../../../employees/entities/employee.entity';

@Entity('attendance_business_trips')
@Index('IDX_attendance_business_trips_company_id', ['companyId'])
@Index('IDX_attendance_business_trips_employee_id', ['employeeId'])
@Index('IDX_attendance_business_trips_status', ['status'])
@Index('IDX_attendance_business_trips_date_range', ['startDate', 'endDate'])
export class AttendanceBusinessTrip {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'approved' })
  status: string;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

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

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by_company_user_id' })
  approvedByCompanyUser: CompanyUser | null;
}
