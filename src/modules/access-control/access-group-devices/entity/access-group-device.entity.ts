import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AccessGroup } from '../../access-groups/entity/access-group.entity';

@Entity('access_group_devices')
@Index('IDX_access_group_devices_group_id', ['accessGroupId'])
@Index('IDX_access_group_devices_device_id', ['deviceId'])
@Unique('UQ_access_group_devices_group_device', ['accessGroupId', 'deviceId'])
export class AccessGroupDevice {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'access_group_id', type: 'int' })
  accessGroupId: number;

  @Column({ name: 'device_id', type: 'int' })
  deviceId: number;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => AccessGroup, (group) => group.devices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'access_group_id' })
  accessGroup: AccessGroup;

  @ManyToOne(() => AttendanceDevice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice;
}
