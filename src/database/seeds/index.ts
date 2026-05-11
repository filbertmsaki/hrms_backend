import { DataSource } from 'typeorm';
import { runSeeders } from 'typeorm-extension';
import InitialRbacSeeder from './001-initial-rbac.seed';
import AllianceCompanyStructureSeeder from './002-alliance-company-structure.seed';
// import CountriesSeeder from './002-countries.seed';
// import CategoriesSeeder from './003-categories.seed';
// ... import other seeders here

const seeders = [
  InitialRbacSeeder,
  AllianceCompanyStructureSeeder,
  // CountriesSeeder,
  // CategoriesSeeder,
  // Add new seeders here ↑
  // They will run in this exact order
];

export async function runAllSeeders(dataSource: DataSource): Promise<void> {
  console.log('┌────────────────────────────────────────────┐');
  console.log('│          Starting database seeding         │');
  console.log('└────────────────────────────────────────────┘');

  try {
    await runSeeders(dataSource, {
      seeds: seeders,
    });

    console.log('\n┌────────────────────────────────────────────┐');
    console.log('│     ✓ Database seeding completed successfully     │');
    console.log('└────────────────────────────────────────────┘');
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}