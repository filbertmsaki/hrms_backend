import { createHash } from 'crypto';

export type AccessGrant = {
  groupId: number;
  groupName: string;
  doorId: number;
  doorNo: number;
  doorName: string;
  templateId: number;
  templateNo: string;
  templateName: string;
};

/** Computes the union of logical group grants without issuing device commands. */
export function calculateEffectiveAccess(grants: AccessGrant[]) {
  const byDoor = new Map<number, Map<string, AccessGrant[]>>();
  for (const grant of grants) {
    if (!byDoor.has(grant.doorNo)) byDoor.set(grant.doorNo, new Map());
    const templates = byDoor.get(grant.doorNo)!;
    if (!templates.has(grant.templateNo)) templates.set(grant.templateNo, []);
    templates.get(grant.templateNo)!.push(grant);
  }
  const rights = [...byDoor.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([doorNo, templates]) =>
      [...templates.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([templateNo, sources]) => ({
          door_no: doorNo,
          door_id: sources[0].doorId,
          door_name: sources[0].doorName,
          template_no: templateNo,
          template_id: sources[0].templateId,
          template_name: sources[0].templateName,
          groups: [
            ...new Map(
              sources.map((source) => [
                source.groupId,
                { id: source.groupId, name: source.groupName },
              ]),
            ).values(),
          ].sort((a, b) => a.id - b.id),
        })),
    );
  const conflicts = [...byDoor.entries()]
    .filter(([, templates]) => templates.size > 1)
    .sort(([a], [b]) => a - b)
    .map(([doorNo, templates]) => ({
      door_no: doorNo,
      template_numbers: [...templates.keys()].sort(),
    }));
  const version = createHash('sha256')
    .update(
      JSON.stringify(
        rights.map((right) => ({
          door_no: right.door_no,
          template_no: right.template_no,
        })),
      ),
    )
    .digest('hex');
  return { rights, conflicts, version };
}
