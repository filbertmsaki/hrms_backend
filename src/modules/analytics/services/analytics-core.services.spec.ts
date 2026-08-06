import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AnalyticsCacheService,
  AnalyticsPrivacyService,
  AnalyticsSourceRegistryService,
} from './analytics-core.services';

describe('Analytics governance services', () => {
  it('registers the default source registry and rejects unknown sources', () => {
    const service = new AnalyticsSourceRegistryService();

    expect(service.list().length).toBeGreaterThan(10);
    expect(service.require('EMPLOYEES').sourceTable).toBe('employees');
    expect(() => service.require('NOPE')).toThrow(NotFoundException);
  });

  it('prevents duplicate analytics source codes', () => {
    const service = new AnalyticsSourceRegistryService();

    expect(() =>
      service.register({
        ...service.require('EMPLOYEES'),
        sourceTable: 'employees_copy',
      }),
    ).toThrow(BadRequestException);
  });

  it('suppresses small cells and rejects raw SQL filters', () => {
    const config = {
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'ANALYTICS_SMALL_CELL_MINIMUM_COUNT') return 5;
        if (key === 'ANALYTICS_SMALL_CELL_SUPPRESSION_ENABLED') return true;
        if (key === 'ANALYTICS_ALLOW_RAW_SQL') return false;
        return fallback;
      }),
    } as unknown as ConfigService;
    const service = new AnalyticsPrivacyService(config);

    expect(service.suppressSmallCell(3)).toBeNull();
    expect(service.suppressSmallCell(8)).toBe(8);
    expect(() => service.assertRawSqlDisabled({ where: '1=1; DROP TABLE employees' })).toThrow(
      BadRequestException,
    );
  });

  it('builds tenant and scope specific dashboard cache keys', () => {
    const config = {
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'ANALYTICS_DASHBOARD_CACHE_ENABLED') return true;
        return fallback;
      }),
    } as unknown as ConfigService;
    const service = new AnalyticsCacheService(config);

    const first = service.key({ companyId: 1, scopeHash: 'a', dashboard: 'HR' });
    const second = service.key({ companyId: 2, scopeHash: 'a', dashboard: 'HR' });
    const scoped = service.key({ companyId: 1, scopeHash: 'b', dashboard: 'HR' });

    expect(first).not.toBe(second);
    expect(first).not.toBe(scoped);
  });

  it('invalidates only cache entries for the refreshed company', () => {
    const config = {
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'ANALYTICS_DASHBOARD_CACHE_ENABLED') return true;
        if (key === 'ANALYTICS_DASHBOARD_CACHE_TTL_SECONDS') return 300;
        return fallback;
      }),
    } as unknown as ConfigService;
    const service = new AnalyticsCacheService(config);
    const first = service.key({ companyId: 1, dashboard: 'HR' });
    const second = service.key({ companyId: 2, dashboard: 'HR' });

    service.set(first, { ok: 1 }, undefined, 1);
    service.set(second, { ok: 2 }, undefined, 2);
    service.invalidateCompany(1);

    expect(service.get(first)).toBeNull();
    expect(service.get(second)).toEqual({ ok: 2 });
  });
});
