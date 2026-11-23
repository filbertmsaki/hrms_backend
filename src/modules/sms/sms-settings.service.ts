import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  activeFieldKeyVersion,
  decryptField,
  encryptField,
} from '../../common/crypto/field-encryption';
import { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { SecurityEventOutcome } from '../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../security/enums/security-event-type.enum';
import { SecurityEventsService } from '../security/security-events.service';
import { UpdateSmsGatewayDto } from './dto/sms-gateway.dto';
import { SmsGlobalSetting } from './entities/sms-global-setting.entity';

export const GLOBAL_SMS_SETTING_KEY = 'GLOBAL_SMS_NOTIFICATIONS_ENABLED';
const GATEWAY_KEY = 'SMS_GATEWAY';
const PASSWORD_CONTEXT = 'platform.sms.gateway.password';
const companyKey = (id: number) => 'COMPANY_SMS:' + id;

export class SmsDeliveryDisabledError extends Error {}

@Injectable()
export class SmsSettingsService {
  constructor(
    @InjectRepository(SmsGlobalSetting)
    private readonly settings: Repository<SmsGlobalSetting>,
    private readonly config: ConfigService,
    private readonly audit: SecurityEventsService,
  ) {}

  async switches(companyId: number | null) {
    const keys =
      companyId === null
        ? [GLOBAL_SMS_SETTING_KEY]
        : [GLOBAL_SMS_SETTING_KEY, companyKey(companyId)];
    const rows = await this.settings.findBy({ key: In(keys) });
    const platformEnabled =
      rows.find((row) => row.key === GLOBAL_SMS_SETTING_KEY)?.isEnabled ??
      false;
    // Before company switches existed, the platform setting applied to every company.
    const companyEnabled =
      rows.find(
        (row) => companyId !== null && row.key === companyKey(companyId),
      )?.isEnabled ?? true;
    return {
      key: companyId === null ? GLOBAL_SMS_SETTING_KEY : companyKey(companyId),
      isEnabled: companyId === null ? platformEnabled : companyEnabled,
      platformEnabled,
      companyEnabled,
      effectiveEnabled: platformEnabled && companyEnabled,
      description:
        companyId === null
          ? 'Controls SMS delivery across the platform.'
          : 'Controls SMS delivery for this company.',
    };
  }

  async setSwitch(
    companyId: number | null,
    enabled: boolean,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
  ) {
    const key =
      companyId === null ? GLOBAL_SMS_SETTING_KEY : companyKey(companyId);
    await this.settings.upsert(
      {
        key,
        isEnabled: enabled,
        updatedByCompanyUserId: actor.companyMembershipId ?? null,
      },
      ['key'],
    );
    await this.audit.logBestEffort({
      eventType: SecurityEventType.CONFIGURATION_CHANGED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      context,
      resourceType: 'sms_global_setting',
      resourceId: key,
      newValues: { is_enabled: enabled },
    });
    return this.switches(companyId);
  }

  private approvedEndpoints() {
    const endpoints = [
      this.config.get<string>('SMS_GATEWAY_URL', ''),
      ...this.config.get<string>('SMS_GATEWAY_ALLOWED_URLS', '').split(','),
    ];
    return [
      ...new Set(
        endpoints
          .map((v) => v.trim())
          .filter((v) => {
            try {
              const u = new URL(v);
              return (
                ['https:', 'http:'].includes(u.protocol) &&
                !u.username &&
                !u.password &&
                !u.hash &&
                !u.search
              );
            } catch {
              return false;
            }
          }),
      ),
    ];
  }

  private readGateway(repo = this.settings) {
    return repo
      .createQueryBuilder('setting')
      .addSelect('setting.gateway')
      .where('setting.key = :key', { key: GATEWAY_KEY })
      .getOne();
  }

  private gatewayValues(row: SmsGlobalSetting | null) {
    const saved = row?.gateway;
    const envEndpoint = this.config.get<string>('SMS_GATEWAY_URL', '').trim();
    const envUser = this.config.get<string>('SMS_GATEWAY_USERNAME', '').trim();
    const endpoint = saved?.endpoint ?? envEndpoint;
    const username = saved?.username ?? envUser;
    return {
      enabled:
        row?.isEnabled ??
        this.config.get<boolean>('SMS_GATEWAY_ENABLED', false),
      endpoint,
      username,
      shortcode:
        saved?.shortcode ??
        this.config.get<string>('SMS_GATEWAY_SHORTCODE', '').trim(),
      channel:
        saved?.channel ??
        this.config.get<string>('SMS_GATEWAY_CHANNEL', '').trim(),
      passwordCiphertext: saved?.passwordCiphertext ?? null,
      environmentPassword:
        endpoint === envEndpoint && username === envUser
          ? this.config.get<string>('SMS_GATEWAY_PASSWORD', '')
          : '',
    };
  }

  async gatewayStatus() {
    const row = await this.readGateway();
    const { passwordCiphertext, environmentPassword, ...fields } =
      this.gatewayValues(row);
    return {
      ...fields,
      password_configured: Boolean(passwordCiphertext || environmentPassword),
      approved_endpoints: this.approvedEndpoints(),
      source: row?.gateway ? 'platform' : 'installation',
      password_storage_ready: Boolean(activeFieldKeyVersion()),
    };
  }

  async updateGateway(
    input: UpdateSmsGatewayDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
  ) {
    const endpoint = input.endpoint.trim();
    const username = input.username.trim();
    const shortcode = input.shortcode.trim();
    if (!this.approvedEndpoints().includes(endpoint))
      throw new BadRequestException('Choose an approved provider endpoint.');
    if (!username || !shortcode)
      throw new BadRequestException(
        'Enter the provider account and sender short code.',
      );
    await this.settings.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(674321098)');
      const repository = manager.getRepository(SmsGlobalSetting);
      const old = this.gatewayValues(await this.readGateway(repository));
      const sameAccount =
        old.endpoint === endpoint && old.username === username;
      if (
        !input.password &&
        (!sameAccount || !(old.passwordCiphertext || old.environmentPassword))
      )
        throw new BadRequestException(
          'Enter the password for this provider account.',
        );
      if (input.password && !activeFieldKeyVersion())
        throw new ServiceUnavailableException(
          'Configure the installation field-encryption key to store a gateway password.',
        );
      const passwordCiphertext = input.password
        ? encryptField(input.password, PASSWORD_CONTEXT)
        : old.passwordCiphertext;
      await repository.upsert(
        {
          key: GATEWAY_KEY,
          isEnabled: input.enabled,
          updatedByCompanyUserId: actor.companyMembershipId ?? null,
          gateway: {
            endpoint,
            username,
            shortcode,
            channel: input.channel.trim(),
            passwordCiphertext,
          },
        },
        ['key'],
      );
    });
    await this.audit.logBestEffort({
      eventType: SecurityEventType.CONFIGURATION_CHANGED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      context,
      resourceType: 'sms_gateway',
      resourceId: GATEWAY_KEY,
      newValues: {
        enabled: input.enabled,
        shortcode,
        password_updated: Boolean(input.password),
      },
    });
    return this.gatewayStatus();
  }

  async deliveryGateway(companyId: number | null) {
    const switches = await this.switches(companyId);
    if (!switches.platformEnabled)
      throw new SmsDeliveryDisabledError('Platform SMS is off.');
    if (!switches.companyEnabled)
      throw new SmsDeliveryDisabledError('Company SMS is off.');
    const gateway = this.gatewayValues(await this.readGateway());
    if (!gateway.enabled)
      throw new SmsDeliveryDisabledError('SMS gateway is disabled.');
    if (
      !this.approvedEndpoints().includes(gateway.endpoint) ||
      !gateway.username ||
      !gateway.shortcode ||
      !(gateway.passwordCiphertext || gateway.environmentPassword)
    )
      throw new SmsDeliveryDisabledError(
        'SMS gateway is not fully configured.',
      );
    const password = gateway.passwordCiphertext
      ? decryptField(gateway.passwordCiphertext, PASSWORD_CONTEXT)
      : gateway.environmentPassword;
    return {
      url: gateway.endpoint,
      username: gateway.username,
      password,
      shortcode: gateway.shortcode,
      channel: gateway.channel,
      timeoutMs: this.config.get<number>('SMS_GATEWAY_TIMEOUT_MS', 10000),
    };
  }
}
