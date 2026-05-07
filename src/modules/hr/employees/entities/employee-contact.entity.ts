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
import { ContactTypeEnum } from '../enums/contact-type.enum';
import { Employee } from './employee.entity';

@Entity('employee_contacts')
@Index('IDX_employee_contact_employee', ['employee_id'])
@Index('IDX_employee_contact_type', ['contact_type'])
@Index(
  'UQ_employee_contact_primary_per_type',
  ['employee_id', 'primary_contact_type_key'],
  { unique: true },
)
export class EmployeeContact {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employee_id: number;

  @Column({
    type: 'enum',
    enum: ContactTypeEnum,
    default: ContactTypeEnum.PERSONAL,
  })
  contact_type: ContactTypeEnum;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone_number: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ default: false })
  is_primary: boolean;

  @Column({ default: false })
  is_verified: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    asExpression:
      "CASE WHEN `is_primary` = 1 THEN `contact_type` ELSE NULL END",
    generatedType: 'STORED',
    insert: false,
    update: false,
    select: false,
  })
  primary_contact_type_key: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee, (employee) => employee.contacts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
