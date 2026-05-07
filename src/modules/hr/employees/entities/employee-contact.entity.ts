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
