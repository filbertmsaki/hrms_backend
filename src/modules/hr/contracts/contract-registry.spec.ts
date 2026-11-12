import {
  CONTRACT_TOKENS,
  renderSections,
  invalidContractTokens,
  ContractTemplatesService,
} from './contract-templates.service';
import { createHash } from 'crypto';
import {
  CONTRACT_FIELD_METADATA,
  addressOverrideWarning,
  taskDescriptionError,
} from './contract-field-metadata';
import {
  EmploymentContractType,
  EmploymentContractStatus,
} from './entities/employment-contract.entity';
import { ContractSigningService } from './contract-signing.service';
import { ForbiddenException } from '@nestjs/common';
import { applyValuesToColumns } from './contract-draft-rules';
import { EmploymentContractsService } from './employment-contracts.service';
import { ContractLiveValuesService } from './contract-live-values.service';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { EmployeeGrade } from '../grades/entities/employee-grade.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Employee } from '../employees/entities/employee.entity';
import { maskAuditValues, maskParticulars } from './salary-visibility';

describe('contract field registry', () => {
  it('masks salary override values and their free-text reasons', () => {
    const masked = maskParticulars({
      field_overrides: { salary: '1234', hours_of_work: '40' },
      override_reasons: {
        salary: 'Increased to 1234',
        hours_of_work: 'Agreed',
      },
      snapshot: { override_reasons: { salary: 'Salary 1234' } },
    }) as Record<string, any>;
    expect(masked.field_overrides).toEqual({
      salary: null,
      hours_of_work: '40',
    });
    expect(masked.override_reasons).toEqual({
      salary: null,
      hours_of_work: 'Agreed',
    });
    expect(masked.snapshot.override_reasons.salary).toBeNull();
  });
  it('masks salary in nested audit values without changing non-salary fields', () => {
    expect(
      maskAuditValues({
        nested: { salary: '1234', note: 'unchanged' },
        rows: [{ remuneration: '5678' }],
        sections: [{ body: 'Salary 1234' }],
      }),
    ).toEqual({
      nested: { salary: '(hidden)', note: 'unchanged' },
      rows: [{ remuneration: '(hidden)' }],
      sections: '(hidden)',
    });
  });
  it('rejects unknown and malformed active-clause tokens without rewriting text', () => {
    const sections = [
      {
        id: 'a',
        heading: 'Terms',
        body: '{{employee_name}} {{unknown}} {{Bad-Token}} {{open',
      },
    ];
    expect(invalidContractTokens(sections)).toEqual(
      expect.arrayContaining(['unknown', 'Bad-Token', '{{…}}']),
    );
    expect(sections[0].body).toBe(
      '{{employee_name}} {{unknown}} {{Bad-Token}} {{open',
    );
    expect(invalidContractTokens([{ ...sections[0], enabled: false }])).toEqual(
      [],
    );
  });
  it('resolves original reference IDs and labels only within the employee tenant', async () => {
    const rows = new Map<unknown, any>([
      [Department, { id: 1, name: 'HR' }],
      [Position, { id: 2, name: 'Nurse' }],
      [EmployeeGrade, { id: 3, name: 'G1' }],
      [Branch, { id: 4, name: 'Main' }],
      [Employee, { id: 5, first_name: 'Amina', last_name: 'Manager' }],
    ]);
    const findOneBy = jest.fn(
      async (entity: unknown, criteria: { id: number; company_id: number }) =>
        criteria.company_id === 7 && rows.get(entity)?.id === criteria.id
          ? rows.get(entity)
          : null,
    );
    const manager = {
      getRepository: (entity: unknown) => ({
        findOneBy: (criteria: any) => findOneBy(entity, criteria),
      }),
    };
    const employee = {
      primary_department_id: 1,
      primary_position_id: 2,
      grade_id: 3,
      primary_branch_id: 4,
      reports_to: 5,
    };
    const service = new ContractLiveValuesService({} as never, {} as never);
    const result = await service.automaticReferences(
      employee as never,
      7,
      manager as never,
    );
    expect(result).toEqual({
      department_id: { id: 1, label: 'HR' },
      position_id: { id: 2, label: 'Nurse' },
      grade_id: { id: 3, label: 'G1' },
      branch_id: { id: 4, label: 'Main' },
      reports_to_id: { id: 5, label: 'Amina Manager' },
    });
    expect(
      (
        await service.automaticReferences(
          employee as never,
          8,
          manager as never,
        )
      ).department_id,
    ).toEqual({ id: null, label: null });
  });
  it('has exactly one metadata entry per renderer token', () => {
    expect(Object.keys(CONTRACT_FIELD_METADATA).sort()).toEqual(
      [...CONTRACT_TOKENS].sort(),
    );
    expect(CONTRACT_FIELD_METADATA.employee_age.overridePolicy).toBe('none');
    expect(CONTRACT_FIELD_METADATA.employee_sex.overridePolicy).toBe('none');
    expect(CONTRACT_FIELD_METADATA.probation_months.inputKind).toBe('number');
    expect(CONTRACT_FIELD_METADATA.currency.inputKind).toBe('enum');
  });
  it('renders the task token and requires a task description only for specific tasks', () => {
    expect(
      renderSections(
        [{ id: 'a', heading: 'Task', body: '{{task_description}}' }],
        { task_description: 'Build a bridge' },
      ).sections[0].body,
    ).toBe('Build a bridge');
    expect(
      taskDescriptionError(EmploymentContractType.SPECIFIC_TASK, ' '),
    ).toBeTruthy();
    expect(
      taskDescriptionError(EmploymentContractType.SPECIFIC_TASK, 'Build'),
    ).toBeNull();
    expect(
      taskDescriptionError(EmploymentContractType.UNSPECIFIED, ''),
    ).toBeNull();
  });
  it('warns only for an explicit address override matching the resolved company address', () => {
    expect(
      addressOverrideWarning(' Dar es Salaam ', 'dar es salaam'),
    ).toBeTruthy();
    expect(addressOverrideWarning('', 'Dar es Salaam')).toBeNull();
    expect(addressOverrideWarning('Other', 'Dar es Salaam')).toBeNull();
  });
});

describe('existing signing access', () => {
  it.each([
    [
      'employee',
      10,
      EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE,
      'EMPLOYEE',
    ],
    [
      'assigned signatory',
      11,
      EmploymentContractStatus.PENDING_HR_SIGNATURE,
      'COMPANY',
    ],
  ])(
    'allows the %s to view the sent contract and enter signing',
    async (_label, employeeId, status, party) => {
      const service = Object.create(ContractSigningService.prototype);
      const contract = {
        id: 1,
        companyId: 2,
        employeeId: 10,
        assignedSignatoryId: 5,
        status,
        documentId: 9,
      };
      Object.assign(service, {
        access: { ensureActorCompanyId: () => 2 },
        loadAny: async () => contract,
        dataSource: {
          getRepository: () => ({
            findOneBy: async () => ({ id: 5, employeeId: 11, isActive: true }),
          }),
        },
        settings: { backupSignatoryId: async () => null },
      });
      const actor = {
        id: 50,
        companyId: 2,
        companyMembershipId: 60,
        employeeId,
        permissions: [],
      };
      expect(await service.loadReadableForDetail(actor, 1)).toBe(contract);
      expect(await service.partyFor(actor, contract)).toBe(party);
    },
  );
});

describe('unsaved resolution', () => {
  it('applies changes in memory without saving or logging an audit event', async () => {
    const service = Object.create(EmploymentContractsService.prototype);
    const contract = { status: EmploymentContractStatus.DRAFT, title: 'old' };
    const save = jest.fn();
    const audit = jest.fn();
    Object.assign(service, {
      dataSource: { manager: { save } },
      audit,
      loadForManage: async () => ({ companyId: 1, contract, employee: {} }),
      applyDraftChanges: async (
        _manager: unknown,
        _company: unknown,
        draft: any,
        _employee: unknown,
        dto: any,
      ) => {
        draft.title = dto.title;
      },
      signing: {
        fieldsForContract: async (_actor: unknown, draft: any) => [
          { value: draft.title },
        ],
      },
    });
    await expect(
      service.resolveDraftFields({ permissions: [] }, 1, { title: 'unsaved' }),
    ).resolves.toEqual([{ value: 'unsaved' }]);
    expect(save).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('resolved field access', () => {
  it('masks salary on resolved fields and rejects a PDF preview for an actor without salary access', async () => {
    const service = Object.create(
      ContractSigningService.prototype,
    ) as ContractSigningService;
    Object.assign(service, {
      templates: {
        buildContext: async () => ({
          values: { salary: '2500000' },
          automatic: { salary: '2500000' },
          overrides: {},
          sources: {},
          warnings: {},
          liveRefs: {},
          frozen: false,
        }),
      },
    });
    const contract = {
      employeeId: 10,
      sections: [{ id: 'a', heading: 'Pay', body: '{{salary}}' }],
      particulars: {},
    } as never;
    const actor = { permissions: [], employeeId: 11 } as never;
    const fields = await service.fieldsForContract(actor, contract);
    expect(fields.find((item) => item.key === 'salary')).toMatchObject({
      automatic: '',
      value: '',
      override: null,
      hidden: true,
      has_value: true,
    });
    await expect(
      service.previewContract(actor, contract),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('compatibility', () => {
  it('renders a signed snapshot fixture with the expected content hash without looking up current HR records', async () => {
    const fail = {
      getRepository: () => {
        throw new Error('snapshot must not load HR records');
      },
    };
    const templates = new ContractTemplatesService(
      fail as never,
      fail as never,
      fail as never,
    );
    const snapshot = {
      values: { employee_name: 'Amina Contract', salary: '1500' },
      automatic: {},
      overrides: {},
      legal: {},
      company_name: 'Company',
      employee_name: 'Amina Contract',
      employee_no: '1',
      signatory_name: null,
      signatory_title: null,
    };
    const context = await templates.buildContext(
      {
        particulars: { snapshot },
        status: EmploymentContractStatus.SIGNED,
      } as never,
      fail as never,
    );
    const text = renderSections(
      [
        {
          id: 'fixture',
          heading: 'Pay',
          body: '{{employee_name}}: {{salary}}',
        },
      ],
      context.values,
    ).sections[0].body;
    expect(createHash('sha256').update(text).digest('hex')).toBe(
      '5cc002a09b45f9a8e9d385090d5c59c99bfe4aed8b62f82760e4f6bcbf68fd81',
    );
  });
  it('keeps flat columns synchronized using existing storage casing', () => {
    const contract = {} as never;
    applyValuesToColumns(contract, {
      job_title: 'Nurse',
      salary: '1500.50',
      currency: 'tzs',
      pay_frequency: 'monthly',
      probation_months: '3',
    });
    expect(contract).toMatchObject({
      jobTitle: 'Nurse',
      salaryAmount: '1500.50',
      salaryCurrency: 'TZS',
      payFrequency: 'MONTHLY',
      probationMonths: 3,
    });
  });
});
