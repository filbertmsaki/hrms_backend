import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type LetterTemplateSnapshot = {
  name: string;
  subject: string;
  salutation: string;
  body: string;
  closing: string;
  signatory_id: number | null;
  signatory_name: string | null;
  signatory_title: string | null;
  requires_approval: boolean;
  include_acknowledgement: boolean;
};

@Entity('letter_template_versions')
@Unique('UQ_letter_template_versions', ['template_id', 'version'])
export class LetterTemplateVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  template_id: number;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'jsonb' })
  snapshot: LetterTemplateSnapshot;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
