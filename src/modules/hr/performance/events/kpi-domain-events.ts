export const KPI_DOMAIN_EVENTS = {
  ASSIGNED: 'performance.kpi.assigned',
  PROPOSAL_SUBMITTED: 'performance.kpi.proposal.submitted',
  PROPOSAL_APPROVED: 'performance.kpi.proposal.approved',
  APPROVED: 'performance.kpi.approved',
  LOCKED: 'performance.kpi.locked',
  MID_REVIEW_COMPLETED: 'performance.kpi.mid_review.completed',
  FINALIZED: 'performance.kpi.finalized',
  CYCLE_LOCKED: 'performance.kpi.cycle.locked',
  CYCLE_REOPENED: 'performance.kpi.cycle.reopened',
  FINAL_SCORE_LOCKED: 'performance.kpi.final_score.locked',
} as const;

export type KpiAssignmentEvent = KpiCycleEvent & {
  employeeId: number;
  employeeKpiId: number;
};

export type KpiCycleEvent = {
  cycleId: number;
  companyId: number;
  occurredAt: string;
};

export type KpiFinalScoreLockedEvent = KpiCycleEvent & {
  employeeId: number;
  totalWeightedScore: string;
  finalRatingBand: string;
  finalizedAt: string;
};
