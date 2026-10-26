import { ConfigService } from '@nestjs/config';
import { KpiDataSourceRegistryService } from './kpi-data-source-registry.service';
import { KpiProviderKeyEnum } from '../enums/kpi-provider-key.enum';
import { KpiDataSourceTypeEnum as Source } from '../enums/kpi-data-source-type.enum';

describe('KpiDataSourceRegistryService', () => {
  const service = new KpiDataSourceRegistryService(
    new ConfigService({
      PERFORMANCE_ACTIVITY_PROVIDER_ENABLED: false,
      PERFORMANCE_FIELD_VISIT_PROVIDER_ENABLED: false,
    }),
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('rejects Phase 13 daily-activity providers while disabled', async () => {
    await expect(
      (service as any).computeValue(
        KpiProviderKeyEnum.PHASE13_DAILY_ACTIVITY,
        1,
        2,
        '2026-08-01',
        '2026-08-31',
      ),
    ).rejects.toThrow(
      'Daily activity KPI provider is unavailable until Phase 13 is enabled.',
    );
  });

  it('resolves only explicitly configured providers for system calculations', () => {
    const resolve = (sourceType: Source, providerKey?: unknown) =>
      (service as any).resolveProviderKey({
        sourceType,
        planItem: {
          kpiDefinitionVersion: {
            dataSourceConfiguration:
              providerKey === undefined ? null : { provider_key: providerKey },
          },
        },
      });

    expect(
      resolve(Source.SYSTEM_CALCULATION, KpiProviderKeyEnum.LEADS_GENERATED),
    ).toBe(KpiProviderKeyEnum.LEADS_GENERATED);
    expect(() => resolve(Source.SYSTEM_CALCULATION)).toThrow(
      'System KPI is missing a supported provider configuration.',
    );
    expect(() =>
      resolve(Source.SYSTEM_CALCULATION, 'UNREGISTERED_PROVIDER'),
    ).toThrow('System KPI is missing a supported provider configuration.');
    expect(() =>
      resolve(Source.ATTENDANCE, KpiProviderKeyEnum.LEADS_GENERATED),
    ).toThrow(
      'Provider LEADS_GENERATED is not supported for source ATTENDANCE.',
    );
  });

  it('resolves legacy attendance and leave defaults', () => {
    const resolve = (sourceType: Source) =>
      (service as any).resolveProviderKey({
        sourceType,
        planItem: { kpiDefinitionVersion: { dataSourceConfiguration: null } },
      });

    expect(resolve(Source.ATTENDANCE)).toBe(
      KpiProviderKeyEnum.ATTENDANCE_PRESENT_RATE,
    );
    expect(resolve(Source.LEAVE)).toBe(KpiProviderKeyEnum.LEAVE_APPROVED_DAYS);
  });
});
