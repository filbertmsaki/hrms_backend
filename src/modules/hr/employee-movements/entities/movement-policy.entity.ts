import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('employee_movement_policies')
export class MovementPolicy {
  @PrimaryColumn({ type: 'integer' })
  company_id: number;

  @Column()
  require_management_approval: boolean;

  @Column()
  allow_backdating: boolean;

  @Column({ type: 'integer' })
  max_backdate_days: number;
}
