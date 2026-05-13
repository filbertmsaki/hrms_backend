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
import { Company } from '../../../companies/entities/company.entity';
import { Designation } from '../../designations/entities/designation.entity';
import { Position } from '../../positions/entities/position.entity';
import { EmployeePositionAssignmentTypeEnum } from '../enums/employee-position-assignment-type.enum';
import { EmployeePositionStatusEnum } from '../enums/employee-position-status.enum';
import { Employee } from './employee.entity';

@Entity('employee_positions')
@Index('IDX_employee_position_company', ['company_id'])
@Index('IDX_employee_position_employee', ['employee_id'])
@Index('IDX_employee_position_position', ['position_id'])
@Index('IDX_employee_position_designation', ['designation_id'])
@Index('IDX_employee_position_is_primary', ['is_primary'])
export class EmployeePosition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column()
  position_id: number;

  @Column({ type: 'int', nullable: true })
  designation_id: number | null;

  @Column({ default: false })
  is_primary: boolean;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({
    type: 'enum',
    enum: EmployeePositionAssignmentTypeEnum,
    default: EmployeePositionAssignmentTypeEnum.PRIMARY,
  })
  assignment_type: EmployeePositionAssignmentTypeEnum;

  @Column({
    type: 'enum',
    enum: EmployeePositionStatusEnum,
    default: EmployeePositionStatusEnum.ACTIVE,
  })
  status: EmployeePositionStatusEnum;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, (employee) => employee.position_assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => Position, (position) => position.employee_assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'position_id' })
  position: Position;

  @ManyToOne(() => Designation, (designation) => designation.employee_positions, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'designation_id' })
  designation: Designation | null;
}
