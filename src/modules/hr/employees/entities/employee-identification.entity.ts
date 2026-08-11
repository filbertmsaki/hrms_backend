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
import { IdentificationTypeEnum } from '../enums/identification-type.enum';
import { Employee } from './employee.entity';

@Entity('employee_identifications')
@Index('IDX_employee_identification_employee', ['employee_id'])
@Index('IDX_employee_identification_type', ['identification_type'])
@Index(
  'UQ_employee_identification_employee_type_number',
  ['employee_id', 'identification_type', 'identification_number'],
  { unique: true },
)
export class EmployeeIdentification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employee_id: number;

  @Column({
    type: 'enum',
    enum: IdentificationTypeEnum,
    default: IdentificationTypeEnum.OTHER,
  })
  identification_type: IdentificationTypeEnum;

  @Column({ type: 'varchar', length: 120 })
  identification_number: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  issued_country: string | null;

  @Column({ type: 'date', nullable: true })
  expiry_date: string | null;

  @Column({ type: 'date', nullable: true })
  issue_date: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  issuing_authority: string | null;

  @Column({ type: 'text', nullable: true })
  document_url: string | null;

  @Column({ default: false })
  is_primary: boolean;

  @Column({ default: false })
  is_verified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  verified_at: Date | null;

  @Column({ type: 'int', nullable: true })
  verified_by_company_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee, (employee) => employee.identifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
