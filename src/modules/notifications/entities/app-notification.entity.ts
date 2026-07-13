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
import { Company } from '../../companies/entities/company.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { NotificationStatusEnum } from '../enums/notification-status.enum';
import { NotificationTypeEnum } from '../enums/notification-type.enum';

@Entity('notifications')
@Index('IDX_notifications_company_receiver', [
  'company_id',
  'receiver_company_user_id',
])
@Index('IDX_notifications_status', ['status'])
@Index('IDX_notifications_type', ['type'])
@Index('IDX_notifications_entity', ['entity_type', 'entity_id'])
export class AppNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'int', nullable: true })
  sender_company_user_id: number | null;

  @Column()
  receiver_company_user_id: number;

  @Column({
    type: 'varchar',
    length: 80,
    default: NotificationTypeEnum.GENERAL,
  })
  type: NotificationTypeEnum;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entity_type: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entity_id: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  action_url: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationStatusEnum.UNREAD,
  })
  status: NotificationStatusEnum;

  @Column({ type: 'timestamp', nullable: true })
  read_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_company_user_id' })
  sender_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receiver_company_user_id' })
  receiver_company_user: CompanyUser;
}
