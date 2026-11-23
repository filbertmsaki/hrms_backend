import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('sms_company_registry')
export class SmsCompanyRegistry {
  @PrimaryColumn({ name: 'company_id', type: 'int' }) companyId: number;
  @PrimaryColumn({ name: 'registry_id', type: 'int' }) registryId: number;
  @Column({ name: 'is_enabled', type: 'boolean', nullable: true })
  isEnabled: boolean | null;
  @Column({ name: 'sms_template', type: 'text', nullable: true })
  smsTemplate: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
}
