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
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { AccessOrganizationSourceEnum } from '../enum/access-organization-source.enum';
import { AccessOrganizationSyncStatusEnum } from '../enum/access-organization-sync-status.enum';
import { AccessOrganizationEmployee } from '../../access-organization-employees/entity/access-organization-employee.entity';
import { AccessGroup } from '../../access-groups/entity/access-group.entity';
import { EmployeeDeviceAssignment } from '../../employee-device-assignments/entity/employee-device-assignment.entity';
import { AccessGroupEmployee } from '../../access-group-employees/entity/access-group-employee.entity';

@Entity('access_organizations')
@Index('IDX_access_organizations_company_id', ['companyId'])
@Index('IDX_access_organizations_branch_id', ['branchId'])
@Index('IDX_access_organizations_department_id', ['departmentId'])
@Index('IDX_access_organizations_parent_id', ['parentId'])
@Index('IDX_access_organizations_org_index', ['hikvisionOrgIndex'])
@Index('IDX_access_organizations_group_no', ['hikvisionGroupNo'])
@Unique('UQ_access_organizations_company_org_name', ['companyId', 'orgName'])
export class AccessOrganization {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({ name: 'parent_id', type: 'int', nullable: true })
  parentId: number | null;

  @Column({ name: 'hikvision_org_index', type: 'varchar', length: 50, nullable: true })
  hikvisionOrgIndex: string | null;

  @Column({ name: 'hikvision_group_no', type: 'varchar', length: 50, nullable: true })
  hikvisionGroupNo: string | null;

  @Column({ name: 'name', type: 'varchar', length: 150, nullable: true })
  name: string | null;

  @Column({ name: 'org_name', type: 'varchar', length: 150 })
  orgName: string;

  @Column({ name: 'org_code', type: 'varchar', length: 100, nullable: true })
  orgCode: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'source',
    type: 'enum',
    enum: AccessOrganizationSourceEnum,
    default: AccessOrganizationSourceEnum.MANUAL,
  })
  source: AccessOrganizationSourceEnum;

  @Column({
    name: 'sync_status',
    type: 'enum',
    enum: AccessOrganizationSyncStatusEnum,
    default: AccessOrganizationSyncStatusEnum.PENDING,
  })
  syncStatus: AccessOrganizationSyncStatusEnum;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

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

  @ManyToOne(() => AccessOrganization, (organization) => organization.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: AccessOrganization | null;

  @OneToMany(() => AccessOrganization, (organization) => organization.parent)
  children: AccessOrganization[];

  @OneToMany(() => AccessOrganizationEmployee, (organizationEmployee) => organizationEmployee.organization)
  organizationEmployees: AccessOrganizationEmployee[];

  @OneToMany(() => AccessGroup, (group) => group.organization)
  accessGroups: AccessGroup[];

  @OneToMany(() => EmployeeDeviceAssignment, (assignment) => assignment.organization)
  employeeDeviceAssignments: EmployeeDeviceAssignment[];

  @OneToMany(() => AccessGroupEmployee, (groupEmployee) => groupEmployee.organization)
  groupEmployees: AccessGroupEmployee[];
}

