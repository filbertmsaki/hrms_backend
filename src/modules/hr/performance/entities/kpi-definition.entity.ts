import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { KpiDefinitionVersion } from './kpi-definition-version.entity';

@Entity('kpi_definitions')
@Unique('UQ_kpi_definition_company_code', ['companyId', 'code'])
export class KpiDefinition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'current_version_id', type: 'int', nullable: true })
  currentVersionId: number | null;

  @Column({
    name: 'created_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  createdByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => KpiDefinitionVersion, (version) => version.kpiDefinition)
  versions: KpiDefinitionVersion[];
}
