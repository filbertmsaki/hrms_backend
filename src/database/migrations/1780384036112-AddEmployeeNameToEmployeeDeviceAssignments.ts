import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeNameToEmployeeDeviceAssignments1780384036112
  implements MigrationInterface
{
  name = 'AddEmployeeNameToEmployeeDeviceAssignments1780384036112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasEmployeeName = await queryRunner.hasColumn(
      'employee_device_assignments',
      'employee_name',
    );

    if (!hasEmployeeName) {
      await queryRunner.query(
        'ALTER TABLE `employee_device_assignments` ADD `employee_name` varchar(200) NULL AFTER `employee_no`',
      );
    }

    await queryRunner.query(`
      UPDATE \`employee_device_assignments\` assignment
      INNER JOIN \`employees\` employee ON employee.id = assignment.employee_id
      SET assignment.employee_name = TRIM(
        CONCAT_WS(' ', employee.first_name, employee.middle_name, employee.last_name)
      )
      WHERE assignment.employee_id IS NOT NULL
        AND (assignment.employee_name IS NULL OR assignment.employee_name = '')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasEmployeeName = await queryRunner.hasColumn(
      'employee_device_assignments',
      'employee_name',
    );

    if (hasEmployeeName) {
      await queryRunner.query(
        'ALTER TABLE `employee_device_assignments` DROP COLUMN `employee_name`',
      );
    }
  }
}
