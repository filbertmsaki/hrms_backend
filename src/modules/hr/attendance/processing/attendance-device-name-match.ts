export type AttendanceEmployeeName = {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
};

export type AttendanceDeviceNameMatch = 'MATCH' | 'MISMATCH' | 'MISSING_NAME';

function tokens(value: string | null | undefined): string[] {
  return (
    (value ?? '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase('en')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/** A match requires both first and last name; a middle name may be omitted. */
export function compareAttendanceDeviceName(
  deviceName: string | null | undefined,
  employee: AttendanceEmployeeName,
): AttendanceDeviceNameMatch {
  const device = tokens(deviceName);
  const first = tokens(employee.first_name);
  const last = tokens(employee.last_name);
  if (!device.length || !first.length || !last.length) return 'MISSING_NAME';

  const allowed = new Set([...first, ...tokens(employee.middle_name), ...last]);
  const available = new Map<string, number>();
  for (const part of device)
    available.set(part, (available.get(part) ?? 0) + 1);
  const required = [...first, ...last];
  const containsRequired = required.every((part) => {
    const count = available.get(part) ?? 0;
    if (count === 0) return false;
    available.set(part, count - 1);
    return true;
  });
  return containsRequired && device.every((part) => allowed.has(part))
    ? 'MATCH'
    : 'MISMATCH';
}
