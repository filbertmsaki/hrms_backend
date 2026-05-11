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
import { AddressTypeEnum } from '../enums/address-type.enum';
import { Employee } from './employee.entity';

@Entity('employee_addresses')
@Index('IDX_employee_address_employee', ['employee_id'])
@Index('IDX_employee_address_type', ['address_type'])
export class EmployeeAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employee_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address_line_1: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address_line_2: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  postal_code: string | null;

  @Column({
    type: 'enum',
    enum: AddressTypeEnum,
    default: AddressTypeEnum.HOME,
  })
  address_type: AddressTypeEnum;

  @Column({ default: false })
  is_primary: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee, (employee) => employee.addresses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
