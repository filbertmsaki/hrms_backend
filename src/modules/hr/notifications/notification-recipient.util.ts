import { NotificationRecipient } from './events';

type UserLike = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

export const HR_NOTIFICATION_ROLE_NAMES = ['HR_OFFICER', 'HR_MANAGER'] as const;

export function buildNotificationRecipient(
  user: UserLike | null | undefined,
  options?: {
    companyUserId?: number | null;
    employeeId?: number | null;
    branchId?: number | null;
    departmentId?: number | null;
  },
): NotificationRecipient | null {
  const email = user?.email?.trim();
  if (!email) {
    return null;
  }

  const name = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();
  return {
    companyUserId: options?.companyUserId ?? null,
    employeeId: options?.employeeId ?? null,
    branchId: options?.branchId ?? null,
    departmentId: options?.departmentId ?? null,
    name: name || email,
    email,
  };
}
