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
import { AttendanceCheckpointStatusEnum } from '../enums/attendance-checkpoint-status.enum';
import { AttendanceCheckpointTypeEnum } from '../enums/attendance-checkpoint-type.enum';
import { AttendanceDevice } from '../../devices/entities/attendance-device.entity';
import { AttendancePolicy } from '../../policies/entities/attendance-policy.entity';

@Entity('attendance_checkpoints')
@Index('IDX_attendance_checkpoints_policy_set_id', ['policySetId'])
@Index('IDX_attendance_checkpoints_type', ['type'])
@Index('IDX_attendance_checkpoints_status', ['status'])
@Index('IDX_attendance_checkpoints_device_id', ['deviceId'])
@Index('IDX_attendance_checkpoints_geofence_id', ['geofenceId'])
@Index('IDX_attendance_checkpoints_policy_type', ['policySetId', 'type'])
@Index('UQ_attendance_checkpoints_policy_name', ['policySetId', 'name'], { unique: true })
export class AttendanceCheckpoint {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'policy_set_id', type: 'int' })
  policySetId: number;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({
    name: 'type',
    type: 'enum',
    enum: AttendanceCheckpointTypeEnum,
  })
  type: AttendanceCheckpointTypeEnum;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({ name: 'geofence_id', type: 'int', nullable: true })
  geofenceId: number | null;

  @Column({ name: 'wifi_ssid', type: 'varchar', length: 255, nullable: true })
  wifiSsid: string | null;

  @Column({ name: 'is_required', type: 'boolean', default: true })
  isRequired: boolean;

  @Column({ name: 'allow_override', type: 'boolean', default: false })
  allowOverride: boolean;

  @Column({ name: 'max_distance_meters', type: 'int', nullable: true })
  maxDistanceMeters: number | null;

  @Column({ name: 'strict_mode', type: 'boolean', default: false })
  strictMode: boolean;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceCheckpointStatusEnum,
    default: AttendanceCheckpointStatusEnum.ACTIVE,
  })
  status: AttendanceCheckpointStatusEnum;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => AttendancePolicy, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'policy_set_id' })
  policySet: AttendancePolicy;

  @ManyToOne(() => AttendanceDevice, (device) => device.checkpoints, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;
}




