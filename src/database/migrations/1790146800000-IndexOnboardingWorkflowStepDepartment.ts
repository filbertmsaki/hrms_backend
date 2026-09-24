import { MigrationInterface, QueryRunner } from 'typeorm';

export class IndexOnboardingWorkflowStepDepartment1790146800000 implements MigrationInterface {
  name = 'IndexOnboardingWorkflowStepDepartment1790146800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_onboarding_workflow_step_department" ON "onboarding_workflow_steps" ("assigned_department_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_onboarding_workflow_step_department"`,
    );
  }
}
