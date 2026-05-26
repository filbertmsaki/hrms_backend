import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { AccessGroupDoor } from '../../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../../access-group-employees/entity/access-group-employee.entity';
import { AccessScheduleTemplate } from '../../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessGroupStatusEnum } from '../enum/access-group-status.enum';

@Entity('access_groups')
@Index('IDX_access_groups_company_id', ['companyId'])
@Index('IDX_access_groups_branch_id', ['branchId'])
@Index('IDX_access_groups_schedule_template_id', ['scheduleTemplateId'])
export class AccessGroup {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'schedule_template_id', type: 'int' })
  scheduleTemplateId: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AccessGroupStatusEnum,
    default: AccessGroupStatusEnum.ACTIVE,
  })
  status: AccessGroupStatusEnum;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => AccessScheduleTemplate, (template) => template.groups, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'schedule_template_id' })
  scheduleTemplate: AccessScheduleTemplate;

  @OneToMany(() => AccessGroupDoor, (groupDoor) => groupDoor.accessGroup)
  doors: AccessGroupDoor[];

  @OneToMany(() => AccessGroupEmployee, (groupEmployee) => groupEmployee.accessGroup)
  employees: AccessGroupEmployee[];
}

