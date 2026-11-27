import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('employee_letter_events')
@Index('IDX_employee_letter_events_letter', ['letter_id', 'created_at'])
export class EmployeeLetterEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  letter_id: number;

  @Column({ type: 'varchar', length: 30 })
  action: string;

  @Column({ type: 'int', nullable: true })
  actor_company_user_id: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
