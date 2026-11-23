import { ForbiddenException } from '@nestjs/common';
import { assertCanMutateSystemGeneratedRbacRecord } from './system-generated-rbac.util';

const companyAdmin = { scope: 'company', userType: 'COMPANY_USER' } as any;
const owner = { scope: 'platform', userType: 'OWNER' } as any;

describe('assertCanMutateSystemGeneratedRbacRecord', () => {
  it('lets a company admin edit a built-in company role', () => {
    expect(() =>
      assertCanMutateSystemGeneratedRbacRecord(
        companyAdmin,
        { name: 'HR_MANAGER', is_system_generated: true, company_id: 7 },
        'role',
      ),
    ).not.toThrow();
  });

  it('keeps platform system roles read-only for company admins', () => {
    expect(() =>
      assertCanMutateSystemGeneratedRbacRecord(
        companyAdmin,
        { name: 'SUPER_ADMIN', is_system_generated: true, company_id: null },
        'role',
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets the platform owner edit platform system roles', () => {
    expect(() =>
      assertCanMutateSystemGeneratedRbacRecord(
        owner,
        { name: 'SUPER_ADMIN', is_system_generated: true, company_id: null },
        'role',
      ),
    ).not.toThrow();
  });

  it('keeps system permissions read-only for non-owners', () => {
    expect(() =>
      assertCanMutateSystemGeneratedRbacRecord(
        companyAdmin,
        { name: 'roles:read', is_system_generated: true, company_id: 7 },
        'permission',
      ),
    ).toThrow(ForbiddenException);
  });
});
