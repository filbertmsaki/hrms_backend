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
import { ProfileChangeRequestFilePurposeEnum } from '../enums/profile-change-request-file-purpose.enum';
import { ProfileChangeRequestFileStatusEnum } from '../enums/profile-change-request-file-status.enum';
import { ProfileChangeRequest } from './profile-change-request.entity';

@Entity('profile_change_request_files')
@Index('IDX_profile_change_request_files_request', ['request_id'])
export class ProfileChangeRequestFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  request_id: number;

  @Column({
    type: 'enum',
    enum: ProfileChangeRequestFilePurposeEnum,
  })
  file_purpose: ProfileChangeRequestFilePurposeEnum;

  @Column({
    type: 'enum',
    enum: ProfileChangeRequestFileStatusEnum,
    default: ProfileChangeRequestFileStatusEnum.PENDING,
  })
  status: ProfileChangeRequestFileStatusEnum;

  @Column({ type: 'varchar', length: 30, default: 'private' })
  storage_visibility: string;

  @Column({ type: 'text' })
  file_path: string;

  @Column({ type: 'varchar', length: 255 })
  original_file_name: string;

  @Column({ type: 'varchar', length: 255 })
  stored_file_name: string;

  @Column({ type: 'varchar', length: 20 })
  file_extension: string;

  @Column({ type: 'varchar', length: 100 })
  mime_type: string;

  @Column({ type: 'int' })
  file_size: number;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'int', nullable: true })
  uploaded_by_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => ProfileChangeRequest, (request) => request.files, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'request_id' })
  request: ProfileChangeRequest;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User | null;
}
