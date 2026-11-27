import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('letter_reference_sequences')
export class LetterReferenceSequence {
  @PrimaryColumn({ type: 'int' })
  company_id: number;

  @PrimaryColumn({ type: 'int' })
  year: number;

  @Column({ type: 'int', default: 1 })
  next_value: number;
}
