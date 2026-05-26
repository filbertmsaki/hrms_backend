import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { Department } from '../../../hr/departments/entities/department.entity';
import { AccessOrganizationSyncStatusEnum } from '../enum/access-organization-sync-status.enum';

@Entity('access_organizations')
@Index('IDX_access_organizations_company_id', ['companyId'])
@Index('IDX_access_organizations_branch_id', ['branchId'])
@Index('IDX_access_organizations_department_id', ['departmentId'])
@Index('IDX_access_organizations_group_no', ['hikvisionGroupNo'])
export class AccessOrganization {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({ name: 'hikvision_group_no', type: 'varchar', length: 50 })
  hikvisionGroupNo: string;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({
    name: 'sync_status',
    type: 'enum',
    enum: AccessOrganizationSyncStatusEnum,
    default: AccessOrganizationSyncStatusEnum.PENDING,
  })
  syncStatus: AccessOrganizationSyncStatusEnum;

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

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;
}

