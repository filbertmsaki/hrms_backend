export type ReconciliationRight = {
  doorNo: number;
  templateNo: string;
};

export type ReconciliationPlan =
  | { state: 'REVIEW'; reason: string }
  | {
      state: 'READY';
      desired: ReconciliationRight[];
      managedAfter: ReconciliationRight[];
      changed: boolean;
    };

export type PendingWriteRecovery = 'APPLIED' | 'NOT_APPLIED' | 'REVIEW';

function normalize(rights: ReconciliationRight[]): ReconciliationRight[] {
  const unique = new Map<string, ReconciliationRight>();
  for (const right of rights) {
    const templateNo = right.templateNo.trim();
    if (!Number.isSafeInteger(right.doorNo) || right.doorNo < 1 || !templateNo)
      throw new Error('Access rights contain an invalid door or template');
    unique.set(JSON.stringify([right.doorNo, templateNo]), {
      doorNo: right.doorNo,
      templateNo,
    });
  }
  return [...unique.values()].sort(
    (a, b) => a.doorNo - b.doorNo || a.templateNo.localeCompare(b.templateNo),
  );
}

function key(right: ReconciliationRight): string {
  return JSON.stringify([right.doorNo, right.templateNo]);
}

/** Classify a write interrupted by a timeout or process failure without
 * guessing who owns a device state that differs from both recorded snapshots. */
export function recoverPendingWrite(input: {
  observed: ReconciliationRight[];
  before: ReconciliationRight[];
  after: ReconciliationRight[];
}): PendingWriteRecovery {
  const observed = normalize(input.observed).map(key);
  const before = normalize(input.before).map(key);
  const after = normalize(input.after).map(key);
  const equal = (left: string[], right: string[]) =>
    left.length === right.length &&
    left.every((value, i) => value === right[i]);
  if (equal(observed, after)) return 'APPLIED';
  if (equal(observed, before)) return 'NOT_APPLIED';
  return 'REVIEW';
}

/**
 * Merge desired HRMS grants with observed device grants. Rights which already
 * existed before HRMS created them remain unmanaged and cannot be revoked here.
 * Conflicting schedules require review instead of choosing one silently.
 */
export function planReconciliationRights(input: {
  observed: ReconciliationRight[];
  desiredGroup: ReconciliationRight[];
  desiredDirect: ReconciliationRight[];
  previouslyManaged: ReconciliationRight[];
  requestedRemovals?: ReconciliationRight[];
}): ReconciliationPlan {
  const observed = normalize(input.observed);
  const desired = normalize([...input.desiredGroup, ...input.desiredDirect]);
  const previous = normalize(input.previouslyManaged);
  const observedKeys = new Set(observed.map(key));
  const previousKeys = new Set(previous.map(key));
  const unmanaged = observed.filter((right) => !previousKeys.has(key(right)));
  const desiredKeys = new Set(desired.map(key));
  const unmanagedKeys = new Set(unmanaged.map(key));
  const ambiguousRemoval = normalize(input.requestedRemovals ?? []).find(
    (right) => unmanagedKeys.has(key(right)) && !desiredKeys.has(key(right)),
  );
  if (ambiguousRemoval)
    return {
      state: 'REVIEW',
      reason: `Door ${ambiguousRemoval.doorNo} has a right of unknown ownership; removal requires review`,
    };
  const combined = normalize([...unmanaged, ...desired]);
  const byDoor = new Map<number, Set<string>>();
  for (const right of combined) {
    const templates = byDoor.get(right.doorNo) ?? new Set<string>();
    templates.add(right.templateNo);
    byDoor.set(right.doorNo, templates);
  }
  const conflictingDoor = [...byDoor.entries()].find(
    ([, templates]) => templates.size > 1,
  );
  if (conflictingDoor)
    return {
      state: 'REVIEW',
      reason: `Door ${conflictingDoor[0]} has conflicting schedule templates`,
    };

  // Only a grant newly created by this worker can become managed. Observing an
  // already-existing matching grant does not establish ownership of it.
  const managedAfter = desired.filter(
    (right) => previousKeys.has(key(right)) || !observedKeys.has(key(right)),
  );
  const changed =
    observed.length !== combined.length ||
    observed.some((right, index) => key(right) !== key(combined[index]));
  return { state: 'READY', desired: combined, managedAfter, changed };
}
