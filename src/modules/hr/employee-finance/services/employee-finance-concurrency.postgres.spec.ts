import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntitySchema } from 'typeorm';
import { AddFinanceApplicationNumberSequence1791900000000 } from '../../../../database/migrations/1791900000000-AddFinanceApplicationNumberSequence';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { EmployeeFinanceApplication } from '../entities/employee-finance-application.entities';
import { EmployeeFinanceAuditLog } from '../entities/employee-finance-account.entities';
import { EmployeeFinanceProduct } from '../entities/employee-finance-product.entities';
import {
  EmployeeFinanceApplicationStatusEnum,
  EmployeeFinanceProductTypeEnum,
} from '../employee-finance.enums';
import {
  EmployeeFinanceApplicationService,
  EmployeeFinanceAuditService,
} from './employee-finance-core.services';

// The suite creates/drops only its own unique schema, never an existing application's schema.
const databaseUrl = process.env.HRMS_FINANCE_CONCURRENCY_DATABASE_URL;
const postgresSuite = databaseUrl ? describe : describe.skip;
postgresSuite('finance creation concurrency (real PostgreSQL)', () => {
  const schema = `hrms_finance_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource;
  let service: EmployeeFinanceApplicationService;
  let audit: EmployeeFinanceAuditService;
  const actor = (employeeId: number): AuthenticatedUser => ({
    id: employeeId,
    companyId: 10,
    companyMembershipId: employeeId,
    employeeId,
    scope: 'company',
    userType: 'COMPANY_USER',
    email: `${employeeId}@example.test`,
    roles: [],
    permissions: [],
  });
  const input = {
    product_id: 1,
    requested_amount: '100.00',
    requested_term_months: 6,
    purpose: 'Travel',
  };

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!url.pathname.endsWith('_e2e') && !url.pathname.endsWith('_test_db')) {
      throw new Error(
        'Concurrency verification requires a dedicated test database.',
      );
    }
    const EmployeeFixture = new EntitySchema<Employee>({
      name: 'Employee',
      target: Employee,
      tableName: 'employees',
      schema,
      columns: {
        id: { type: Number, primary: true },
        company_id: { type: Number },
        employee_no: { type: String },
        first_name: { type: String },
        middle_name: { type: String, nullable: true },
        last_name: { type: String },
        grade_id: { type: Number, nullable: true },
        hire_date: { type: 'date' },
        employment_status: { type: String },
      },
    });
    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      entities: [
        EmployeeFixture,
        EmployeeFinanceApplication,
        EmployeeFinanceAuditLog,
      ],
      synchronize: false,
      logging: false,
      extra: { max: 20, options: `-c search_path=${schema},public` },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    await dataSource.synchronize();
    const applications = dataSource.getRepository(EmployeeFinanceApplication);
    await applications.save(
      applications.create({
        companyId: 10,
        employeeId: 99,
        productId: 1,
        applicationNo: 'EFAPP-10-000123',
        productType: EmployeeFinanceProductTypeEnum.STAFF_LOAN,
        requestedAmount: '100.00',
        requestedTermMonths: 6,
        purpose: 'Legacy',
        eligibilitySnapshot: {},
        eligibilitySnapshotHash: 'legacy',
        productSnapshot: {},
        productSnapshotHash: 'legacy',
        employeeSnapshot: {},
        createdByCompanyUserId: 99,
      }),
    );
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await new AddFinanceApplicationNumberSequence1791900000000().up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    const access = {
      ensureActorCompanyId: (user: AuthenticatedUser) => user.companyId,
      assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
    };
    audit = new EmployeeFinanceAuditService(
      access as any,
      dataSource.getRepository(EmployeeFinanceAuditLog),
    );
    const product = {
      id: 1,
      companyId: 10,
      productType: EmployeeFinanceProductTypeEnum.STAFF_LOAN,
      eligibilityConfiguration: {},
      requiredDocumentTypes: [],
    } as unknown as EmployeeFinanceProduct;
    const productService = {
      getActive: jest.fn(async (_companyId, _id, manager) => {
        expect(manager.queryRunner.isTransactionActive).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return product;
      }),
    };
    const eligibilityService = {
      evaluateEligibility: jest.fn(
        async (_company, _employee, _product, _amount, _term, manager) => {
          expect(manager.queryRunner.isTransactionActive).toBe(true);
          return { eligible: true, snapshotHash: 'verified' };
        },
      ),
    };
    service = new EmployeeFinanceApplicationService(
      { get: (_key: string, fallback: unknown) => fallback } as ConfigService,
      access as any,
      productService as any,
      eligibilityService as any,
      {} as any,
      audit,
      dataSource.getRepository(Employee),
      applications,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource,
    );
  }, 30_000);

  beforeEach(async () => {
    jest.restoreAllMocks();
    await dataSource.getRepository(EmployeeFinanceApplication).clear();
    await dataSource.getRepository(EmployeeFinanceAuditLog).clear();
    await dataSource.getRepository(Employee).clear();
    const employees = dataSource.getRepository(Employee);
    await employees.save(
      Array.from({ length: 16 }, (_, index) =>
        employees.create({
          id: index + 1,
          company_id: 10,
          employee_no: `EMP-${index + 1}`,
          first_name: 'Test',
          last_name: String(index + 1),
          hire_date: '2020-01-01',
          employment_status: EmploymentStatusEnum.ACTIVE,
        }),
      ),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.destroy();
    }
  });

  it('allows exactly one competing create at an active cap of one', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () => service.createMine(actor(1), input)),
    );
    const successes = results.filter((result) => result.status === 'fulfilled');
    expect(successes).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected')
        expect(result.reason).toBeInstanceOf(ConflictException);
    }
    expect(
      await dataSource.getRepository(EmployeeFinanceApplication).count(),
    ).toBe(1);
    expect(
      await dataSource.getRepository(EmployeeFinanceAuditLog).count(),
    ).toBe(1);
    const saved = await dataSource
      .getRepository(EmployeeFinanceApplication)
      .findOneByOrFail({ employeeId: 1 });
    expect(BigInt(saved.applicationNo.split('-').at(-1)!)).toBeGreaterThan(
      123n,
    );
  });

  it('allocates unique numbers for concurrent employees in the same company', async () => {
    const applications = await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        service.createMine(actor(index + 1), input),
      ),
    );
    expect(
      new Set(applications.map((application) => application.applicationNo))
        .size,
    ).toBe(16);
    expect(
      await dataSource.getRepository(EmployeeFinanceAuditLog).count(),
    ).toBe(16);
  });

  it('never reuses a deleted application number', async () => {
    const first = await service.createMine(actor(1), input);
    await dataSource.getRepository(EmployeeFinanceApplication).delete(first.id);
    const next = await service.createMine(actor(1), input);
    expect(BigInt(next.applicationNo.split('-').at(-1)!)).toBeGreaterThan(
      BigInt(first.applicationNo.split('-').at(-1)!),
    );
  });

  it('rolls back application/audit writes together while leaving a safe sequence gap', async () => {
    const baseline = await dataSource.query(
      'SELECT last_value::text FROM employee_finance_application_number_seq',
    );
    jest
      .spyOn(audit, 'log')
      .mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(service.createMine(actor(1), input)).rejects.toThrow(
      'Audit unavailable',
    );
    expect(
      await dataSource.getRepository(EmployeeFinanceApplication).count(),
    ).toBe(0);
    expect(
      await dataSource.getRepository(EmployeeFinanceAuditLog).count(),
    ).toBe(0);
    const next = await service.createMine(actor(1), input);
    expect(BigInt(next.applicationNo.split('-').at(-1)!)).toBe(
      BigInt(baseline[0].last_value) + 2n,
    );
  });

  it('counts returned-for-correction drafts against the active cap', async () => {
    const first = await service.createMine(actor(1), input);
    await dataSource
      .getRepository(EmployeeFinanceApplication)
      .update(first.id, {
        status: EmployeeFinanceApplicationStatusEnum.RETURNED_FOR_CORRECTION,
      });
    await expect(service.createMine(actor(1), input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
