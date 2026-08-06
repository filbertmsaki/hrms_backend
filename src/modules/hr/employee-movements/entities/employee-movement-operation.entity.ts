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
  VersionColumn,
} from 'typeorm';
import { EmployeeMovement } from './employee-movement.entity';
import { EmployeeMovementOperationTypeEnum } from '../enums/employee-movement-operation-type.enum';
import { EmployeeMovementOperationStatusEnum } from '../enums/employee-movement-operation-status.enum';

@Entity('employee_movement_operations')
@Unique('UQ_movement_operation_resource', [
  'movementId',
  'operationType',
  'resourceKey',
])
@Index('IDX_movement_operation_company_status', ['companyId', 'status'])
export class EmployeeMovementOperation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'movement_id' })
  movementId: number;

  @Column({ name: 'operation_type', type: 'varchar', length: 60 })
  operationType: EmployeeMovementOperationTypeEnum;

  @Column({ name: 'resource_key', type: 'varchar', length: 200 })
  resourceKey: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: EmployeeMovementOperationStatusEnum.PENDING,
  })
  status: EmployeeMovementOperationStatusEnum;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ name: 'attempt_count', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => EmployeeMovement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movement_id' })
  movement: EmployeeMovement;
}
