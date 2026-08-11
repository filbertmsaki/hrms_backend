process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { hashPassword } from '../src/common/utils/hash.util';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { CompanyUserPermission } from '../src/modules/companies/entities/company-user-permission.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { EmployeeNumberSequence } from '../src/modules/hr/employees/entities/employee-number-sequence.entity';
import { Permission } from '../src/modules/permissions/entities/permission.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';

describe('Employee number sequence (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyId: number;
  let userId: number;
  let companyUserId: number;
  let createdEmployeeIds: number[] = [];
  let createdUserEmails: string[] = [];
  const password = 'EmployeeNumbers!2026';
  let email: string;

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (createdEmployeeIds.length > 0) {
      await dataSource
        .getRepository(Employee)
        .delete({ id: In(createdEmployeeIds) });
    }

    if (companyUserId) {
      await dataSource.query(
        'DELETE FROM company_user_permissions WHERE company_user_id = $1',
        [companyUserId],
      );
    }

    if (companyId) {
      await dataSource
        .getRepository(EmployeeNumberSequence)
        .delete({ company_id: companyId });
      await dataSource.query(
        'DELETE FROM company_users WHERE company_id = $1',
        [companyId],
      );
    }

    if (createdUserEmails.length > 0) {
      await dataSource.query('DELETE FROM users WHERE email = ANY($1)', [
        createdUserEmails,
      ]);
    }

    if (userId) {
      await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    }

    if (companyId) {
      await dataSource.query('DELETE FROM companies WHERE id = $1', [
        companyId,
      ]);
    }

    createdEmployeeIds = [];
    createdUserEmails = [];
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    email = `employee.numbering.${suffix}@example.com`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Employee Number Co ${suffix}`,
        slug: `e2e-employee-number-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-EN-${suffix}`.slice(0, 20),
        first_name: 'Number',
        last_name: 'Admin',
        phone: `+2554${suffix}`.slice(0, 20),
        email,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    userId = user.id;
    createdUserEmails.push(email);

    const membership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: companyId,
        user_id: userId,
        status: 'active',
        is_default: true,
      }),
    );
    companyUserId = membership.id;

    const requiredPermissionNames = [
      'employee_numbering:read',
      'employee_numbering:update',
      'employees:create',
      'employees:read',
      'data_scope:company',
    ];
    const requiredPermissions = await dataSource
      .getRepository(Permission)
      .find({
        where: requiredPermissionNames.map((name) => ({ name })),
      });

    for (const permission of requiredPermissions) {
      await dataSource.getRepository(CompanyUserPermission).save(
        dataSource.getRepository(CompanyUserPermission).create({
          company_user_id: companyUserId,
          permission_id: permission.id,
        }),
      );
    }
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);

    return response.body.access_token as string;
  }

  async function createEmployee(
    token: string,
    input: {
      firstName: string;
      lastName: string;
      emailAddress: string;
      phone: string;
    },
  ): Promise<{ id: number; employee_no: string }> {
    createdUserEmails.push(input.emailAddress);

    const response = await request(app.getHttpServer() as App)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        first_name: input.firstName,
        last_name: input.lastName,
        gender: 'female',
        contacts: [
          {
            contact_type: 'work',
            email: input.emailAddress,
            phone_number: input.phone,
            is_primary: true,
          },
        ],
        onboarding: {
          auto_start: false,
        },
      });

    if (response.status !== 201) {
      throw new Error(
        `Employee creation failed with ${response.status}: ${JSON.stringify(response.body)}`,
      );
    }

    createdEmployeeIds.push(response.body.id as number);
    return response.body as { id: number; employee_no: string };
  }

  it('generates sequential employee numbers with the configured company prefix', async () => {
    const token = await login();

    await request(app.getHttpServer() as App)
      .put('/api/employee-numbering')
      .set('Authorization', `Bearer ${token}`)
      .send({
        prefix: 'AICL',
        padding: 3,
        next_number: 1,
      })
      .expect(200);

    const firstEmployee = await createEmployee(token, {
      firstName: 'Amina',
      lastName: 'One',
      emailAddress: `amina.one.${Date.now()}@example.com`,
      phone: '+255712000001',
    });
    const secondEmployee = await createEmployee(token, {
      firstName: 'Neema',
      lastName: 'Two',
      emailAddress: `neema.two.${Date.now()}@example.com`,
      phone: '+255712000002',
    });

    expect(firstEmployee.employee_no).toBe('AICL/001');
    expect(secondEmployee.employee_no).toBe('AICL/002');

    const numberingResponse = await request(app.getHttpServer() as App)
      .get('/api/employee-numbering')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(numberingResponse.body).toEqual(
      expect.objectContaining({
        prefix: 'AICL',
        padding: 3,
        next_number: 3,
      }),
    );
  });
});
