import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { OffboardingRecordStatusEnum } from '../enums/offboarding-record-status.enum';
import { OffboardingRequest } from './offboarding-request.entity';
import { OffboardingWorkflowStep } from './offboarding-workflow-step.entity';

@Entity('offboarding_workflows')
@Index('IDX_offboarding_workflow_company', ['company_id'])
@Index('IDX_offboarding_workflow_status', ['status'])
export class OffboardingWorkflow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: false })
  is_default: boolean;

  @Column({
    type: 'enum',
    enum: OffboardingRecordStatusEnum,
    default: OffboardingRecordStatusEnum.ACTIVE,
  })
  status: OffboardingRecordStatusEnum;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  created_by_company_user: CompanyUser | null;

  @OneToMany(() => OffboardingWorkflowStep, (step) => step.workflow, {
    cascade: true,
  })
  steps: OffboardingWorkflowStep[];

  @OneToMany(() => OffboardingRequest, (request) => request.workflow)
  offboarding_requests: OffboardingRequest[];
}
