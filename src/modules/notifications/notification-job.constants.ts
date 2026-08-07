import type { SendConfiguredSmsInput } from '../sms/sms-notification-management.service';

export const NOTIFICATION_QUEUE = 'notification-delivery';

export enum NotificationJobName {
  PROCESS_OUTBOX_EVENT = 'process-outbox-event',
  SEND_MAIL_METHOD = 'send-mail-method',
  SEND_SMS_NOTIFICATION = 'send-sms-notification',
}

export type NotificationOutboxJobData = {
  outboxEventId: number;
};

export type NotificationMailJobData = {
  method: string;
  args: unknown[];
  mailLogId?: number;
};

export type NotificationSmsJobData = {
  input: SendConfiguredSmsInput;
};

export type NotificationJobData =
  | NotificationOutboxJobData
  | NotificationMailJobData
  | NotificationSmsJobData;
