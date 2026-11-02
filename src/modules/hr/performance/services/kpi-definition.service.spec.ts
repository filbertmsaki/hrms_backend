import { ConflictException } from '@nestjs/common';
import { KpiDataSourceTypeEnum as Source } from '../enums/kpi-data-source-type.enum';
import { KpiDefinitionService } from './kpi-definition.service';

describe('KpiDefinitionService source availability', () => {
  const createService = () =>
    new KpiDefinitionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  it('rejects external API until its contract and provider exist', () => {
    expect(() =>
      (createService() as any).assertSourceExecutable(Source.EXTERNAL_API),
    ).toThrow(ConflictException);
  });

  it('requires an explicit registered provider for system calculation', () => {
    expect(() =>
      (createService() as any).assertSourceExecutable(
        Source.SYSTEM_CALCULATION,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      (createService() as any).assertSourceExecutable(
        Source.SYSTEM_CALCULATION,
        { provider_key: 'MADE_UP_PROVIDER' },
      ),
    ).toThrow(ConflictException);
    expect(() =>
      (createService() as any).assertSourceExecutable(
        Source.SYSTEM_CALCULATION,
        { provider_key: 'ATTENDANCE_PRESENT_RATE' },
      ),
    ).not.toThrow();
  });

  it.each([
    Source.MANUAL_EMPLOYEE,
    Source.MANUAL_MANAGER,
    Source.ATTENDANCE,
    Source.LEAVE,
    Source.DAILY_ACTIVITY,
    Source.FIELD_VISIT,
    Source.FILE_IMPORT,
  ])('allows implemented source %s', (source) => {
    expect(() =>
      (createService() as any).assertSourceExecutable(source),
    ).not.toThrow();
  });

  it('rejects provider keys that do not belong to a legacy source', () => {
    expect(() =>
      (createService() as any).assertSourceExecutable(Source.ATTENDANCE, {
        provider_key: 'LEADS_GENERATED',
      }),
    ).toThrow(ConflictException);
  });
});
