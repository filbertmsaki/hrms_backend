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
import { Company } from '../../../../../companies/entities/company.entity';
import { CompanyUser } from '../../../../../companies/entities/company-user.entity';
import { Employee } from '../../../../employees/entities/employee.entity';
import { Shift } from '../../shifts/entities/shift.entity';
import { ShiftChangeRequestStatusEnum } from '../enums/shift-change-request-status.enum';

@Entity('shift_change_requests')
@Index('IDX_shift_change_requests_company_id', ['companyId'])
@Index('IDX_shift_change_requests_employee_id', ['employeeId'])
@Index('IDX_shift_change_requests_request_date', ['requestDate'])
@Index('IDX_shift_change_requests_status', ['status'])
export class ShiftChangeRequest {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'current_shift_id', type: 'int' })
  currentShiftId: number;

  @Column({ name: 'requested_shift_id', type: 'int' })
  requestedShiftId: number;

  @Column({ name: 'request_date', type: 'date' })
  requestDate: string;

  @Column({ name: 'reason', type: 'text' })
  reason: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ShiftChangeRequestStatusEnum,
    default: ShiftChangeRequestStatusEnum.PENDING,
  })
  status: ShiftChangeRequestStatusEnum;

  @Column({ name: 'approved_by', type: 'int', nullable: true })
  approvedBy: number | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

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

  @ManyToOne(() => Shift, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'current_shift_id' })
  currentShift: Shift;

  @ManyToOne(() => Shift, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requested_shift_id' })
  requestedShift: Shift;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approver: CompanyUser | null;
}
