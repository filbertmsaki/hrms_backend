import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('company_banks')
@Index('UQ_company_banks_company_name', ['company_id', 'name'], {
  unique: true,
})
export class CompanyBank {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logo_url: string | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
