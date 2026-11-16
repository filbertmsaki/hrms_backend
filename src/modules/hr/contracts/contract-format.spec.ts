import {
  displayValues,
  fixPlurals,
  formatAmountWithWords,
  formatLegalDate,
  titleCaseIfFlat,
} from './contract-format';
import { clauseBlocks, richSegments } from './contract-document.service';
import { decodeLogo, readBranding } from './contract-settings.service';

describe('contract PDF formatting', () => {
  it('writes dates in full', () => {
    expect(formatLegalDate('2026-11-01')).toBe('1 November 2026');
    expect(formatLegalDate('not a date')).toBe('not a date');
  });

  it('adds thousands separators and the amount in words', () => {
    expect(formatAmountWithWords('1000000', 'TZS')).toBe(
      '1,000,000.00 (Tanzanian Shillings One Million Only)',
    );
    expect(formatAmountWithWords('1250000.50', 'tzs')).toBe(
      '1,250,000.50 (Tanzanian Shillings One Million Two Hundred and Fifty Thousand and Fifty Cents Only)',
    );
    expect(formatAmountWithWords('abc', 'TZS')).toBe('abc');
  });

  it('pluralises durations', () => {
    expect(fixPlurals('The first 1 month(s) and 6 month(s)')).toBe(
      'The first 1 month and 6 months',
    );
  });

  it('title-cases only flat-cased names', () => {
    expect(titleCaseIfFlat('JANE MUSA')).toBe('Jane Musa');
    expect(titleCaseIfFlat('mikocheni b, dar es salaam')).toBe(
      'Mikocheni B, Dar es Salaam',
    );
    expect(titleCaseIfFlat('P.O. Box 1, McDonald Street')).toBe(
      'P.O. Box 1, McDonald Street',
    );
  });

  it('leaves the original values untouched', () => {
    const raw = { start_date: '2026-11-01', salary: '1000', currency: 'TZS' };
    const shown = displayValues(raw);
    expect(raw.start_date).toBe('2026-11-01');
    expect(shown.start_date).toBe('1 November 2026');
  });

  it('marks defined terms bold and statutes italic', () => {
    const parts = richSegments(
      'made with X ("the Employer") under the Employment and Labour Relations Act, 2004.',
    );
    expect(parts.find((p) => p.font === 'Times-Bold')?.text).toBe(
      '“the Employer”',
    );
    expect(parts.find((p) => p.font === 'Times-Italic')?.text).toBe(
      'Employment and Labour Relations Act, 2004',
    );
  });

  it('accepts only real PNG/JPEG logos under 300 KB', () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1,
    ]);
    expect(
      decodeLogo(`data:image/png;base64,${png.toString('base64')}`).length,
    ).toBe(9);
    expect(() =>
      decodeLogo(
        `data:image/png;base64,${Buffer.from('<svg/>').toString('base64')}`,
      ),
    ).toThrow();
    expect(() => decodeLogo('data:image/gif;base64,R0lGOD')).toThrow();
    expect(() =>
      decodeLogo(
        `data:image/png;base64,${Buffer.concat([png, Buffer.alloc(301 * 1024)]).toString('base64')}`,
      ),
    ).toThrow();
    expect(readBranding({ contract_branding: { tagline: '  Hi  ' } })).toEqual({
      logo_data_url: null,
      tagline: 'Hi',
    });
  });

  it('splits clause bodies into paragraphs and lettered items', () => {
    expect(clauseBlocks('First.\nSecond:\na) one;\n(b) two')).toEqual([
      { kind: 'para', text: 'First.' },
      { kind: 'para', text: 'Second:' },
      { kind: 'item', text: 'one;' },
      { kind: 'item', text: 'two' },
    ]);
  });
});
