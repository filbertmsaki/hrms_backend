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
import { Employee } from '../../entities/employee.entity';
import { User } from '../../../../users/entities/user.entity';
import { EmployeeImportBatch } from './employee-import-batch.entity';
import { EmployeeImportRowStatusEnum } from '../enums/employee-import-row-status.enum';

@Entity('employee_import_rows')
@Index('IDX_employee_import_rows_batch', ['batchId'])
@Index('IDX_employee_import_rows_status', ['status'])
@Index('IDX_employee_import_rows_employee_number', ['employeeNumber'])
export class EmployeeImportRow {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'batch_id', type: 'int' })
  batchId: number;

  @Column({ name: 'row_number', type: 'int' })
  rowNumber: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EmployeeImportRowStatusEnum,
    default: EmployeeImportRowStatusEnum.READY,
  })
  status: EmployeeImportRowStatusEnum;

  @Column({
    name: 'employee_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  employeeName: string | null;

  @Column({
    name: 'employee_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  employeeNumber: string | null;

  @Column({
    name: 'device_employee_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  deviceEmployeeNumber: string | null;

  @Column({
    name: 'import_action',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  importAction: string | null;

  @Column({ name: 'raw_data', type: 'json' })
  rawData: Record<string, unknown>;

  @Column({ name: 'normalized_data', type: 'json', nullable: true })
  normalizedData: Record<string, unknown> | null;

  @Column({ name: 'warnings', type: 'json', nullable: true })
  warnings: string[] | null;

  @Column({ name: 'errors', type: 'json', nullable: true })
  errors: string[] | null;

  @Column({ name: 'matched_employee_id', type: 'int', nullable: true })
  matchedEmployeeId: number | null;

  @Column({ name: 'created_employee_id', type: 'int', nullable: true })
  createdEmployeeId: number | null;

  @Column({ name: 'created_user_id', type: 'int', nullable: true })
  createdUserId: number | null;

  @Column({ name: 'result_data', type: 'json', nullable: true })
  resultData: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => EmployeeImportBatch, (batch) => batch.rows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'batch_id' })
  batch: EmployeeImportBatch;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'matched_employee_id' })
  matchedEmployee: Employee | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_employee_id' })
  createdEmployee: Employee | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_user_id' })
  createdUser: User | null;
}
