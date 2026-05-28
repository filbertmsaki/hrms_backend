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
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { AccessDoor } from '../../access-doors/entity/access-door.entity';
import { AccessScheduleTemplate } from '../../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessGroup } from '../../access-groups/entity/access-group.entity';

@Entity('access_group_doors')
@Index('IDX_access_group_doors_group_id', ['accessGroupId'])
@Index('IDX_access_group_doors_door_id', ['doorId'])
@Index('IDX_access_group_doors_device_id', ['deviceId'])
@Index('IDX_access_group_doors_schedule_template_id', ['scheduleTemplateId'])
@Unique('UQ_access_group_doors_group_device_door_template', [
  'accessGroupId',
  'deviceId',
  'doorNo',
  'hikvisionTemplateNo',
])
export class AccessGroupDoor {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'access_group_id', type: 'int' })
  accessGroupId: number;

  @Column({ name: 'door_id', type: 'int' })
  doorId: number;

  @Column({ name: 'device_id', type: 'int' })
  deviceId: number;

  @Column({ name: 'door_no', type: 'int' })
  doorNo: number;

  @Column({ name: 'schedule_template_id', type: 'int' })
  scheduleTemplateId: number;

  @Column({ name: 'hikvision_template_no', type: 'varchar', length: 50 })
  hikvisionTemplateNo: string;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => AccessGroup, (group) => group.doors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'access_group_id' })
  accessGroup: AccessGroup;

  @ManyToOne(() => AccessDoor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'door_id' })
  door: AccessDoor;

  @ManyToOne(() => AttendanceDevice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice;

  @ManyToOne(() => AccessScheduleTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schedule_template_id' })
  scheduleTemplate: AccessScheduleTemplate;
}
