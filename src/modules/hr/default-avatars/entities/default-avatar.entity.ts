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
import { Company } from '../../../companies/entities/company.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { DefaultAvatarGenderEnum } from '../enums/default-avatar-gender.enum';
import { DefaultAvatarStatusEnum } from '../enums/default-avatar-status.enum';

@Entity('default_avatars')
@Index('IDX_default_avatars_company_status_order', [
  'company_id',
  'status',
  'display_order',
])
@Index('IDX_default_avatars_company_gender_status', [
  'company_id',
  'gender_category',
  'status',
])
export class DefaultAvatar {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'varchar', length: 120 })
  avatar_name: string;

  @Column({ type: 'text' })
  image_path: string;

  @Column({
    type: 'enum',
    enum: DefaultAvatarGenderEnum,
    default: DefaultAvatarGenderEnum.NEUTRAL,
  })
  gender_category: DefaultAvatarGenderEnum;

  @Column({
    type: 'enum',
    enum: DefaultAvatarStatusEnum,
    default: DefaultAvatarStatusEnum.ACTIVE,
  })
  status: DefaultAvatarStatusEnum;

  @Column({ type: 'int', default: 0 })
  display_order: number;

  @Column({ default: false })
  is_default: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => Employee, (employee) => employee.default_avatar)
  employees: Employee[];
}
