import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../../../companies/entities/company.entity';
import { ShiftRotationGroupStatusEnum } from '../enums/shift-rotation-group-status.enum';
import { ShiftAssignment } from '../../shift-assignments/entities/shift-assignment.entity';
import { ShiftRotationRule } from '../../shift-rotation-rules/entities/shift-rotation-rule.entity';

@Entity('shift_rotation_groups')
@Index('IDX_shift_rotation_groups_company_id', ['companyId'])
@Index('IDX_shift_rotation_groups_status', ['status'])
@Index('UQ_shift_rotation_groups_company_code', ['companyId', 'code'], {
  unique: true,
})
@Index('UQ_shift_rotation_groups_company_name', ['companyId', 'name'], {
  unique: true,
})
export class ShiftRotationGroup {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'code', type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'cycle_days', type: 'int' })
  cycleDays: number;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ShiftRotationGroupStatusEnum,
    default: ShiftRotationGroupStatusEnum.ACTIVE,
  })
  status: ShiftRotationGroupStatusEnum;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => ShiftAssignment, (assignment) => assignment.rotationGroup)
  assignments: ShiftAssignment[];

  @OneToMany(() => ShiftRotationRule, (rule) => rule.rotationGroup)
  rules: ShiftRotationRule[];
}
