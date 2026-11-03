import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { SaveFormDto } from './forms-feedback.dto';
@Entity('feedback_forms')
export class FeedbackForm {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @Column({ type: 'jsonb' }) definition: SaveFormDto;
  @Column({ type: 'varchar', default: 'draft' }) status:
    | 'draft'
    | 'scheduled'
    | 'paused'
    | 'closed';
  @Column({ name: 'published_mode', type: 'varchar', nullable: true })
  publishedMode: string | null;
  @Column({ name: 'next_open_at', type: 'timestamptz', nullable: true })
  nextOpenAt: Date | null;
  @Column({ name: 'round_count', default: 0 }) roundCount: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
@Entity('feedback_rounds')
@Index(['formId', 'opensAt'], { unique: true })
export class FeedbackRound {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'form_id', type: 'uuid' }) formId: string;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ type: 'jsonb' }) definition: SaveFormDto;
  @Column({ name: 'opens_at', type: 'timestamptz' }) opensAt: Date;
  @Column({ name: 'closes_at', type: 'timestamptz' }) closesAt: Date;
}
@Entity('feedback_participation')
@Index(['roundId', 'employeeId'], { unique: true })
export class FeedbackParticipation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'round_id', type: 'uuid' }) roundId: string;
  @Column({ name: 'employee_id', type: 'int' }) employeeId: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ default: false }) submitted: boolean;
  @Column({ name: 'last_notified_at', type: 'timestamptz', nullable: true })
  lastNotifiedAt: Date | null;
}
@Entity('feedback_responses')
export class FeedbackResponse {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'round_id', type: 'uuid' }) roundId: string;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'employee_id', type: 'int', nullable: true }) employeeId:
    | number
    | null;
  @Column({ type: 'jsonb' }) answers: Record<string, unknown>;
  // Intentionally no submission timestamp or participation reference.
}
