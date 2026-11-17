import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { LeaveStatutoryRule } from '../../modules/hr/leave/entities/leave-statutory-rule.entity';
import { LeaveStatutoryRuleSet } from '../../modules/hr/leave/entities/leave-statutory-rule-set.entity';
import { LeaveType } from '../../modules/hr/leave/entities/leave-type.entity';

/**
 * Draft statutory leave templates for Tanzania. They are created as DRAFT and
 * UNVERIFIED: values are candidates taken from the Employment and Labour
 * Relations Act, 2004 (Mainland) as commonly published, and must be checked
 * against the current Act, amendments and regulations by HR/legal, who then
 * record the verification and activate the set in the HRMS.
 *
 * Zanzibar is created as an empty draft with its legal authority only: no
 * values are entered until they have been verified.
 *
 * With LEAVE_STATUTORY_TEST_ACTIVATE=true (never in production) a clearly
 * labelled TEST copy of the Mainland template is also activated so the
 * statutory engine can be exercised end to end in development/test.
 */
const MAINLAND_REFERENCE =
  'Employment and Labour Relations Act, 2004 (Cap. 366 R.E. 2019), Part III Sub-Part E (Leave) — TO VERIFY';

type RuleSeed = {
  rule_type: LeaveStatutoryRule['rule_type'];
  leave_type_code: string | null;
  settings: Record<string, unknown>;
  legal_reference: string;
};

const MAINLAND_RULES: RuleSeed[] = [
  {
    rule_type: 'annual_leave',
    leave_type_code: 'ANNUAL',
    settings: {
      minimum_days_per_cycle: 28,
      cycle_months: 12,
      eligibility_months: 6,
      protected_unused_days: 0,
    },
    legal_reference: 'ELRA 2004 s.31 (annual leave) — TO VERIFY',
  },
  {
    rule_type: 'sick_leave',
    leave_type_code: 'SICK',
    settings: {
      reference_period_months: 36,
      stages: [
        { days: 63, pay_percent: 100 },
        { days: 63, pay_percent: 50 },
      ],
      certificate_required_after_days: 0,
      eligibility_months: 6,
    },
    legal_reference: 'ELRA 2004 s.32 (sick leave) — TO VERIFY',
  },
  {
    rule_type: 'maternity_leave',
    leave_type_code: 'MATERNITY',
    settings: {
      standard_days: 84,
      multiple_birth_days: 100,
      pay_percent: 100,
      eligibility_months: 6,
      max_occurrences: 4,
      period_months: 600,
    },
    legal_reference: 'ELRA 2004 s.33 (maternity leave) — TO VERIFY',
  },
  {
    rule_type: 'paternity_leave',
    leave_type_code: 'PATERNITY',
    settings: {
      days: 3,
      within_days_of_birth: 7,
      pay_percent: 100,
      eligibility_months: 6,
    },
    legal_reference: 'ELRA 2004 s.34 (paternity leave) — TO VERIFY',
  },
];

export default class LeaveStatutoryTemplatesSeeder implements Seeder {
  async run(dataSource: DataSource): Promise<void> {
    const production = [process.env.APP_ENV, process.env.NODE_ENV].some(
      (value) => value?.trim().toLowerCase() === 'production',
    );
    const activateTest =
      process.env.LEAVE_STATUTORY_TEST_ACTIVATE === 'true' && !production;
    const companies = await dataSource.getRepository(Company).find({
      select: ['id'],
    });
    const setRepository = dataSource.getRepository(LeaveStatutoryRuleSet);
    const ruleRepository = dataSource.getRepository(LeaveStatutoryRule);
    for (const company of companies) {
      const types = new Map(
        (
          await dataSource.getRepository(LeaveType).find({
            where: { company_id: company.id },
            select: ['id', 'code'],
          })
        ).map((type) => [type.code.toUpperCase(), type.id]),
      );
      const ensure = async (
        jurisdiction: string,
        name: string,
        authority: string,
        rules: RuleSeed[],
        options: { test: boolean },
      ) => {
        const existing = await setRepository.findOne({
          where: {
            company_id: company.id,
            jurisdiction_code: jurisdiction,
            name,
          },
        });
        if (existing) return existing;
        const { max } = (await setRepository
          .createQueryBuilder('set')
          .select('MAX(set.version_no)', 'max')
          .where('set.company_id = :companyId', { companyId: company.id })
          .andWhere('set.jurisdiction_code = :jurisdiction', { jurisdiction })
          .getRawOne<{ max: string | number | null }>()) ?? { max: null };
        const set = await setRepository.save(
          setRepository.create({
            company_id: company.id,
            jurisdiction_code: jurisdiction,
            name,
            version_no: Number(max ?? 0) + 1,
            status: options.test ? 'active' : 'draft',
            effective_from: options.test ? '2000-01-01' : null,
            legal_authority: authority,
            legal_references: [
              {
                title: authority,
                citation: 'Template — verify against the current Act and amendments',
              },
            ],
            verification_status: 'unverified',
            is_test_configuration: options.test,
            change_reason: options.test
              ? 'TEST configuration for development/test environments only'
              : 'Draft template: values require legal verification before activation',
          }),
        );
        const usable = rules.filter(
          (rule) => !rule.leave_type_code || types.has(rule.leave_type_code),
        );
        await ruleRepository.save(
          usable.map((rule) =>
            ruleRepository.create({
              rule_set_id: set.id,
              rule_type: rule.rule_type,
              leave_type_id: rule.leave_type_code
                ? (types.get(rule.leave_type_code) ?? null)
                : null,
              settings: rule.settings,
              legal_reference: rule.legal_reference,
            }),
          ),
        );
        return set;
      };
      await ensure(
        'TZ-MAINLAND',
        'Tanzania Mainland statutory leave (template — verify)',
        MAINLAND_REFERENCE,
        MAINLAND_RULES,
        { test: false },
      );
      await ensure(
        'TZ-ZANZIBAR',
        'Zanzibar statutory leave (empty template — enter verified values)',
        'Employment Act, 2005 (Zanzibar) — values to be entered after legal verification',
        [],
        { test: false },
      );
      if (activateTest) {
        await ensure(
          'TZ-TEST',
          'TEST ONLY — Tanzania Mainland template values (not legal advice)',
          `${MAINLAND_REFERENCE} [TEST CONFIGURATION]`,
          MAINLAND_RULES,
          { test: true },
        );
      }
    }
  }
}
