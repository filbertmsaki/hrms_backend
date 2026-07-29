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
import { User } from '../../../users/entities/user.entity';
import { ProfileChangeFieldSourceEntityEnum } from '../enums/profile-change-field-source-entity.enum';
import { ProfileChangeRequestItemStatusEnum } from '../enums/profile-change-request-item-status.enum';
import { ProfileChangeRequestItemValidationStatusEnum } from '../enums/profile-change-request-item-validation-status.enum';
import { ProfileChangeRequest } from './profile-change-request.entity';

@Entity('profile_change_request_items')
@Index('IDX_profile_change_request_items_request', ['request_id'])
@Index('IDX_profile_change_request_items_field', ['field_name'])
export class ProfileChangeRequestItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  request_id: number;

  @Column({ type: 'varchar', length: 100 })
  field_name: string;

  @Column({ type: 'varchar', length: 150 })
  field_label: string;

  @Column({
    type: 'enum',
    enum: ProfileChangeFieldSourceEntityEnum,
  })
  source_entity: ProfileChangeFieldSourceEntityEnum;

  @Column({ type: 'text', nullable: true })
  old_value: string | null;

  @Column({ type: 'text', nullable: true })
  new_value: string | null;

  @Column({ type: 'varchar', length: 50 })
  value_type: string;

  @Column({
    type: 'enum',
    enum: ProfileChangeRequestItemStatusEnum,
    default: ProfileChangeRequestItemStatusEnum.PENDING,
  })
  status: ProfileChangeRequestItemStatusEnum;

  @Column({
    type: 'enum',
    enum: ProfileChangeRequestItemValidationStatusEnum,
    default: ProfileChangeRequestItemValidationStatusEnum.PENDING,
  })
  validation_status: ProfileChangeRequestItemValidationStatusEnum;

  @Column({ type: 'json', nullable: true })
  validation_errors: Array<Record<string, unknown>> | null;

  @Column({ default: false })
  sensitive: boolean;

  @Column({ type: 'text', nullable: true })
  review_comment: string | null;

  @Column({ type: 'int', nullable: true })
  reviewed_by_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => ProfileChangeRequest, (request) => request.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'request_id' })
  request: ProfileChangeRequest;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_user_id' })
  reviewed_by_user: User | null;
}
