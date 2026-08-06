import { ConfigService } from '@nestjs/config';
import { KpiDataSourceRegistryService } from './kpi-data-source-registry.service';
import { KpiProviderKeyEnum } from '../enums/kpi-provider-key.enum';

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
});
