import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { AccessOrganization } from '../../access-organizations/entity/access-organization.entity';

@Entity('organization_employees')
@Index('IDX_organization_employees_organization_id', ['organizationId'])
@Index('IDX_organization_employees_employee_id', ['employeeId'])
@Unique('UQ_organization_employees_organization_employee', [
  'organizationId',
  'employeeId',
])
@Unique('UQ_organization_employees_employee', ['employeeId'])
export class AccessOrganizationEmployee {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'organization_id', type: 'int' })
  organizationId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'employee_no', type: 'varchar', length: 100 })
  employeeNo: string;

  @Column({
    name: 'employee_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  employeeName: string | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(
    () => AccessOrganization,
    (organization) => organization.organizationEmployees,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'organization_id' })
  organization: AccessOrganization;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
