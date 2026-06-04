let searchSequence = 0;

export const buildAttendanceDeviceSearchId = (
  _prefix = 'search',
  ...parts: Array<string | number | null | undefined>
): string => {
  searchSequence = (searchSequence + 1) % 1000;

  const numericSeed = [
    Date.now().toString(),
    searchSequence.toString().padStart(3, '0'),
    ...parts
      .map((part) => String(part ?? '').replace(/\D+/g, ''))
      .filter(Boolean)
      .slice(0, 2),
  ].join('');

  return numericSeed.slice(0, 32);
};
