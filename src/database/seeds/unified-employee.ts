import { EntityManager } from 'typeorm';
import { EmployeeNumberSequence } from '../../modules/hr/employees/entities/employee-number-sequence.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';

export interface EmployeeNumberOptions {
  prefix: string;
  padding: number;
  nextNumber: number;
}

/** Insert only, never reset an existing company's sequence. */
export async function seedEmployeeNumbering(
  manager: EntityManager,
  companyId: number,
  options: EmployeeNumberOptions,
): Promise<void> {
  const prefix = options.prefix.trim().toUpperCase();
  if (
    prefix.length > 20 ||
    !Number.isInteger(options.padding) ||
    options.padding < 1 ||
    options.padding > 20 ||
    !Number.isSafeInteger(options.nextNumber) ||
    options.nextNumber < 1 ||
    options.nextNumber > 2147483647
  )
    throw new Error('Invalid employee numbering configuration.');
  const sequences = manager.getRepository(EmployeeNumberSequence);
  if (await sequences.existsBy({ company_id: companyId })) return;
  if (
    await manager.getRepository(Employee).existsBy({ company_id: companyId })
  ) {
    throw new Error(
      'Employee numbering needs manual reconciliation for a company with existing employees and no sequence.',
    );
  }
  await sequences
    .createQueryBuilder()
    .insert()
    .into(EmployeeNumberSequence)
    .values({
      company_id: companyId,
      prefix,
      padding: options.padding,
      next_number: options.nextNumber,
      updated_by_company_user_id: null,
    })
    .orIgnore()
    .execute();
}
