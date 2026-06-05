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
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AccessGroupDoor } from '../../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../../access-group-employees/entity/access-group-employee.entity';
import { AccessGroupSourceEnum } from '../enum/access-group-source.enum';
import { AccessGroupStatusEnum } from '../enum/access-group-status.enum';

@Entity('access_groups')
@Index('IDX_access_groups_company_id', ['companyId'])
@Index('IDX_access_groups_branch_id', ['branchId'])
@Index('IDX_access_groups_device_id', ['deviceId'])
@Index('IDX_access_groups_grouping_key', ['groupingKey'])
export class AccessGroup {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({ name: 'group_name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'group_code', type: 'varchar', length: 100, nullable: true })
  groupCode: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AccessGroupStatusEnum,
    default: AccessGroupStatusEnum.ACTIVE,
  })
  status: AccessGroupStatusEnum;

  @Column({
    name: 'source',
    type: 'enum',
    enum: AccessGroupSourceEnum,
    default: AccessGroupSourceEnum.BACKEND,
  })
  source: AccessGroupSourceEnum;

  @Column({ name: 'grouping_key', type: 'varchar', length: 255, nullable: true })
  groupingKey: string | null;

  @Column({ name: 'is_virtual', type: 'boolean', default: true })
  isVirtual: boolean;

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

  @ManyToOne(() => AttendanceDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;

  @OneToMany(() => AccessGroupDoor, (groupDoor) => groupDoor.accessGroup)
  doors: AccessGroupDoor[];

  @OneToMany(() => AccessGroupEmployee, (groupEmployee) => groupEmployee.accessGroup)
  employees: AccessGroupEmployee[];
}

