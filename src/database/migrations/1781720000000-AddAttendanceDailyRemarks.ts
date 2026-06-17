import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceDailyRemarks1781720000000 implements MigrationInterface {
  name = 'AddAttendanceDailyRemarks1781720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add remarks column as nullable JSON
    await queryRunner.query(
      `ALTER TABLE \`attendance_daily_summaries\` ADD COLUMN \`remarks\` JSON NULL AFTER \`attendance_status\``,
    );

    // 2. Migrate MISSING_CHECKOUT → PRESENT + [MISSING_CHECK_OUT, MANUAL_REVIEW_REQUIRED]
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'PRESENT',
           \`remarks\` = JSON_ARRAY('MISSING_CHECK_OUT', 'MANUAL_REVIEW_REQUIRED')
       WHERE \`attendance_status\` = 'MISSING_CHECKOUT'`,
    );

    // 3. Migrate LATE/MISSING_CHECKOUT → LATE + [MISSING_CHECK_OUT]
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'LATE',
           \`remarks\` = JSON_ARRAY('MISSING_CHECK_OUT')
       WHERE \`attendance_status\` = 'LATE/MISSING_CHECKOUT'`,
    );

    // 4. Migrate ONTIME/MISSING_CHECKOUT → PRESENT + [MISSING_CHECK_OUT]
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'PRESENT',
           \`remarks\` = JSON_ARRAY('MISSING_CHECK_OUT')
       WHERE \`attendance_status\` = 'ONTIME/MISSING_CHECKOUT'`,
    );

    // 5. Migrate EARLY/MISSING_CHECKOUT → EARLY_DEPARTURE + [MISSING_CHECK_OUT, MANUAL_REVIEW_REQUIRED]
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'EARLY_DEPARTURE',
           \`remarks\` = JSON_ARRAY('MISSING_CHECK_OUT', 'MANUAL_REVIEW_REQUIRED')
       WHERE \`attendance_status\` = 'EARLY/MISSING_CHECKOUT'`,
    );

    // 6. Migrate INCOMPLETE → PRESENT + [MANUAL_REVIEW_REQUIRED]
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'PRESENT',
           \`remarks\` = JSON_ARRAY('MANUAL_REVIEW_REQUIRED')
       WHERE \`attendance_status\` = 'INCOMPLETE'`,
    );

    // 7. Migrate ON_LEAVE → LEAVE
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'LEAVE',
           \`remarks\` = JSON_ARRAY()
       WHERE \`attendance_status\` = 'ON_LEAVE'`,
    );

    // 8. Migrate SICK → SICK_LEAVE
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'SICK_LEAVE',
           \`remarks\` = JSON_ARRAY()
       WHERE \`attendance_status\` = 'SICK'`,
    );

    // 9. Set default empty array for all remaining records
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`remarks\` = JSON_ARRAY()
       WHERE \`remarks\` IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse status migrations best-effort (exact pre-migration state cannot be fully restored)

    // Reverse SICK_LEAVE → SICK
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'SICK'
       WHERE \`attendance_status\` = 'SICK_LEAVE'`,
    );

    // Reverse LEAVE (from ON_LEAVE migration) — cannot distinguish from original LEAVE records,
    // so we leave these as LEAVE which is still a valid status.

    // Reverse PRESENT + [MISSING_CHECK_OUT] → ONTIME/MISSING_CHECKOUT (approximate)
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'ONTIME/MISSING_CHECKOUT'
       WHERE \`attendance_status\` = 'PRESENT'
         AND JSON_CONTAINS(\`remarks\`, '"MISSING_CHECK_OUT"')
         AND NOT JSON_CONTAINS(\`remarks\`, '"MANUAL_REVIEW_REQUIRED"')`,
    );

    // Reverse PRESENT + [MISSING_CHECK_OUT, MANUAL_REVIEW_REQUIRED] → MISSING_CHECKOUT
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'MISSING_CHECKOUT'
       WHERE \`attendance_status\` = 'PRESENT'
         AND JSON_CONTAINS(\`remarks\`, '"MISSING_CHECK_OUT"')
         AND JSON_CONTAINS(\`remarks\`, '"MANUAL_REVIEW_REQUIRED"')`,
    );

    // Reverse LATE + [MISSING_CHECK_OUT] → LATE/MISSING_CHECKOUT
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'LATE/MISSING_CHECKOUT'
       WHERE \`attendance_status\` = 'LATE'
         AND JSON_CONTAINS(\`remarks\`, '"MISSING_CHECK_OUT"')`,
    );

    // Reverse EARLY_DEPARTURE + [MISSING_CHECK_OUT] → EARLY/MISSING_CHECKOUT
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'EARLY/MISSING_CHECKOUT'
       WHERE \`attendance_status\` = 'EARLY_DEPARTURE'
         AND JSON_CONTAINS(\`remarks\`, '"MISSING_CHECK_OUT"')`,
    );

    // Reverse PRESENT + [MANUAL_REVIEW_REQUIRED] → INCOMPLETE (approximate)
    await queryRunner.query(
      `UPDATE \`attendance_daily_summaries\`
       SET \`attendance_status\` = 'INCOMPLETE'
       WHERE \`attendance_status\` = 'PRESENT'
         AND JSON_CONTAINS(\`remarks\`, '"MANUAL_REVIEW_REQUIRED"')
         AND NOT JSON_CONTAINS(\`remarks\`, '"MISSING_CHECK_OUT"')`,
    );

    // Drop the remarks column
    await queryRunner.query(
      `ALTER TABLE \`attendance_daily_summaries\` DROP COLUMN \`remarks\``,
    );
  }
}
