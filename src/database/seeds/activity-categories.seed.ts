import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { provisionStandardActivityCategories } from '../../modules/hr/work-activities/constants/activity-category-catalog';

export default class ActivityCategoriesSeeder implements Seeder {
  async run(dataSource: DataSource): Promise<void> {
    const companyRepository = dataSource.getRepository(Company);
    const companies = await companyRepository.find({ select: { id: true } });
    for (const company of companies) {
      await provisionStandardActivityCategories(dataSource.manager, company.id);
    }
  }
}
