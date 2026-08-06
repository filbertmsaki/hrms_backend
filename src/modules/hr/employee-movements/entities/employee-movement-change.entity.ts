import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { EmployeeMovementFieldEnum } from '../enums/employee-movement-field.enum';
import { EmployeeMovement } from './employee-movement.entity';

@Entity('employee_movement_changes')
@Unique('UQ_employee_movement_field', ['movementId', 'field'])
export class EmployeeMovementChange {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'movement_id' })
  movementId: number;

  @Column({ type: 'varchar', length: 40 })
  field: EmployeeMovementFieldEnum;

  @Column({ name: 'old_reference_id', type: 'int', nullable: true })
  oldReferenceId: number | null;

  @Column({ name: 'new_reference_id', type: 'int', nullable: true })
  newReferenceId: number | null;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue: Record<string, unknown> | null;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => EmployeeMovement, (movement) => movement.changes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'movement_id' })
  movement: EmployeeMovement;
}
