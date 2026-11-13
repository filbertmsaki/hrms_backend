import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppNotification } from '../../notifications/entities/app-notification.entity';
import { MailService } from '../../mail/mail.service';

export type ContractNotice = {
  companyId: number;
  receiverCompanyUserId: number;
  senderCompanyUserId?: number | null;
  contractId: number;
  title: string;
  message: string;
  actionUrl: string;
  dedupeKey: string;
  email?: boolean;
  metadata?: Record<string, unknown>;
};

/** In-app notification plus (optionally) email, de-duplicated per key. */
@Injectable()
export class ContractNotifierService {
  private readonly logger = new Logger(ContractNotifierService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AppNotification)
    private readonly notifications: Repository<AppNotification>,
    @Optional() private readonly mail?: MailService,
  ) {}

  async notify(notice: ContractNotice): Promise<boolean> {
    const existing = await this.notifications.findOneBy({
      company_id: notice.companyId,
      dedupe_key: notice.dedupeKey,
    });
    if (existing) return false;
    await this.notifications.save(
      this.notifications.create({
        company_id: notice.companyId,
        sender_company_user_id: notice.senderCompanyUserId ?? null,
        receiver_company_user_id: notice.receiverCompanyUserId,
        title: notice.title,
        message: notice.message,
        related_module: 'contracts',
        entity_type: 'EMPLOYMENT_CONTRACT',
        entity_id: String(notice.contractId),
        action_url: notice.actionUrl,
        dedupe_key: notice.dedupeKey,
        metadata: { contract_id: notice.contractId, ...notice.metadata },
      }),
    );
    if (notice.email !== false) {
      const recipient = await this.recipient(notice.receiverCompanyUserId);
      if (recipient?.email)
        await this.sendEmail(recipient.email, {
          subject: notice.title,
          heading: notice.title,
          recipientName: recipient.name,
          lines: [notice.message],
          actionPath: notice.actionUrl,
        });
    }
    return true;
  }

  async recipient(
    companyUserId: number,
  ): Promise<{ email: string; name: string } | null> {
    const rows: Array<{ email: string; first_name: string }> =
      await this.dataSource.query(
        `SELECT u.email, u.first_name FROM "company_users" cu
           JOIN "users" u ON u.id = cu.user_id
          WHERE cu.id = $1 LIMIT 1`,
        [companyUserId],
      );
    return rows[0] ? { email: rows[0].email, name: rows[0].first_name } : null;
  }

  async sendEmail(
    to: string,
    notice: Parameters<MailService['sendContractNotice']>[1],
  ) {
    if (!this.mail) return;
    try {
      await this.mail.sendContractNotice(to, notice);
    } catch (error) {
      // Email is best effort; the in-app notification is the record.
      this.logger.warn(
        `Contract email to ${to.replace(/(.).*@/, '$1***@')} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
