import { BadRequestException } from '@nestjs/common';
import { renderEmploymentLetterBody } from '../contracts/employment-letters.service';
import { DEFAULT_LETTER_TEMPLATES } from './default-letter-templates';
import {
  LETTER_EXTRA_FIELDS,
  LetterTypeEnum,
  buildCatalogue,
  extractPlaceholders,
  missingPlaceholders,
  renderPlaceholders,
  unknownPlaceholders,
} from './letter-catalogue';
import { LetterPlaceholdersService } from './letter-placeholders.service';
import { assertKnownPlaceholders } from './letter-templates.service';

const context = {
  companyId: 1,
  companyName: 'Alliance Insurance Corporation Limited',
  timezone: 'Africa/Dar_es_Salaam',
  logoUrl: null,
  address: 'Dar es Salaam',
  phone: null,
  email: null,
  website: null,
};

function managerFor(entities: Record<string, unknown>) {
  return {
    getRepository: (entity: { name: string }) => ({
      findOne: jest.fn().mockResolvedValue(entities[entity.name] ?? null),
      findOneBy: jest.fn().mockResolvedValue(entities[entity.name] ?? null),
    }),
  };
}

const employee = {
  id: 7,
  company_id: 1,
  company_user_id: 70,
  employee_no: 'AIC-0042',
  first_name: 'Asha',
  middle_name: 'Juma',
  last_name: 'Mwinyi',
  preferred_name: null,
  gender: 'female',
  hire_date: '2019-03-01',
  employment_type: 'full_time',
  probation_start_date: '2019-03-01',
  probation_end_date: '2019-08-31',
  confirmation_date: null,
  primary_position: { name: 'Senior Accountant' },
  primary_department: { name: 'Finance' },
  primary_branch: { name: 'Head Office' },
  grade: null,
  manager: { first_name: 'Juma', last_name: 'Said' },
  contacts: [
    {
      is_primary: true,
      email: 'asha@example.co.tz',
      phone_number: '+255 700 000 000',
    },
  ],
  addresses: [],
  identifications: [],
  company_user: null,
};

describe('letter placeholders', () => {
  it('resolves snake_case keys for employees (the old service passed camelCase and never resolved them)', async () => {
    const template =
      '{{employee_name}} ({{employee_number}}) joined as {{position}} in {{department}} on {{hire_date}}, salary {{salary}}.';
    // The legacy renderer was fed camelCase keys, so snake_case tokens failed.
    expect(() =>
      renderEmploymentLetterBody(template, {
        employeeName: 'Asha',
        employeeNumber: 'AIC-0042',
      } as Record<string, string>),
    ).toThrow(BadRequestException);

    const service = new LetterPlaceholdersService({} as never);
    const recipient = await service.resolveRecipient(
      1,
      { kind: 'employee', id: 7 },
      context,
      managerFor({
        Employee: employee,
        EmployeeCompensationVersion: {
          baseSalary: '1250000.00',
          currency: 'TZS',
          payFrequency: 'MONTHLY',
        },
        EmploymentContract: null,
      }) as never,
      new Date('2026-11-27T08:00:00Z'),
    );
    const values = service.composeValues({
      context,
      recipient,
      extraValues: { effective_date: '2026-12-01', new_salary: '1500000' },
      signatoryName: 'Neema Kileo',
      signatoryTitle: 'Head of HR',
      issueDate: new Date('2026-11-27T08:00:00Z'),
    });
    const rendered = renderPlaceholders(template, values);
    expect(rendered).toBe(
      'Asha Juma Mwinyi (AIC-0042) joined as Senior Accountant in Finance on 1 March 2019, salary TZS 1,250,000.',
    );
    expect(values.issue_date).toBe('27 November 2026');
    expect(values.effective_date).toBe('1 December 2026');
    expect(values.new_salary).toBe('TZS 1,500,000');
    expect(values.employee_title).toBe('Ms');
    expect(values.years_of_service).toBe('7 years');
    expect(values.salary_in_words).toBe(
      'one million two hundred and fifty thousand',
    );
    expect(values.manager_name).toBe('Juma Said');
    expect(missingPlaceholders([template], values)).toEqual([]);
  });

  it('resolves candidates with offer defaults that extra values override', async () => {
    const service = new LetterPlaceholdersService({} as never);
    const recipient = await service.resolveRecipient(
      1,
      { kind: 'candidate', id: 3 },
      context,
      managerFor({
        RecruitmentCandidate: {
          id: 3,
          companyId: 1,
          requestId: 9,
          firstName: 'Baraka',
          lastName: 'Mushi',
          gender: 'MALE',
          email: 'b@example.com',
          offerSalary: '900000',
          offerStartDate: '2027-01-02',
        },
        RecruitmentRequest: { id: 9, positionId: null, jobTitle: 'Driver' },
      }) as never,
    );
    expect(recipient.employeeNo).toBeNull();
    const values = service.composeValues({
      context,
      recipient,
      extraValues: { offer_salary: '950000' },
      signatoryName: null,
      signatoryTitle: null,
      issueDate: new Date('2026-11-27T08:00:00Z'),
    });
    expect(values.position).toBe('Driver');
    expect(values.offer_start_date).toBe('2 January 2027');
    expect(values.offer_salary).toBe('TZS 950,000');
    expect(values.employee_title).toBe('Mr');
  });

  it('rejects unknown placeholders on template save with the key', () => {
    expect(unknownPlaceholders('Hi {{password}} {{employee_name}}')).toEqual([
      'password',
    ]);
    expect(() => assertKnownPlaceholders('Hello {{ bank_pin }}')).toThrow(
      'Unknown placeholder: {{bank_pin}}',
    );
    expect(() =>
      assertKnownPlaceholders('{{employee_name}} {{ position }}'),
    ).not.toThrow();
  });

  it('lists used-but-empty placeholders and required extra fields as missing', () => {
    expect(
      missingPlaceholders(
        ['{{employee_name}} {{salary}}', 'RE {{new_position}}'],
        { employee_name: 'Asha', salary: '  ' },
        LetterTypeEnum.PROMOTION,
      ),
    ).toEqual(['salary', 'new_position', 'effective_date']);
  });

  it('highlights unresolved placeholders in previews instead of failing', () => {
    expect(
      renderPlaceholders('Dear {{employee_first_name}}, {{ effective_date }}', {
        employee_first_name: 'Asha',
      }),
    ).toBe('Dear Asha, [[effective_date]]');
  });

  it('masks salary and national ID for actors without salary access', () => {
    const service = new LetterPlaceholdersService({} as never);
    const masked = service.maskConfidential({
      employee_name: 'A',
      salary: 'TZS 1',
      national_id: '123',
      salary_in_words: 'one',
    });
    expect(masked).toEqual({ employee_name: 'A' });
  });

  it('rejects letter extra keys that are not letter fields', () => {
    const service = new LetterPlaceholdersService({} as never);
    expect(() => service.sanitizeExtraValues({ employee_name: 'x' })).toThrow(
      'Unknown letter field: employee_name',
    );
    expect(
      service.sanitizeExtraValues({
        effective_date: ' 2026-12-01 ',
        custom_note: '',
      }),
    ).toEqual({
      effective_date: '2026-12-01',
    });
  });

  it('ships a known-placeholder default template for every letter type', () => {
    const types = Object.values(LetterTypeEnum);
    expect(DEFAULT_LETTER_TEMPLATES.map((t) => t.letter_type).sort()).toEqual(
      [...types].sort(),
    );
    for (const template of DEFAULT_LETTER_TEMPLATES) {
      expect(
        unknownPlaceholders(
          template.subject,
          template.salutation,
          template.body,
          template.closing,
        ),
      ).toEqual([]);
      // Defaults only rely on the type's required extras, never optional ones.
      const optional = LETTER_EXTRA_FIELDS[template.letter_type]
        .filter((f) => !f.required)
        .map((f) => f.key);
      const used = extractPlaceholders(template.subject, template.body);
      expect(used.filter((key) => optional.includes(key))).toEqual([]);
    }
    const approval = DEFAULT_LETTER_TEMPLATES.filter((t) => t.requires_approval)
      .map((t) => t.letter_type)
      .sort();
    expect(approval).toEqual(
      [
        'OFFER',
        'PROBATION_NOT_CONFIRMED',
        'PROMOTION',
        'SALARY_INCREMENT',
        'TERMINATION',
        'WARNING',
      ].sort(),
    );
  });

  it('describes letter types and placeholders in the catalogue', () => {
    const catalogue = buildCatalogue();
    expect(catalogue.letter_types).toHaveLength(15);
    const offer = catalogue.letter_types.find(
      (t) => t.type === LetterTypeEnum.OFFER,
    )!;
    expect(offer.recipient).toBe('candidate_or_employee');
    expect(offer.default_requires_approval).toBe(true);
    expect(
      catalogue.placeholders.find((p) => p.key === 'salary'),
    ).toMatchObject({
      group: 'Salary',
      confidential: true,
    });
  });
});
