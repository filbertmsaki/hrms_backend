import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from '../../../../../companies/entities/company.entity';
import { CompanyUser } from '../../../../../companies/entities/company-user.entity';
import { Employee } from '../../../../employees/entities/employee.entity';
import { Timetable } from '../../timetables/entities/timetable.entity';
import { EmployeeTimetableStatusEnum } from '../enums/employee-timetable-status.enum';

@Entity('employee_timetables')
@Index('IDX_employee_timetables_company_id', ['companyId'])
@Index('IDX_employee_timetables_employee_id', ['employeeId'])
@Index('IDX_employee_timetables_timetable_id', ['timetableId'])
@Index('IDX_employee_timetables_effective_from', ['effectiveFrom'])
@Index('IDX_employee_timetables_status', ['status'])
@Index('IDX_employee_timetables_company_employee_status_from', [
  'companyId',
  'employeeId',
  'status',
  'effectiveFrom',
])
export class EmployeeTimetable {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'timetable_id', type: 'int' })
  timetableId: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EmployeeTimetableStatusEnum,
    default: EmployeeTimetableStatusEnum.ACTIVE,
  })
  status: EmployeeTimetableStatusEnum;

  @Column({ name: 'assigned_by', type: 'int', nullable: true })
  assignedBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => Timetable, (timetable) => timetable.employeeTimetables, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'timetable_id' })
  timetable: Timetable;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_by' })
  assignedByUser: CompanyUser | null;
}
