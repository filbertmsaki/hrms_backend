import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { OnboardingRequest } from './onboarding-request.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { User } from '../../../users/entities/user.entity';

@Entity('onboarding_workspace_notes')
@Index('IDX_onboarding_workspace_notes_request', ['request_id'])
@Unique('UQ_onboarding_workspace_note_retry', [
  'request_id',
  'author_id',
  'client_key',
])
export class OnboardingWorkspaceNote {
  @PrimaryGeneratedColumn() id: number;
  @Column() company_id: number;
  @Column() request_id: number;
  @Column({ type: 'int', nullable: true }) author_id: number | null;
  @Column({ type: 'uuid' }) client_key: string;
  @Column({ length: 180 }) requirement_id: string;
  @Column({ length: 20 }) visibility: 'internal' | 'employee';
  @Column({ type: 'text' }) body: string;
  @CreateDateColumn() created_at: Date;
  @ManyToOne(() => OnboardingRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: OnboardingRequest;
  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author: CompanyUser | null;
}

@Entity('onboarding_workspace_visits')
export class OnboardingWorkspaceVisit {
  @PrimaryColumn() request_id: number;
  @PrimaryColumn() user_id: number;
  @Column({ type: 'timestamptz' }) viewed_at: Date;
  @ManyToOne(() => OnboardingRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: OnboardingRequest;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
