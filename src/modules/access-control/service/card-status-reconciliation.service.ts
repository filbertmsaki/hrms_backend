import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { HikvisionAccessControlService } from '../../hikvision/hikvision-access-control.service';

export class DeviceReviewRequired extends Error {}
type Card = {
  employeeNo: string;
  cardNo: string;
  status: string;
  type: string;
  employment: string;
};
const object = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
@Injectable()
export class CardStatusReconciliationService {
  constructor(
    private readonly db: DataSource,
    private readonly transport: HikvisionAccessControlService,
  ) {}
  private async read(company: number, device: number, cardNo: string) {
    const searchID = randomUUID();
    let offset = 0,
      total: number | null = null;
    do {
      const read = await this.transport.searchCardInfo(company, device, {
        CardInfoSearchCond: {
          searchID,
          searchResultPosition: offset,
          maxResults: 50,
        },
      });
      if (!read.ok) throw new Error('Card inventory unavailable');
      const body = object(read.parsed);
      const page = object(body?.CardInfoSearch ?? body?.CardInfoSearchResult);
      if (
        !page ||
        !Number.isSafeInteger(page.totalMatches) ||
        Number(page.totalMatches) < 0 ||
        (total !== null && total !== page.totalMatches)
      )
        throw new DeviceReviewRequired(
          'The reader returned an incomplete card inventory.',
        );
      total = Number(page.totalMatches);
      const items: unknown[] = Array.isArray(page.CardInfo)
        ? page.CardInfo
        : page.CardInfo
          ? [page.CardInfo]
          : [];
      if (
        offset + items.length > total ||
        (!items.length && offset < total) ||
        total > 100000
      )
        throw new DeviceReviewRequired(
          'The reader returned an incomplete card inventory.',
        );
      for (const entry of items) {
        const row = object(entry);
        if (
          !row ||
          typeof row.cardNo !== 'string' ||
          typeof row.employeeNo !== 'string'
        )
          throw new DeviceReviewRequired(
            'The reader returned an unidentified card.',
          );
        if (row.cardNo === cardNo) return row;
      }
      offset += items.length;
    } while (offset < total);
    return null;
  }
  async reconcile(
    company: number,
    device: number,
    employee: number,
    id: number,
  ) {
    const [card]: Card[] = await this.db.query(
      `SELECT c.credential_type AS type,c.credential_status AS status,e.employment_status AS employment,a.employee_no AS "employeeNo",c.card_no AS "cardNo"
      FROM employee_access_credentials c JOIN employee_device_assignments a ON a.company_id=c.company_id AND a.device_id=c.device_id AND a.employee_id=c.employee_id AND a.employee_no=c.employee_no AND a.deleted_at IS NULL
      JOIN employees e ON e.id=c.employee_id AND e.company_id=c.company_id
      JOIN attendance_devices d ON d.id=c.device_id AND d.company_id=c.company_id AND upper(d.status::text)='ACTIVE' AND d.deleted_at IS NULL
      WHERE c.company_id=$1 AND c.device_id=$2 AND c.employee_id=$3 AND c.id=$4 AND c.deleted_at IS NULL`,
      [company, device, employee, id],
    );
    if (!card || card.type !== 'CARD' || !card.cardNo || !card.employeeNo)
      throw new DeviceReviewRequired(
        'This credential requires its reader-specific enrollment or revocation procedure.',
      );
    const key = [company, device, id];
    const digest = createHash('sha256')
      .update(JSON.stringify([employee, card.employeeNo, card.cardNo]))
      .digest('hex');
    const [suspension]: Array<{ identity_digest: string }> =
      await this.db.query(
        'SELECT identity_digest FROM access_card_suspensions WHERE company_id=$1 AND device_id=$2 AND credential_id=$3',
        key,
      );
    if (suspension && suspension.identity_digest !== digest)
      throw new DeviceReviewRequired(
        'Card ownership changed after suspension.',
      );
    const match = await this.read(company, device, card.cardNo);
    if (
      match &&
      (match.employeeNo !== card.employeeNo ||
        match.cardType !== 'normalCard' ||
        Object.keys(match).some(
          (key) =>
            !['employeeNo', 'cardNo', 'cardType', 'checkEmployeeNo'].includes(
              key,
            ),
        ))
    )
      throw new DeviceReviewRequired(
        'The card has a different owner or reader-specific configuration.',
      );
    const active = card.status === 'ACTIVE';
    if (active && !['active', 'onboarding'].includes(card.employment))
      throw new DeviceReviewRequired(
        'Review employment eligibility before reactivating a card.',
      );
    if (
      !active &&
      !['INACTIVE', 'LOST', 'BLOCKED', 'DELETED'].includes(card.status)
    )
      throw new DeviceReviewRequired('Review this credential status.');
    if (active && !match) {
      if (!suspension)
        throw new DeviceReviewRequired(
          'Enroll this card explicitly. HRMS has no verified prior registration for it.',
        );
      const write = await this.transport.recordCardInfo(company, device, {
        CardInfo: {
          employeeNo: card.employeeNo,
          cardNo: card.cardNo,
          cardType: 'normalCard',
          checkEmployeeNo: true,
        },
      });
      if (!write.ok) throw new Error('Card registration failed');
      const observed = await this.read(company, device, card.cardNo);
      if (
        observed?.employeeNo !== card.employeeNo ||
        observed.cardType !== 'normalCard'
      )
        throw new Error('Card registration was not verified');
    } else if (!active && match) {
      // Persist known ownership before a write whose response could be lost.
      await this.db.query(
        'INSERT INTO access_card_suspensions(company_id,device_id,credential_id,identity_digest) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [...key, digest],
      );
      const write = await this.transport.deleteCardInfo(company, device, {
        CardInfoDelCond: { CardNoList: [{ cardNo: card.cardNo }] },
      });
      if (!write.ok || (await this.read(company, device, card.cardNo)))
        throw new Error('Card suspension was not verified');
    }
    if (active && suspension)
      await this.db.query(
        'DELETE FROM access_card_suspensions WHERE company_id=$1 AND device_id=$2 AND credential_id=$3',
        key,
      );
  }
}
