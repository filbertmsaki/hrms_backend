import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  LocationPrivacyAcknowledgement,
  LocationPrivacyNotice,
} from './entities/location-privacy.entities';

@Injectable()
export class LocationPrivacyService {
  constructor(
    @InjectRepository(LocationPrivacyNotice)
    private readonly notices: Repository<LocationPrivacyNotice>,
    @InjectRepository(LocationPrivacyAcknowledgement)
    private readonly acknowledgements: Repository<LocationPrivacyAcknowledgement>,
    private readonly dataSource: DataSource,
  ) {}

  async current(companyId: number, employeeId: number) {
    const notice = await this.activeNotice(companyId);
    if (!notice) return { notice: null, acknowledged: true };
    const acknowledgement = await this.acknowledgements.findOne({
      where: { companyId, employeeId, noticeId: notice.id },
    });
    return {
      notice: this.publicNotice(notice),
      acknowledged: Boolean(acknowledgement),
      acknowledgement: acknowledgement
        ? {
            acknowledged_at: acknowledgement.acknowledgedAt,
            demo: acknowledgement.demoAcknowledgement,
          }
        : null,
    };
  }

  async acknowledge(user: AuthenticatedUser, noticeId: number) {
    if (!user.employeeId || !user.companyId) {
      throw new ForbiddenException('A linked employee account is required.');
    }
    if (!Number.isSafeInteger(noticeId) || noticeId < 1) {
      throw new BadRequestException('A valid notice id is required.');
    }
    const notice = await this.notices.findOne({
      where: { id: noticeId, companyId: user.companyId, status: 'ACTIVE' },
    });
    if (!notice)
      throw new NotFoundException('Active location notice not found.');
    const existing = await this.acknowledgements.findOne({
      where: { noticeId, employeeId: user.employeeId },
    });
    if (existing) return { acknowledged: true, already_acknowledged: true };
    await this.acknowledgements.save(
      this.acknowledgements.create({
        companyId: user.companyId,
        noticeId,
        employeeId: user.employeeId,
        companyUserId: user.companyMembershipId ?? user.id,
        noticeVersion: notice.version,
        demoAcknowledgement: notice.isDemo,
      }),
    );
    return {
      acknowledged: true,
      notice_version: notice.version,
      demo: notice.isDemo,
    };
  }

  async listNotices(companyId: number) {
    return (
      await this.notices.find({
        where: { companyId },
        order: { version: 'DESC' },
      })
    ).map((notice) => this.publicNotice(notice));
  }

  async listAcknowledgements(companyId: number, noticeId: number) {
    const notice = await this.notices.findOne({
      where: { id: noticeId, companyId },
    });
    if (!notice) throw new NotFoundException('Location notice not found.');
    return this.acknowledgements.find({
      where: { companyId, noticeId },
      order: { acknowledgedAt: 'DESC' },
    });
  }

  async publish(
    user: AuthenticatedUser,
    input: {
      title: string;
      body: string;
      requireAcknowledgement?: boolean;
      approvalStatus: 'DEMO_APPROVED' | 'COMPANY_APPROVED';
      approvalReference?: string;
    },
  ) {
    if (!user.companyId)
      throw new ForbiddenException('Company scope is required.');
    const isDemo = input.approvalStatus === 'DEMO_APPROVED';
    if (isDemo) {
      const appEnv = (process.env.APP_ENV ?? '').toLowerCase();
      const dbName = (process.env.DB_NAME ?? '').toLowerCase();
      if (
        appEnv !== 'uat' ||
        !dbName.includes('uat') ||
        dbName.includes('prod')
      ) {
        throw new ForbiddenException(
          'Demo-approved notices may only be published in an isolated UAT environment.',
        );
      }
    } else if (!input.approvalReference?.trim()) {
      throw new BadRequestException(
        'Company approval reference is required for a non-demo notice.',
      );
    }
    const title = input.title?.trim();
    const body = input.body?.trim();
    if (!title || title.length > 160 || !body || body.length < 30) {
      throw new BadRequestException(
        'Provide a title (up to 160 characters) and notice text of at least 30 characters.',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LocationPrivacyNotice);
      const latest = await repository.findOne({
        where: { companyId: user.companyId },
        order: { version: 'DESC' },
      });
      await repository.update(
        { companyId: user.companyId, status: 'ACTIVE' },
        { status: 'SUPERSEDED' },
      );
      const notice = await repository.save(
        repository.create({
          companyId: user.companyId!,
          version: (latest?.version ?? 0) + 1,
          title,
          body,
          status: 'ACTIVE',
          requireAcknowledgement: input.requireAcknowledgement !== false,
          approvalStatus: input.approvalStatus,
          isDemo,
          approvalReference: isDemo
            ? 'UAT-DEMO-ONLY'
            : input.approvalReference!.trim(),
          approvedByCompanyUserId: user.companyMembershipId ?? user.id,
          approvedAt: new Date(),
        }),
      );
      return this.publicNotice(notice);
    });
  }

  async assertAcknowledged(companyId: number, employeeId: number) {
    const notice = await this.activeNotice(companyId);
    if (!notice?.requireAcknowledgement) return;
    const acknowledgement = await this.acknowledgements.findOne({
      where: { companyId, employeeId, noticeId: notice.id },
    });
    if (!acknowledgement) {
      throw new ConflictException({
        code: 'LOCATION_PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
        message:
          'Review and acknowledge your company location privacy notice before using location-enabled attendance or field visits.',
        notice_id: notice.id,
        notice_version: notice.version,
      });
    }
  }

  private activeNotice(companyId: number) {
    return this.notices.findOne({
      where: { companyId, status: 'ACTIVE' },
      order: { version: 'DESC' },
    });
  }

  private publicNotice(notice: LocationPrivacyNotice) {
    return {
      id: notice.id,
      company_id: notice.companyId,
      version: notice.version,
      title: notice.title,
      body: notice.body,
      status: notice.status,
      require_acknowledgement: notice.requireAcknowledgement,
      approval_status: notice.approvalStatus,
      demo: notice.isDemo,
      approval_reference: notice.approvalReference,
      published_at: notice.publishedAt,
    };
  }
}
