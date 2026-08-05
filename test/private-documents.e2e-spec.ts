process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = 'hrms_test_db';

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { hashPassword } from '../src/common/utils/hash.util';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';

/**
 * Proves that an employee's own uploaded documents are private: only the
 * owning employee (over HTTP, with a real session) can read them back, a
 * different employee in the same company cannot, and an unauthenticated
 * caller cannot reach the download endpoint at all. This targets the exact
 * risk Phase 9 flags -- confidential HR documents must never be reachable
 * through public static-file serving or another employee's session.
 */
describe('Private employee documents (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyId: number;
  let userAId: number;
  let userBId: number;
  let companyUserAId: number;
  let companyUserBId: number;
  let employeeAId: number;
  let employeeBId: number;
  let uploadedDocumentId: number;
  const password = 'PrivateDocuments!2026';
  let emailA: string;
  let emailB: string;

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (uploadedDocumentId) {
      await dataSource.query('DELETE FROM documents WHERE id = $1', [
        uploadedDocumentId,
      ]);
    }
    if (employeeAId) {
      await dataSource.query('DELETE FROM employees WHERE id = $1', [
        employeeAId,
      ]);
    }
    if (employeeBId) {
      await dataSource.query('DELETE FROM employees WHERE id = $1', [
        employeeBId,
      ]);
    }
    if (companyUserAId) {
      await dataSource.query('DELETE FROM company_users WHERE id = $1', [
        companyUserAId,
      ]);
    }
    if (companyUserBId) {
      await dataSource.query('DELETE FROM company_users WHERE id = $1', [
        companyUserBId,
      ]);
    }
    if (userAId) {
      await dataSource.query('DELETE FROM users WHERE id = $1', [userAId]);
    }
    if (userBId) {
      await dataSource.query('DELETE FROM users WHERE id = $1', [userBId]);
    }
    if (companyId) {
      await dataSource.query('DELETE FROM companies WHERE id = $1', [
        companyId,
      ]);
    }
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    emailA = `documents.a.${suffix}@example.com`;
    emailB = `documents.b.${suffix}@example.com`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Documents Co ${suffix}`,
        slug: `e2e-documents-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const userA = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-DA-${suffix}`.slice(0, 20),
        first_name: 'Doc',
        last_name: 'OwnerA',
        phone: `+2551${suffix}`.slice(0, 20),
        email: emailA,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    userAId = userA.id;

    const membershipA = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: companyId,
        user_id: userAId,
        status: 'active',
        is_default: true,
      }),
    );
    companyUserAId = membershipA.id;

    const employeeA = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyId,
        company_user_id: companyUserAId,
        employee_no: `EMP-DA-${suffix}`.slice(0, 50),
        first_name: 'Doc',
        last_name: 'OwnerA',
        gender: 'female',
      }),
    );
    employeeAId = employeeA.id;

    const userB = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-DB-${suffix}`.slice(0, 20),
        first_name: 'Doc',
        last_name: 'OtherB',
        phone: `+2552${suffix}`.slice(0, 20),
        email: emailB,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    userBId = userB.id;

    const membershipB = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: companyId,
        user_id: userBId,
        status: 'active',
        is_default: true,
      }),
    );
    companyUserBId = membershipB.id;

    const employeeB = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyId,
        company_user_id: companyUserBId,
        employee_no: `EMP-DB-${suffix}`.slice(0, 50),
        first_name: 'Doc',
        last_name: 'OtherB',
        gender: 'male',
      }),
    );
    employeeBId = employeeB.id;
  });

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);

    return response.body.access_token as string;
  }

  async function uploadDocumentAsOwnerA(token: string): Promise<number> {
    const fileContent = Buffer.from('Confidential employee document contents.');

    const response = await request(app.getHttpServer() as App)
      .post('/api/me/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Confidential contract',
        file: {
          fileName: 'contract.txt',
          fileSize: fileContent.byteLength,
          mimeType: 'text/plain',
          fileString: fileContent.toString('base64'),
        },
      })
      .expect(201);

    const documentId = response.body.id as number;
    uploadedDocumentId = documentId;
    return documentId;
  }

  it('rejects an unauthenticated download attempt', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/me/documents/1/download')
      .expect(401);
  });

  it('allows the owning employee to download their own document', async () => {
    const tokenA = await login(emailA);
    const documentId = await uploadDocumentAsOwnerA(tokenA);

    const response = await request(app.getHttpServer() as App)
      .get(`/api/me/documents/${documentId}/download`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(response.text).toContain('Confidential employee document contents.');
  });

  it("denies another employee's session from downloading the document", async () => {
    const tokenA = await login(emailA);
    const documentId = await uploadDocumentAsOwnerA(tokenA);

    const tokenB = await login(emailB);

    await request(app.getHttpServer() as App)
      .get(`/api/me/documents/${documentId}/download`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('does not serve employee documents through public static storage', async () => {
    const tokenA = await login(emailA);
    await uploadDocumentAsOwnerA(tokenA);

    const [documentRow] = await dataSource.query(
      'SELECT file_path FROM documents WHERE id = $1',
      [uploadedDocumentId],
    );

    expect(documentRow.file_path).toMatch(/^\/private-uploads\//);

    await request(app.getHttpServer() as App)
      .get(documentRow.file_path as string)
      .expect((response) => {
        expect(response.status).not.toBe(200);
      });
  });
});
