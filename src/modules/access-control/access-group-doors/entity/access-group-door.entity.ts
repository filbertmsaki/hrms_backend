import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AccessDoor } from '../../access-doors/entity/access-door.entity';
import { AccessGroup } from '../../access-groups/entity/access-group.entity';

@Entity('access_group_doors')
@Index('IDX_access_group_doors_group_id', ['accessGroupId'])
@Index('IDX_access_group_doors_door_id', ['doorId'])
@Unique('UQ_access_group_doors_group_door', ['accessGroupId', 'doorId'])
export class AccessGroupDoor {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'access_group_id', type: 'int' })
  accessGroupId: number;

  @Column({ name: 'door_id', type: 'int' })
  doorId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => AccessGroup, (group) => group.doors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'access_group_id' })
  accessGroup: AccessGroup;

  @ManyToOne(() => AccessDoor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'door_id' })
  door: AccessDoor;
}
