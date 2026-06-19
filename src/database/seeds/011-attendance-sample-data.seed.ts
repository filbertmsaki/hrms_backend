import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

export default class AttendanceSampleDataSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void dataSource;
    void factoryManager;

    console.info(
      '[Seeder][AttendanceSampleData] Skipped legacy attendance sample data. Final canonical attendance seed data should be reintroduced against policies, shifts, timetables, assignments, and manual overrides only.',
    );
  }
}
