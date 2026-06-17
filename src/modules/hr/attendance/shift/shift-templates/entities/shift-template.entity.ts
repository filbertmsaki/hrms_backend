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
import { ShiftTemplateTypeEnum } from '../enums/shift-template-type.enum';
import { ShiftTemplateStatusEnum } from '../enums/shift-template-status.enum';

@Entity('shift_templates')
@Index('IDX_shift_templates_company_id', ['companyId'])
@Index('IDX_shift_templates_status', ['status'])
@Index('UQ_shift_templates_company_name', ['companyId', 'name'], {
  unique: true,
})
export class ShiftTemplate {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'template_type', type: 'enum', enum: ShiftTemplateTypeEnum })
  templateType: ShiftTemplateTypeEnum;

  @Column({ name: 'configuration', type: 'json' })
  configuration: Record<string, unknown>;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ShiftTemplateStatusEnum,
    default: ShiftTemplateStatusEnum.ACTIVE,
  })
  status: ShiftTemplateStatusEnum;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
