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
import { ShiftAssignmentStatusEnum } from '../enums/shift-assignment-status.enum';
import { ShiftRotationGroup } from '../../shift-rotation-groups/entities/shift-rotation-group.entity';

@Entity('shift_assignments')
@Index('IDX_shift_assignments_company_id', ['companyId'])
@Index('IDX_shift_assignments_employee_id', ['employeeId'])
@Index('IDX_shift_assignments_shift_id', ['shiftId'])
@Index('IDX_shift_assignments_rotation_group_id', ['rotationGroupId'])
@Index('IDX_shift_assignments_status', ['status'])
export class ShiftAssignment {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'shift_id', type: 'int' })
  shiftId: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'rotation_group_id', type: 'int', nullable: true })
  rotationGroupId: number | null;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'status', type: 'enum', enum: ShiftAssignmentStatusEnum, default: ShiftAssignmentStatusEnum.ACTIVE })
  status: ShiftAssignmentStatusEnum;

  @Column({ name: 'assigned_by', type: 'int', nullable: true })
  assignedBy: number | null;

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

  @ManyToOne(() => Shift, (shift) => shift.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;

  @ManyToOne(() => ShiftRotationGroup, (rotationGroup) => rotationGroup.assignments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'rotation_group_id' })
  rotationGroup: ShiftRotationGroup | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_by' })
  assignedByUser: CompanyUser | null;
}
