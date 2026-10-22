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
import { Employee } from './employee.entity';

export enum EmployeeAssetStatusEnum {
  ACTIVE = 'ACTIVE',
  RETURNED = 'RETURNED',
  MISSING = 'MISSING',
  RETIRED = 'RETIRED',
}

@Entity('employee_assets')
@Index('IDX_employee_asset_company_employee_status', [
  'company_id',
  'employee_id',
  'status',
])
@Index('IDX_employee_asset_identifier', ['company_id', 'asset_identifier'])
export class EmployeeAsset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column({ type: 'varchar', length: 40 })
  asset_type: string;

  @Column({ type: 'varchar', length: 180 })
  asset_label: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  asset_identifier: string | null;

  @Column({ type: 'date' })
  issued_at: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  condition_at_issue: string | null;

  @Column({ type: 'int', nullable: true })
  issued_by_company_user_id: number | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: EmployeeAssetStatusEnum.ACTIVE,
  })
  status: EmployeeAssetStatusEnum;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
