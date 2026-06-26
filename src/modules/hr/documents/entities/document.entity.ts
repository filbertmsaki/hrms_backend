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
import { Company } from '../../../companies/entities/company.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { DocumentEntityTypeEnum } from '../enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../enums/document-module.enum';

@Entity('documents')
@Index('IDX_document_company', ['company_id'])
@Index('IDX_document_entity', ['entity_type', 'entity_id'])
@Index('IDX_document_module', ['module'])
export class Document {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({
    type: 'enum',
    enum: DocumentEntityTypeEnum,
  })
  entity_type: DocumentEntityTypeEnum;

  @Column()
  entity_id: number;

  @Column({
    type: 'enum',
    enum: DocumentModuleEnum,
    nullable: true,
  })
  module: DocumentModuleEnum | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  document_type: string | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  @Column({ type: 'varchar', length: 255 })
  original_file_name: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  mime_type: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  file_extension: string | null;

  @Column({ type: 'bigint', nullable: true })
  file_size: string | null;

  @Column({ type: 'text' })
  file_path: string;

  @Column({ default: false })
  is_verified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verified_at: Date | null;

  @Column({ type: 'int', nullable: true })
  verified_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  uploaded_by_company_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  expiry_date: Date | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_company_user_id' })
  uploaded_by_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by_company_user_id' })
  verified_by_company_user: CompanyUser | null;
}
