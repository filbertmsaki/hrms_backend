import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
@Entity('performance_kpi_categories')
@Unique('UQ_performance_kpi_category_company_label', ['companyId', 'name'])
@Unique('UQ_performance_kpi_category_company_name', [
  'companyId',
  'normalizedName',
])
export class KpiCategory {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ type: 'varchar', length: 80 }) name: string;
  @Column({ name: 'normalized_name', type: 'varchar', length: 80 })
  normalizedName: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) description:
    | string
    | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
