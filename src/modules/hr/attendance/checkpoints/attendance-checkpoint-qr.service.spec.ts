import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AttendanceCheckpointQrService } from './attendance-checkpoint-qr.service';
import { AttendanceCheckpoint } from './entities/attendance-checkpoint.entity';
import { AttendanceCheckpointQrTokenUse } from './entities/attendance-checkpoint-qr-token-use.entity';
import { AttendanceCheckpointTypeEnum } from './enums/attendance-checkpoint-type.enum';

describe('AttendanceCheckpointQrService', () => {
  const usedTokens = new Set<string>();
  let service: AttendanceCheckpointQrService;
  let checkpointRepository: { findOne: jest.Mock };
  let tokenUseRepository: {
    insert: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  const checkpoint = {
    id: 17,
    policySetId: 12,
    type: AttendanceCheckpointTypeEnum.QR,
    status: 'ACTIVE',
    policySet: { company_id: 1 },
  } as AttendanceCheckpoint;

  beforeEach(() => {
    usedTokens.clear();
    checkpointRepository = {
      findOne: jest.fn().mockResolvedValue(checkpoint),
    };
    tokenUseRepository = {
      insert: jest.fn(async (item: AttendanceCheckpointQrTokenUse) => {
        const key = `${item.companyId}:${item.checkpointId}:${item.employeeId}:${item.tokenNonceHash}`;
        if (usedTokens.has(key)) {
          throw Object.assign(new Error('Duplicate QR token use.'), {
            code: '23505',
          });
        }
        usedTokens.add(key);
        return {};
      }),
      createQueryBuilder: jest.fn(() => ({
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      })),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'ATTENDANCE_DEVICE_SECRET_KEY' ? 's'.repeat(64) : undefined,
      ),
    };
    service = new AttendanceCheckpointQrService(
      tokenUseRepository as unknown as Repository<AttendanceCheckpointQrTokenUse>,
      checkpointRepository as unknown as Repository<AttendanceCheckpoint>,
      config as unknown as ConfigService,
    );
  });

  it('issues short lived, scoped QR tokens for active company checkpoints', async () => {
    const result = await service.issueToken({
      companyId: 1,
      checkpointId: 17,
      validForSeconds: 60,
    });

    expect(result.token.split('.')).toHaveLength(2);
    expect(result.valid_for_seconds).toBe(60);
    expect(checkpointRepository.findOne).toHaveBeenCalledWith({
      where: { id: 17 },
      relations: { policySet: true },
    });
  });

  it('accepts a valid QR token once per employee and rejects replay', async () => {
    const { token } = await service.issueToken({
      companyId: 1,
      checkpointId: 17,
    });
    const params = {
      companyId: 1,
      employeeId: 44,
      policySetId: 12,
      requiredCheckpoints: [checkpoint],
      token,
    };

    await expect(service.validateAndConsume(params)).resolves.toEqual({
      required: true,
      valid: true,
      checkpointId: 17,
    });
    await expect(service.validateAndConsume(params)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects QR tokens signed for another company', async () => {
    const { token } = await service.issueToken({
      companyId: 1,
      checkpointId: 17,
    });

    await expect(
      service.validateAndConsume({
        companyId: 2,
        employeeId: 44,
        policySetId: 12,
        requiredCheckpoints: [checkpoint],
        token,
      }),
    ).rejects.toThrow('QR checkpoint token is expired or invalid.');
    expect(tokenUseRepository.insert).not.toHaveBeenCalled();
  });
});
