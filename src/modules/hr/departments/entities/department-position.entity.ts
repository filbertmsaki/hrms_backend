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
import { Company } from '../../../companies/entities/company.entity';
import { Department } from './department.entity';
import { Position } from '../../positions/entities/position.entity';

@Entity('department_positions')
@Index('IDX_department_position_company', ['company_id'])
@Index('IDX_department_position_department', ['department_id'])
@Index('IDX_department_position_position', ['position_id'])
@Unique('UQ_department_position_company_department_position', [
  'company_id',
  'department_id',
  'position_id',
])
export class DepartmentPosition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  department_id: number;

  @Column()
  position_id: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Department, (department) => department.position_mappings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @ManyToOne(() => Position, (position) => position.department_mappings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'position_id' })
  position: Position;
}
