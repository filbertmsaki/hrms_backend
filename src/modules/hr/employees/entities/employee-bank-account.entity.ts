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
import { Employee } from './employee.entity';

@Entity('employee_bank_accounts')
@Index('IDX_employee_bank_account_employee', ['employee_id'])
export class EmployeeBankAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employee_id: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  bank_name: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  account_name: string | null;

  @Column({ type: 'varchar', length: 100 })
  account_number: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  branch_name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  swift_code: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mobile_money_provider: string | null;

  @Column({ default: false })
  is_primary: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee, (employee) => employee.bank_accounts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
