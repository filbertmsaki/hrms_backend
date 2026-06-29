import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import {
  addDaysToDateOnly,
  buildDateOnlyRange,
  formatDateOnly,
  normalizeDateInput,
} from './hr.utils';

describe('hr.utils date-only helpers', () => {
  it('keeps UTC-midnight dates on the same calendar day', () => {
    expect(formatDateOnly(new Date('2026-06-12T00:00:00.000Z'))).toBe(
      '2026-06-12',
    );
  });

  it('builds an inclusive date range without shifting days', () => {
    expect(buildDateOnlyRange('2026-06-12', '2026-06-14')).toEqual([
      '2026-06-12',
      '2026-06-13',
      '2026-06-14',
    ]);
  });

  it('adds days to date-only values without timezone drift', () => {
    expect(addDaysToDateOnly('2026-06-12', 1)).toBe('2026-06-13');
  });

  it('stays stable when the process timezone is behind UTC', () => {
    const script = `
      const utils = require(${JSON.stringify(
        join(process.cwd(), 'src/modules/hr/shared/hr.utils.ts'),
      )});
      console.log(JSON.stringify({
        formatted: utils.formatDateOnly(new Date('2026-06-12T00:00:00.000Z')),
        normalized: utils.normalizeDateInput('2026-06-12T00:00:00.000Z', 'x'),
        range: utils.buildDateOnlyRange('2026-06-12', '2026-06-14'),
        plusOne: utils.addDaysToDateOnly('2026-06-12', 1),
      }));
    `;

    const output = execFileSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-e', script],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TZ: 'America/Los_Angeles',
        },
        encoding: 'utf8',
      },
    );

    expect(JSON.parse(output)).toEqual({
      formatted: '2026-06-12',
      normalized: '2026-06-12',
      range: ['2026-06-12', '2026-06-13', '2026-06-14'],
      plusOne: '2026-06-13',
    });
  });

  it('normalizes ISO date-time inputs without changing the day', () => {
    expect(normalizeDateInput('2026-06-12T00:00:00.000Z', 'date')).toBe(
      '2026-06-12',
    );
  });
});
