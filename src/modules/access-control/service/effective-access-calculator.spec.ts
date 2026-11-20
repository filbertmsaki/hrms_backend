import {
  AccessGrant,
  calculateEffectiveAccess,
} from './effective-access-calculator';

const grant = (
  groupId: number,
  doorNo: number,
  templateNo: string,
): AccessGrant => ({
  groupId,
  groupName: `Group ${groupId}`,
  doorId: doorNo,
  doorNo,
  doorName: `Door ${doorNo}`,
  templateId: Number(templateNo),
  templateNo,
  templateName: `Template ${templateNo}`,
});

describe('effective device access calculation', () => {
  it('combines groups without removing access still granted by another group', () => {
    const a = grant(1, 1, '1');
    const b = grant(2, 1, '1');
    const c = grant(2, 2, '2');
    const all = calculateEffectiveAccess([a, b, c]);
    expect(all.rights).toHaveLength(2);
    expect(all.rights[0].groups.map((group) => group.id)).toEqual([1, 2]);
    expect(
      calculateEffectiveAccess([b, c]).rights.map((right) => right.door_no),
    ).toEqual([1, 2]);
    expect(calculateEffectiveAccess([c, b]).version).toBe(
      calculateEffectiveAccess([b, c]).version,
    );
  });

  it('reports incompatible schedules on the same door instead of choosing one', () => {
    const result = calculateEffectiveAccess([
      grant(1, 1, '1'),
      grant(2, 1, '2'),
    ]);
    expect(result.conflicts).toEqual([
      { door_no: 1, template_numbers: ['1', '2'] },
    ]);
  });
});
