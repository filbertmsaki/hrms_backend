import { ReconciliationRight } from './reconciliation-rights-planner';

/** Accept a complete door and schedule inventory before replacing rights on a reader. */
export function deviceRightsReadback(
  raw: Record<string, unknown>,
): ReconciliationRight[] | null {
  const doorField = raw.doorRight;
  const plans = raw.RightPlan ?? raw.rightPlan;
  if (typeof doorField !== 'string' || !Array.isArray(plans)) return null;
  const doors = doorField.trim()
    ? doorField.split(',').map((n) => n.trim())
    : [];
  if (
    doors.some(
      (n) =>
        !/^\d+$/.test(n) || !Number.isSafeInteger(Number(n)) || Number(n) < 1,
    )
  )
    return null;
  const response: ReconciliationRight[] = [];
  for (const row of plans) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const entry = row as Record<string, unknown>;
    if (
      Object.keys(entry).some(
        (key) =>
          !['doorNo', 'doorID', 'planTemplateNo', 'templateNo'].includes(key),
      )
    )
      return null;
    const template = entry.planTemplateNo ?? entry.templateNo;
    const door = entry.doorNo ?? entry.doorID;
    if (
      (typeof door !== 'number' && typeof door !== 'string') ||
      (typeof template !== 'number' && typeof template !== 'string')
    )
      return null;
    const doorNo = Number(door),
      templateNo = String(template).trim();
    if (
      !Number.isSafeInteger(doorNo) ||
      doorNo < 1 ||
      !/^\d+$/.test(templateNo) ||
      !doors.includes(String(doorNo))
    )
      return null;
    response.push({ doorNo, templateNo });
  }
  return doors.every((door) =>
    response.some((right) => right.doorNo === Number(door)),
  )
    ? response
    : null;
}
