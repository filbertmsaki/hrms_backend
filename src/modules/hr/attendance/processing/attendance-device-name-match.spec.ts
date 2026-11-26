import { compareAttendanceDeviceName } from './attendance-device-name-match';

describe('attendance device name comparison', () => {
  const employee = {
    first_name: 'Filbert',
    middle_name: 'Elisaria',
    last_name: 'Msaki',
  };

  it.each(['Filbert Msaki', 'FILBERT ELISARIA MSAKI', 'Msaki Filbert'])(
    'matches %s',
    (name) => {
      expect(compareAttendanceDeviceName(name, employee)).toBe('MATCH');
    },
  );
  it.each([
    'Filbert Other',
    'Other Msaki',
    'Filbert Elisaria Other Msaki',
    'Filbert',
  ])('rejects %s', (name) => {
    expect(compareAttendanceDeviceName(name, employee)).toBe('MISMATCH');
  });
  it('does not treat missing names as a match', () => {
    expect(compareAttendanceDeviceName(null, employee)).toBe('MISSING_NAME');
    expect(
      compareAttendanceDeviceName('Filbert Msaki', {
        ...employee,
        last_name: null,
      }),
    ).toBe('MISSING_NAME');
  });
  it('requires distinct name occurrences when first and last names are identical', () => {
    const same = { first_name: 'Ali', middle_name: null, last_name: 'Ali' };
    expect(compareAttendanceDeviceName('Ali', same)).toBe('MISMATCH');
    expect(compareAttendanceDeviceName('Ali Ali', same)).toBe('MATCH');
  });
});
