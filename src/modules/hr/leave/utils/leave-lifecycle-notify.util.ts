import type { EventEmitter2 } from '@nestjs/event-emitter';
import { LeaveLifecycleNotificationEvent } from '../../notifications/events/leave.events';

type LifecycleInput = LeaveLifecycleNotificationEvent['input'];

/**
 * Emits a leave lifecycle notification. Call only after the transaction that
 * made the change has committed; delivery problems are handled (and logged)
 * by the listener and never affect the leave operation itself.
 */
export function emitLeaveLifecycle(
  emitter: Pick<EventEmitter2, 'emit'> | null | undefined,
  input: LifecycleInput,
): void {
  if (!emitter) return;
  try {
    emitter.emit(
      LeaveLifecycleNotificationEvent.EVENT,
      new LeaveLifecycleNotificationEvent(input),
    );
  } catch {
    // Listener errors must never surface into a committed leave operation.
  }
}

const daysText = (value: unknown) => {
  const n = Number(value ?? 0);
  return `${Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0'} day(s)`;
};

/** Encashment lifecycle message for the employee (and HR where useful). */
export function encashmentNotification(
  stage:
    | 'requested'
    | 'approved'
    | 'rejected'
    | 'submitted_to_payroll'
    | 'paid'
    | 'payment_failed'
    | 'reversed',
  item: {
    id: number;
    company_id: number;
    employee_id: number;
    requested_days?: unknown;
    approved_days?: unknown;
    payable_amount?: unknown;
    currency?: string | null;
    reviewer_comments?: string | null;
    payroll_period_code?: string | null;
    source?: string | null;
  },
  extra: { senderCompanyUserId?: number | null; reason?: string | null } = {},
): LifecycleInput {
  const amount =
    item.payable_amount != null && item.payable_amount !== ''
      ? ` (${item.currency ?? ''} ${Number(item.payable_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`.replace(
          '( ',
          '(',
        )
      : '';
  const days = daysText(item.approved_days ?? item.requested_days);
  const text: Record<typeof stage, [string, string, boolean]> = {
    requested: [
      'Leave encashment requested',
      `A leave encashment of ${days} was requested and is waiting for review.`,
      true,
    ],
    approved: [
      'Leave encashment approved',
      `Your leave encashment of ${days}${amount} was approved.`,
      false,
    ],
    rejected: [
      'Leave encashment rejected',
      `Your leave encashment request was rejected${item.reviewer_comments ? `: ${item.reviewer_comments}` : '.'}`,
      false,
    ],
    submitted_to_payroll: [
      'Leave encashment sent to payroll',
      `Your leave encashment of ${days}${amount} was sent to payroll${item.payroll_period_code ? ` for ${item.payroll_period_code}` : ''}. It is paid when that payroll is paid.`,
      false,
    ],
    paid: [
      'Leave encashment paid',
      `Your leave encashment of ${days}${amount} has been paid through payroll.`,
      false,
    ],
    payment_failed: [
      'Leave encashment payment failed',
      `The payroll payment of leave encashment #${item.id}${amount} failed and needs HR attention.`,
      true,
    ],
    reversed: [
      'Leave encashment reversed',
      `Leave encashment #${item.id} was reversed and ${days} returned to the balance${extra.reason ? `: ${extra.reason}` : '.'}`,
      true,
    ],
  };
  const [title, message, notifyHr] = text[stage];
  return {
    companyId: item.company_id,
    eventKey: `leave.encashment.${stage}`,
    title,
    message,
    employeeId: item.employee_id,
    notifyHr,
    senderCompanyUserId: extra.senderCompanyUserId ?? null,
    entityType: 'LEAVE_ENCASHMENT',
    entityId: item.id,
    actionUrl: '/dashboard/leave-management',
    dedupeKey: `leave-encashment:${item.id}:${stage}`,
    priority: stage === 'payment_failed' ? 'high' : 'medium',
    metadata: { encashment_id: item.id, source: item.source ?? null },
  };
}
