import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReportEmailDeliveryStatusEnum } from '../enums/report-email-delivery-status.enum';
import { ReportRecipientChannelEnum } from '../enums/report-recipient-channel.enum';
import { ReportRecipientTypeEnum } from '../enums/report-recipient-type.enum';
import { ReportExecution } from './report-execution.entity';

/**
 * Snapshot of the final recipient list used during one report execution. This
 * preserves who the system tried to email even if the template later changes.
 */
@Entity('report_execution_recipients')
@Index('IDX_report_execution_recipients_execution_id', ['executionId'])
@Index('IDX_report_execution_recipients_channel', ['channel'])
@Index(
  'UQ_report_execution_recipients_execution_channel_email',
  ['executionId', 'channel', 'emailAddress'],
  { unique: true },
)
export class ReportExecutionRecipient {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'execution_id', type: 'int' })
  executionId: number;

  @Column({
    name: 'channel',
    type: 'enum',
    enum: ReportRecipientChannelEnum,
    enumName: 'report_recipient_channel_enum',
  })
  channel: ReportRecipientChannelEnum;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: ReportRecipientTypeEnum,
    enumName: 'report_recipient_type_enum',
  })
  sourceType: ReportRecipientTypeEnum;

  @Column({ name: 'email_address', type: 'varchar', length: 255 })
  emailAddress: string;

  @Column({
    name: 'display_name',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  displayName: string | null;

  @Column({
    name: 'source_label',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  sourceLabel: string | null;

  @Column({
    name: 'delivery_status',
    type: 'enum',
    enum: ReportEmailDeliveryStatusEnum,
    enumName: 'report_email_delivery_status_enum',
    default: ReportEmailDeliveryStatusEnum.PENDING,
  })
  deliveryStatus: ReportEmailDeliveryStatusEnum;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(
    () => ReportExecution,
    (execution) => execution.resolvedRecipients,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'execution_id' })
  execution: ReportExecution;
}
