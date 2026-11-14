import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { LeavePolicy } from '../entities/leave-policy.entity';
import { LeaveAuditService } from './leave-audit.service';
import { LeavePolicyDraftService } from './leave-policy-draft.service';

describe('leave policy draft revisions', () => {
  const actor = {
    id: 2,
    companyId: 1,
    companyMembershipId: 3,
  } as AuthenticatedUser;
  const input = {
    proposedEffectiveDate: '2027-01-01',
    rules: { annual: { entitlement_days: 28 } },
    reason: 'Initial draft',
  };
  let policyFind: jest.Mock;
  let save: jest.Mock;
  let audit: { log: jest.Mock };
  let service: LeavePolicyDraftService;

  beforeEach(() => {
    policyFind = jest.fn().mockResolvedValue({ id: 4 });
    save = jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 7, ...value }),
    );
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === LeavePolicy
          ? { findOne: policyFind }
          : { create: (value: unknown) => value, save },
      ),
    };
    const dataSource = {
      getRepository: jest.fn(() => ({ findOne: policyFind })),
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new LeavePolicyDraftService(
      dataSource as unknown as DataSource,
      audit as unknown as LeaveAuditService,
    );
  });

  it('creates a company-scoped inactive revision and records its provenance', async () => {
    const result = await service.create(1, 4, actor, input);
    expect(result.active).toBe(false);
    expect(result.validation_errors.length).toBeGreaterThan(0);
    expect(policyFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 4, company_id: 1 } }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        policy_id: 4,
        created_by_company_user_id: 3,
        rules: input.rules,
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'leave_policy_draft.created',
        entity_id: 4,
      }),
      expect.anything(),
    );
  });

  it('rejects a nonexistent or foreign policy', async () => {
    policyFind.mockResolvedValue(null);
    await expect(service.create(1, 4, actor, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects invalid dates and empty rule sets', async () => {
    await expect(
      service.create(1, 4, actor, {
        ...input,
        proposedEffectiveDate: '2027-02-30',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(1, 4, actor, { ...input, rules: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });

  it('validates a draft without activating it and checks policy tenant', async () => {
    const result = await service.validate(
      1,
      4,
      input.proposedEffectiveDate,
      input.rules,
    );
    expect(result.schema_valid).toBe(false);
    expect(result.activation_available).toBe(false);
    expect(policyFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 4, company_id: 1 } }),
    );
    policyFind.mockResolvedValue(null);
    await expect(
      service.validate(1, 4, input.proposedEffectiveDate, input.rules),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
