import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { UpdateAttendanceAlertEmailPreferenceDto } from './dto/update-attendance-alert-email-preference.dto';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { NotificationPreference } from './entities/notification-preference.entity';
import { isNotificationChannelSupported } from './notification-channel-policy';

export const MANDATORY_NOTIFICATION_TYPES: ReadonlySet<NotificationTypeEnum> =
  new Set<NotificationTypeEnum>([
    NotificationTypeEnum.AUTH_SECURITY,
    NotificationTypeEnum.ACCESS_CHANGE,
    NotificationTypeEnum.SYSTEM_ALERT,
  ]);

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
  ) {}

  async findMine(companyMembershipId: number) {
    const preferences = await this.preferenceRepository.find({
      where: { companyMembershipId },
      order: { notificationType: 'ASC', channel: 'ASC' },
    });

    return preferences;
  }

  async setPreference(
    companyMembershipId: number,
    notificationType: NotificationTypeEnum,
    channel: NotificationChannelEnum,
    isEnabled: boolean,
  ) {
    if (
      !isEnabled &&
      MANDATORY_NOTIFICATION_TYPES.has(notificationType) &&
      channel === NotificationChannelEnum.IN_APP
    ) {
      throw new BadRequestException(
        `Notification type ${notificationType} cannot be disabled for the in-app channel`,
      );
    }

    let preference = await this.preferenceRepository.findOne({
      where: { companyMembershipId, notificationType, channel },
    });

    if (!preference) {
      preference = this.preferenceRepository.create({
        companyMembershipId,
        notificationType,
        channel,
        isEnabled,
      });
    } else {
      preference.isEnabled = isEnabled;
    }

    return this.preferenceRepository.save(preference);
  }

  async getAttendanceAlertEmailPreference(
    companyId: number,
    companyUserId: number,
  ) {
    await this.assertCompanyMember(companyId, companyUserId);

    const preferences = await this.preferenceRepository.find({
      where: [
        {
          companyMembershipId: companyUserId,
          notificationType: NotificationTypeEnum.ATTENDANCE_LATE,
          channel: NotificationChannelEnum.EMAIL,
        },
        {
          companyMembershipId: companyUserId,
          notificationType: NotificationTypeEnum.ATTENDANCE_MISSING,
          channel: NotificationChannelEnum.EMAIL,
        },
      ],
    });
    const isEnabled = (type: NotificationTypeEnum) =>
      preferences.find((preference) => preference.notificationType === type)
        ?.isEnabled ?? true;

    return {
      company_user_id: companyUserId,
      late: isEnabled(NotificationTypeEnum.ATTENDANCE_LATE),
      absent: isEnabled(NotificationTypeEnum.ATTENDANCE_MISSING),
    };
  }

  async updateAttendanceAlertEmailPreference(
    companyId: number,
    companyUserId: number,
    dto: UpdateAttendanceAlertEmailPreferenceDto,
  ) {
    if (dto.late === undefined && dto.absent === undefined) {
      throw new BadRequestException('Provide late and/or absent');
    }

    await this.assertCompanyMember(companyId, companyUserId);

    if (dto.late !== undefined) {
      await this.setPreference(
        companyUserId,
        NotificationTypeEnum.ATTENDANCE_LATE,
        NotificationChannelEnum.EMAIL,
        dto.late,
      );
    }
    if (dto.absent !== undefined) {
      await this.setPreference(
        companyUserId,
        NotificationTypeEnum.ATTENDANCE_MISSING,
        NotificationChannelEnum.EMAIL,
        dto.absent,
      );
    }

    return this.getAttendanceAlertEmailPreference(companyId, companyUserId);
  }

  async updateAttendanceAlertEmailPreferenceForCompany(
    companyId: number,
    dto: UpdateAttendanceAlertEmailPreferenceDto,
  ) {
    if (dto.late === undefined && dto.absent === undefined) {
      throw new BadRequestException('Provide late and/or absent');
    }

    const members = await this.companyUserRepository.find({
      select: { id: true },
      where: { company_id: companyId },
    });
    const updates: Array<[NotificationTypeEnum, boolean]> = [];
    if (dto.late !== undefined) {
      updates.push([NotificationTypeEnum.ATTENDANCE_LATE, dto.late]);
    }
    if (dto.absent !== undefined) {
      updates.push([NotificationTypeEnum.ATTENDANCE_MISSING, dto.absent]);
    }

    const rows = members.flatMap((member) =>
      updates.map(([notificationType, isEnabled]) => ({
        companyMembershipId: member.id,
        notificationType,
        channel: NotificationChannelEnum.EMAIL,
        isEnabled,
      })),
    );
    if (rows.length) {
      await this.preferenceRepository.upsert(rows, [
        'companyMembershipId',
        'notificationType',
        'channel',
      ]);
    }

    return {
      updated_users: members.length,
      ...(dto.late !== undefined ? { late: dto.late } : {}),
      ...(dto.absent !== undefined ? { absent: dto.absent } : {}),
    };
  }

  private async assertCompanyMember(companyId: number, companyUserId: number) {
    const exists = await this.companyUserRepository.exists({
      where: { id: companyUserId, company_id: companyId },
    });
    if (!exists) {
      throw new NotFoundException('Company user not found.');
    }
  }

  async filterEnabledChannels(
    companyMembershipId: number,
    notificationType: NotificationTypeEnum,
    channels: NotificationChannelEnum[],
  ): Promise<NotificationChannelEnum[]> {
    if (!channels.length) {
      return channels;
    }

    const supportedChannels = channels.filter(isNotificationChannelSupported);

    if (!supportedChannels.length) {
      return supportedChannels;
    }

    const preferences = await this.preferenceRepository.find({
      where: { companyMembershipId, notificationType },
    });

    const disabled = new Set(
      preferences
        .filter((preference) => !preference.isEnabled)
        .map((preference) => preference.channel),
    );

    return supportedChannels.filter(
      (channel) =>
        MANDATORY_NOTIFICATION_TYPES.has(notificationType) ||
        !disabled.has(channel),
    );
  }
}
