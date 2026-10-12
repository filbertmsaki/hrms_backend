import { RecruitmentService } from './recruitment.service';
import { RecruitmentCandidateStatus } from './entities/recruitment-candidate.entity';

describe('RecruitmentService', () => {
  const actor = {
    id: 11,
    companyId: 7,
    companyMembershipId: 20,
    employeeId: 18,
    roles: ['HR_OFFICER'],
    permissions: ['employees:create'],
  } as never;

  function harness() {
    const candidate = {
      id: 3,
      companyId: 7,
      requestId: 2,
      firstName: 'Amina',
      lastName: 'Moshi',
      gender: 'female',
      email: 'amina@example.com',
      phone: '+255712345678',
      status: RecruitmentCandidateStatus.SHORTLISTED,
      cvDocumentId: 40,
      checks: { NIDA: { result: 'PASS' } },
      interview: { scores: { 20: { score: 80 } } },
      offerTokenHash: 'hash',
      offerSalary: '1000000',
    };
    const candidates = {
      findOneBy: jest.fn().mockResolvedValue(candidate),
      find: jest.fn().mockResolvedValue([candidate]),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const documents = { purgeForEntity: jest.fn().mockResolvedValue(1) };
    const config = { get: jest.fn().mockReturnValue(30) };
    const lockedQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(candidate),
    };
    const transactionalRepository = {
      createQueryBuilder: jest.fn(() => lockedQuery),
      save: jest.fn(async (value) => value),
    };
    const dataSource = {
      transaction: jest.fn(async (work) =>
        work({ getRepository: () => transactionalRepository }),
      ),
    };
    const service = new RecruitmentService(
      dataSource as never,
      config as never,
      {} as never,
      documents as never,
      {} as never,
      {} as never,
      {} as never,
      candidates as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, candidate, candidates, documents, dataSource };
  }

  it('sets a retention deadline and revokes the offer token when rejected', async () => {
    const { service, candidate, candidates } = harness();
    const result = await service.rejectCandidate(actor, 3);
    expect(result.status).toBe(RecruitmentCandidateStatus.REJECTED);
    expect(candidate.offerTokenHash).toBeNull();
    expect(result.retentionUntil).toBeInstanceOf(Date);
    expect(candidates.save).toHaveBeenCalledTimes(1);
  });

  it('refuses to reject a candidate who has already been hired', async () => {
    const { service, candidate, candidates } = harness();
    candidate.status = RecruitmentCandidateStatus.HIRED;
    await expect(service.rejectCandidate(actor, 3)).rejects.toThrow(
      'Accepted candidates cannot be rejected here',
    );
    expect(candidate.status).toBe(RecruitmentCandidateStatus.HIRED);
    expect(candidates.save).not.toHaveBeenCalled();
  });

  it('purges candidate documents and personal data after retention', async () => {
    const { service, candidate, candidates, documents } = harness();
    candidate.status = RecruitmentCandidateStatus.REJECTED;
    const count = await service.purgeExpiredCandidates();
    expect(count).toBe(1);
    expect(documents.purgeForEntity).toHaveBeenCalledWith(7, 'CANDIDATE', 3);
    expect(candidate.email).toBeNull();
    expect(candidate.cvDocumentId).toBeNull();
    expect(candidate.checks).toBeNull();
    expect(candidate.status).toBe(RecruitmentCandidateStatus.PURGED);
    expect(candidates.save).toHaveBeenCalledTimes(1);
  });

  it('accepts an approved offer once inside a transaction', async () => {
    const { service, candidate, dataSource } = harness();
    candidate.status = RecruitmentCandidateStatus.OFFER_APPROVED;
    (candidate as typeof candidate & { offerExpiresAt: Date }).offerExpiresAt =
      new Date(Date.now() + 60000);
    const result = await service.acceptOffer('token');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(RecruitmentCandidateStatus.OFFER_ACCEPTED);
    expect(candidate.offerTokenHash).toBeNull();
  });
});
