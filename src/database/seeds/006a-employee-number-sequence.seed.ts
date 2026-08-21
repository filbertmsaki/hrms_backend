import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { EmployeeNumberSequence } from '../../modules/hr/employees/entities/employee-number-sequence.entity';
import { ALLIANCE_COMPANY_SLUG } from './company-structure.constants';

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value?.trim()) {
    return fallback;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default class EmployeeNumberSequenceSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const companyRepository = qr.manager.getRepository(Company);
      const sequenceRepository = qr.manager.getRepository(
        EmployeeNumberSequence,
      );

      const company = await companyRepository.findOne({
        where: { slug: ALLIANCE_COMPANY_SLUG },
      });
      if (!company) {
        throw new Error(
          `Company with slug "${ALLIANCE_COMPANY_SLUG}" was not found for employee number seeding.`,
        );
      }

      const prefix = (process.env.EMPLOYEE_NUMBER_DEFAULT_PREFIX ?? '')
        .trim()
        .toUpperCase();
      const padding = parsePositiveInteger(
        process.env.EMPLOYEE_NUMBER_DEFAULT_PADDING,
        5,
      );
      const nextNumber = parsePositiveInteger(
        process.env.EMPLOYEE_NUMBER_DEFAULT_NEXT_NUMBER,
        1,
      );

      const existingSequence = await sequenceRepository.findOne({
        where: { company_id: company.id },
      });

      if (!existingSequence) {
        const sequence = sequenceRepository.create({
          company_id: company.id,
          prefix,
          padding,
          next_number: nextNumber,
          updated_by_company_user_id: null,
        });
        await sequenceRepository.save(sequence);
      }

      await qr.commitTransaction();
      const formatPreview = prefix
        ? `${prefix}/${'0'.repeat(padding)}`
        : '0'.repeat(padding);
      console.log(
        existingSequence
          ? `[Seeder][EmployeeNumberSequence] Sequence already exists for company ${company.slug}; left unchanged`
          : `[Seeder][EmployeeNumberSequence] Created ${formatPreview} for company ${company.slug} (next=${nextNumber})`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][EmployeeNumberSequence] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
