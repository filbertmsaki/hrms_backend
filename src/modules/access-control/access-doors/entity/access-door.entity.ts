import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AccessDoorSourceEnum } from '../enum/access-door-source.enum';
import { AccessDoorSyncStatusEnum } from '../enum/access-door-sync-status.enum';

@Entity('access_doors')
@Index('IDX_access_doors_company_id', ['companyId'])
@Index('IDX_access_doors_branch_id', ['branchId'])
@Index('IDX_access_doors_device_id', ['deviceId'])
@Index('IDX_access_doors_sync_status', ['syncStatus'])
@Unique('UQ_access_doors_device_door', ['deviceId', 'doorNo'])
export class AccessDoor {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({ name: 'door_no', type: 'int' })
  doorNo: number;

  @Column({ name: 'door_name', type: 'varchar', length: 150 })
  doorName: string;

  @Column({ name: 'door_code', type: 'varchar', length: 100, nullable: true })
  doorCode: string | null;

  @Column({ name: 'relay_no', type: 'int', nullable: true })
  relayNo: number | null;

  @Column({ name: 'lock_type', type: 'varchar', length: 100, nullable: true })
  lockType: string | null;

  @Column({ name: 'door_status', type: 'varchar', length: 50, nullable: true })
  doorStatus: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    name: 'source',
    type: 'enum',
    enum: AccessDoorSourceEnum,
    default: AccessDoorSourceEnum.MANUAL,
  })
  source: AccessDoorSourceEnum;

  @Column({
    name: 'magnetic_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  magneticType: string | null;

  @Column({
    name: 'open_button_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  openButtonType: string | null;

  @Column({ name: 'open_duration', type: 'int', nullable: true })
  openDuration: number | null;

  @Column({ name: 'disabled_open_duration', type: 'int', nullable: true })
  disabledOpenDuration: number | null;

  @Column({ name: 'magnetic_alarm_timeout', type: 'int', nullable: true })
  magneticAlarmTimeout: number | null;

  @Column({ name: 'enable_leader_card', type: 'boolean', nullable: true })
  enableLeaderCard: boolean | null;

  @Column({
    name: 'leader_card_mode',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  leaderCardMode: string | null;

  @Column({ name: 'leader_card_open_duration', type: 'int', nullable: true })
  leaderCardOpenDuration: number | null;

  @Column({ name: 'remote_control_pw_status', type: 'boolean', nullable: true })
  remoteControlPwStatus: boolean | null;

  @Column({
    name: 'sync_status',
    type: 'enum',
    enum: AccessDoorSyncStatusEnum,
    default: AccessDoorSyncStatusEnum.PENDING,
  })
  syncStatus: AccessDoorSyncStatusEnum;

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
}
