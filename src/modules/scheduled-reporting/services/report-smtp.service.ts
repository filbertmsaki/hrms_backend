import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import nodemailer from 'nodemailer';
import { Repository } from 'typeorm';
import {
  applyMailRecipientSafety,
  resolveMailRecipientSafetyConfigFromConfigService,
  type SafeSendMailOptions,
} from '../../mail/mail-recipient-safety.util';
import { ReportSmtpSecurityTypeEnum } from '../enums/report-smtp-security-type.enum';
import { ReportSmtpTestStatusEnum } from '../enums/report-smtp-test-status.enum';
import { ReportSmtpConfiguration } from '../entities/report-smtp-configuration.entity';
import { decryptReportSmtpSecret } from '../utils/report-smtp-secret.util';

type SmtpDraftInput = {
  name: string;
  host: string;
  port: number;
  securityType?: ReportSmtpSecurityTypeEnum;
  username?: string | null;
  password?: string | null;
  senderName?: string | null;
  senderEmail: string;
  replyToEmail?: string | null;
  connectionTimeoutMs?: number;
};

type NormalizedSmtpDraft = {
  host: string;
  port: number;
  securityType: ReportSmtpSecurityTypeEnum;
  username: string | null;
  password: string | null;
  senderName: string | null;
  senderEmail: string;
  replyToEmail: string | null;
  connectionTimeoutMs: number;
};

type SmtpTestTokenPayload = {
  companyId: number;
  fingerprint: string;
  testedAt: string;
  expiresAt: string;
};

export type SmtpTestResult = {
  testedAt: Date;
  messageId: string | null;
  accepted: string[];
  rejected: string[];
  smtpTestToken: string;
  expiresAt: Date;
};

type ReportMailTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  ignoreTLS: boolean;
  requireTLS: boolean;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  auth?: {
    user: string;
    pass: string;
  };
};

type ReportMailSendResult = {
  accepted?: string[];
  rejected?: string[];
  response?: string;
  messageId?: string;
};

type ReportMailSendOptions = SafeSendMailOptions & {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

type ReportMailTransporter = {
  verify(): Promise<void>;
  sendMail(options: ReportMailSendOptions): Promise<ReportMailSendResult>;
};

type NodemailerModule = {
  createTransport(options: ReportMailTransportOptions): ReportMailTransporter;
};

const typedNodemailer = nodemailer as unknown as NodemailerModule;

@Injectable()
export class ReportSmtpService {
  private readonly logger = new Logger(ReportSmtpService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ReportSmtpConfiguration)
    private readonly smtpConfigurationRepository: Repository<ReportSmtpConfiguration>,
  ) {}

  async sendCompanyEmail(
    companyId: number,
    input: {
      to: string;
      subject: string;
      text: string;
      html?: string;
      sourceModule: string;
    },
  ): Promise<{
    messageId: string | null;
    configurationId: number;
    configurationName: string;
  }> {
    const configuration = await this.smtpConfigurationRepository.findOne({
      where: {
        companyId,
        isDefault: true,
        isActive: true,
        lastTestStatus: ReportSmtpTestStatusEnum.SUCCESS,
      },
      order: { updatedAt: 'DESC' },
    });

    if (!configuration) {
      throw new BadRequestException(
        'No active, tested default SMTP configuration is available. Configure and test one on the SMTP page first.',
      );
    }

    const password = decryptReportSmtpSecret(configuration.encryptedPassword);
    if (configuration.username && !password) {
      throw new BadRequestException(
        'The default SMTP configuration has no usable password. Update and test it on the SMTP page.',
      );
    }

    const transporter = typedNodemailer.createTransport({
      host: configuration.host,
      port: configuration.port,
      secure: configuration.securityType === ReportSmtpSecurityTypeEnum.SSL_TLS,
      ignoreTLS: configuration.securityType === ReportSmtpSecurityTypeEnum.NONE,
      requireTLS:
        configuration.securityType === ReportSmtpSecurityTypeEnum.STARTTLS,
      connectionTimeout: configuration.connectionTimeoutMs,
      greetingTimeout: configuration.connectionTimeoutMs,
      socketTimeout: configuration.connectionTimeoutMs,
      auth: configuration.username
        ? { user: configuration.username, pass: password ?? '' }
        : undefined,
    });
    const mailOptions: ReportMailSendOptions = {
      from: `"${configuration.senderName || configuration.name}" <${configuration.senderEmail}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: configuration.replyToEmail ?? undefined,
      mailSafetyContext: { sourceModule: input.sourceModule },
    };
    applyMailRecipientSafety(
      mailOptions,
      resolveMailRecipientSafetyConfigFromConfigService(this.configService),
      this.logger,
    );

    try {
      const result = await transporter.sendMail(mailOptions);
      return {
        messageId: result.messageId ?? null,
        configurationId: configuration.id,
        configurationName: configuration.name,
      };
    } catch (error) {
      throw new BadRequestException(this.toSafeErrorMessage(error));
    }
  }

  async testDraftConfiguration(
    companyId: number,
    testedByLabel: string,
    input: SmtpDraftInput,
    testRecipientEmail?: string | null,
    sendTestEmail = true,
  ): Promise<SmtpTestResult> {
    const normalized = this.normalizeDraft(input);
    if (normalized.username && !normalized.password) {
      throw new BadRequestException(
        'SMTP password is required when an SMTP username is provided.',
      );
    }

    const transporter = typedNodemailer.createTransport({
      host: normalized.host,
      port: normalized.port,
      secure: normalized.securityType === ReportSmtpSecurityTypeEnum.SSL_TLS,
      ignoreTLS: normalized.securityType === ReportSmtpSecurityTypeEnum.NONE,
      requireTLS:
        normalized.securityType === ReportSmtpSecurityTypeEnum.STARTTLS,
      connectionTimeout: normalized.connectionTimeoutMs,
      greetingTimeout: normalized.connectionTimeoutMs,
      socketTimeout: normalized.connectionTimeoutMs,
      auth: normalized.username
        ? {
            user: normalized.username,
            pass: normalized.password ?? '',
          }
        : undefined,
    });

    try {
      await transporter.verify();

      const testedAt = new Date();
      let result: ReportMailSendResult | null = null;
      if (sendTestEmail) {
        const recipient = testRecipientEmail?.trim() || normalized.senderEmail;
        const mailOptions: ReportMailSendOptions = {
          from: `"${normalized.senderName || input.name.trim()}" <${normalized.senderEmail}>`,
          to: recipient,
          subject: 'Scheduled Reporting SMTP Test',
          text: [
            'SMTP Configuration Test Successful',
            '',
            `Application: ${this.configService.get<string>('APP_NAME') ?? 'HRMS'}`,
            `Environment: ${this.configService.get<string>('APP_ENV') ?? this.configService.get<string>('NODE_ENV') ?? 'unknown'}`,
            `Tested By: ${testedByLabel}`,
            `Tested At: ${testedAt.toISOString()}`,
            `SMTP Host: ${this.maskHost(normalized.host)}`,
          ].join('\n'),
          replyTo: normalized.replyToEmail ?? undefined,
          mailSafetyContext: {
            sourceModule:
              'ScheduledReportingService.testDraftSmtpConfiguration',
          },
        };
        applyMailRecipientSafety(
          mailOptions,
          resolveMailRecipientSafetyConfigFromConfigService(this.configService),
          this.logger,
        );

        result = await transporter.sendMail(mailOptions);
      }
      const expiresAt = new Date(testedAt.getTime() + 15 * 60 * 1000);

      return {
        testedAt,
        messageId: result?.messageId ?? null,
        accepted: result?.accepted ?? [],
        rejected: result?.rejected ?? [],
        smtpTestToken: this.signToken({
          companyId,
          fingerprint: this.buildFingerprint(companyId, normalized),
          testedAt: testedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }),
        expiresAt,
      };
    } catch (error) {
      const safeMessage = this.toSafeErrorMessage(error);
      const diagnostics = this.formatErrorDiagnostics(error);
      this.logger.warn(
        `SMTP draft test failed for company ${companyId}: ${safeMessage}${diagnostics ? ` (${diagnostics})` : ''}`,
      );
      throw new BadRequestException(safeMessage);
    }
  }

  verifyProofOrThrow(
    companyId: number,
    smtpTestToken: string | null | undefined,
    input: SmtpDraftInput,
  ) {
    if (!smtpTestToken?.trim()) {
      throw new BadRequestException(
        'smtpTestToken is required before saving or activating an SMTP configuration.',
      );
    }

    const [encodedPayload, providedSignature] = smtpTestToken.split('.');
    if (!encodedPayload || !providedSignature) {
      throw new UnauthorizedException('Invalid smtpTestToken.');
    }

    const expectedSignature = this.sign(encodedPayload);
    if (providedSignature.length !== expectedSignature.length) {
      throw new UnauthorizedException('Invalid smtpTestToken signature.');
    }
    if (
      !timingSafeEqual(
        Buffer.from(providedSignature),
        Buffer.from(expectedSignature),
      )
    ) {
      throw new UnauthorizedException('Invalid smtpTestToken signature.');
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as SmtpTestTokenPayload;
    const now = Date.now();
    if (payload.companyId !== companyId) {
      throw new UnauthorizedException(
        'smtpTestToken does not belong to this company.',
      );
    }

    if (!payload.expiresAt || new Date(payload.expiresAt).getTime() < now) {
      throw new UnauthorizedException(
        'smtpTestToken has expired. Please retest the SMTP configuration.',
      );
    }

    const expectedFingerprint = this.buildFingerprint(
      companyId,
      this.normalizeDraft(input),
    );
    if (payload.fingerprint !== expectedFingerprint) {
      throw new UnauthorizedException(
        'SMTP configuration changed after testing. Please retest before saving.',
      );
    }
  }

  normalizeDraft(input: SmtpDraftInput): NormalizedSmtpDraft {
    return {
      host: input.host.trim(),
      port: Number(input.port),
      securityType: input.securityType ?? ReportSmtpSecurityTypeEnum.STARTTLS,
      username: input.username?.trim() || null,
      password: input.password?.trim() || null,
      senderName: input.senderName?.trim() || null,
      senderEmail: input.senderEmail.trim().toLowerCase(),
      replyToEmail: input.replyToEmail?.trim().toLowerCase() || null,
      connectionTimeoutMs: input.connectionTimeoutMs ?? 10000,
    };
  }

  private buildFingerprint(
    companyId: number,
    normalized: NormalizedSmtpDraft,
  ): string {
    return createHmac('sha256', this.getSigningSecret())
      .update(
        JSON.stringify({
          companyId,
          ...normalized,
          host: normalized.host.toLowerCase(),
        }),
      )
      .digest('hex');
  }

  private signToken(payload: SmtpTestTokenPayload): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.getSigningSecret())
      .update(value)
      .digest('base64url');
  }

  private getSigningSecret(): string {
    return (
      this.configService.get<string>('APP_KEY') ??
      this.configService.get<string>('JWT_ACCESS_SECRET') ??
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.configService.get<string>('JWT_RESET_SECRET') ??
      'scheduled-reporting-smtp-proof-fallback'
    );
  }

  private maskHost(host: string): string {
    const normalized = host.trim();
    if (!normalized) {
      return '(unknown)';
    }

    const [first, ...rest] = normalized.split('.');
    if (!rest.length) {
      return `${first.slice(0, 2)}***`;
    }

    return `${first.slice(0, 2)}***.${rest.join('.')}`;
  }

  toSafeErrorMessage(error: unknown): string {
    const nestedMessage = this.extractExceptionMessage(error);
    if (nestedMessage) {
      return nestedMessage;
    }

    if (!(error instanceof Error)) {
      return 'SMTP validation failed.';
    }

    const code = (error as Error & { code?: string }).code?.toUpperCase();
    const message = error.message.toLowerCase();

    if (code === 'EAUTH' || message.includes('auth')) {
      return 'SMTP authentication failed. Please verify the username and password.';
    }

    if (code === 'ECONNECTION' || code === 'ECONNREFUSED') {
      return 'SMTP connection was refused by the remote server.';
    }

    if (code === 'ETIMEDOUT' || message.includes('timed out')) {
      return 'SMTP connection timed out before the server responded.';
    }

    if (code === 'ESOCKET' || message.includes('tls')) {
      return 'SMTP TLS or SSL negotiation failed. Please verify the encryption settings.';
    }

    if (message.includes('getaddrinfo') || message.includes('enotfound')) {
      return 'SMTP host could not be resolved. Please verify the SMTP host name.';
    }

    if (message.includes('invalid login') || message.includes('username')) {
      return 'SMTP username or password is invalid.';
    }

    if (message.includes('sender') || message.includes('from')) {
      return 'The sender email address is not permitted by the mail provider.';
    }

    if (message.includes('recipient') || message.includes('mailbox')) {
      return 'The SMTP test recipient was rejected by the mail provider.';
    }

    return 'SMTP validation failed. Please review the SMTP host, port, security, sender, and authentication settings.';
  }

  private extractExceptionMessage(error: unknown): string | null {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('getResponse' in error) ||
      typeof error.getResponse !== 'function'
    ) {
      return null;
    }

    const getResponse = error.getResponse as () =>
      | string
      | { message?: string | string[] }
      | undefined;
    const response = getResponse();

    if (typeof response === 'string' && response.trim()) {
      return response.trim();
    }

    if (
      response &&
      typeof response === 'object' &&
      Array.isArray(response.message)
    ) {
      const firstMessage = response.message.find(
        (message) => typeof message === 'string' && message.trim(),
      );
      return firstMessage?.trim() || null;
    }

    if (
      response &&
      typeof response === 'object' &&
      typeof response.message === 'string' &&
      response.message.trim()
    ) {
      return response.message.trim();
    }

    return null;
  }

  private formatErrorDiagnostics(error: unknown): string | null {
    if (!(error instanceof Error)) {
      return null;
    }

    const details = [
      ['name', error.name],
      ['code', String((error as Error & { code?: string }).code ?? '')],
      [
        'command',
        String((error as Error & { command?: string }).command ?? ''),
      ],
      [
        'response',
        String((error as Error & { response?: string }).response ?? ''),
      ],
      ['message', error.message],
    ].filter(([, value]) => value.trim());

    if (!details.length) {
      return null;
    }

    return details.map(([key, value]) => `${key}=${value}`).join(', ');
  }
}
