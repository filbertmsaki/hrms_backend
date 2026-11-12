import { BadRequestException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import type { EvaluationTemplateVersion } from './evaluation.entities';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

const validation = Object.create(EvaluationService.prototype) as {
  validateRatings(
    ratings: Record<string, number>,
    template: EvaluationTemplateVersion,
    required: boolean,
  ): void;
  validateTemplate(input: {
    name: string;
    competencies: Array<{ code: string; name: string }>;
    scale: Array<{ value: number; label: string }>;
    requireHrReview: boolean;
    sectionWeights?: { kpi: number; competency: number };
  }): unknown;
};
const template = {
  config: {
    competencies: [{ code: 'QUALITY', name: 'Quality' }],
    scale: [
      { value: 1, label: 'Below' },
      { value: 5, label: 'Outstanding' },
    ],
    requireHrReview: false,
  },
} as EvaluationTemplateVersion;

describe('Phase 4 appraisal policy validation', () => {
  it('accepts configured competency boundaries and rejects unapproved ratings', () => {
    expect(() =>
      validation.validateRatings({ QUALITY: 1 }, template, true),
    ).not.toThrow();
    expect(() =>
      validation.validateRatings({ QUALITY: 5 }, template, true),
    ).not.toThrow();
    expect(() =>
      validation.validateRatings({ QUALITY: 0 }, template, true),
    ).toThrow(BadRequestException);
    expect(() =>
      validation.validateRatings({ QUALITY: 6 }, template, true),
    ).toThrow(BadRequestException);
    expect(() => validation.validateRatings({}, template, true)).toThrow(
      'Every configured competency',
    );
    expect(() =>
      validation.validateRatings({ OTHER: 1 }, template, false),
    ).toThrow(BadRequestException);
  });
  it('rejects duplicate scale points and invalid section weights', () => {
    const valid = {
      name: 'Test',
      competencies: [{ code: 'QUALITY', name: 'Quality' }],
      scale: [
        { value: 1, label: 'Below' },
        { value: 5, label: 'Outstanding' },
      ],
      requireHrReview: false,
    };
    expect(() =>
      validation.validateTemplate({
        ...valid,
        sectionWeights: { kpi: 70, competency: 30 },
      }),
    ).not.toThrow();
    expect(() =>
      validation.validateTemplate({
        ...valid,
        sectionWeights: { kpi: 70, competency: 20 },
      }),
    ).toThrow('total 100%');
    expect(() =>
      validation.validateTemplate({
        ...valid,
        scale: [
          { value: 1, label: 'Below' },
          { value: 1, label: 'Duplicate' },
        ],
      }),
    ).toThrow('unique');
  });
  it('denies an HR administrator review and finalization of their own evaluation', async () => {
    const service = Object.create(EvaluationService.prototype) as {
      admin: jest.Mock;
      row: jest.Mock;
      hrAction: EvaluationService['hrAction'];
      finalize: EvaluationService['finalize'];
    };
    service.admin = jest.fn();
    service.row = jest.fn(async () => ({ row: { employeeId: 15 } }));
    const actor = { employeeId: 15 } as AuthenticatedUser;
    await expect(
      service.hrAction(actor, 1, 'approve', { rowVersion: 1 }),
    ).rejects.toThrow('Self review is forbidden');
    await expect(service.finalize(actor, 1, { rowVersion: 1 })).rejects.toThrow(
      'Self finalization is forbidden',
    );
  });
});
