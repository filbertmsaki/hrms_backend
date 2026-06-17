import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from '../../../../../companies/entities/company.entity';
import { Timetable } from '../../timetables/entities/timetable.entity';
import { TimetableRotationStatusEnum } from '../enums/timetable-rotation-status.enum';
import { TimetableRotationRule } from '../../timetable-rotation-rules/entities/timetable-rotation-rule.entity';

@Entity('timetable_rotations')
@Index('IDX_timetable_rotations_company_id', ['companyId'])
@Index('IDX_timetable_rotations_timetable_id', ['timetableId'])
@Index('IDX_timetable_rotations_status', ['status'])
@Index('UQ_timetable_rotations_timetable_name', ['timetableId', 'name'], {
  unique: true,
})
export class TimetableRotation {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'timetable_id', type: 'int' })
  timetableId: number;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'cycle_days', type: 'int' })
  cycleDays: number;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: TimetableRotationStatusEnum,
    default: TimetableRotationStatusEnum.ACTIVE,
  })
  status: TimetableRotationStatusEnum;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Timetable, (timetable) => timetable.rotations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'timetable_id' })
  timetable: Timetable;

  @OneToMany(() => TimetableRotationRule, (rule) => rule.rotation)
  rules: TimetableRotationRule[];
}
