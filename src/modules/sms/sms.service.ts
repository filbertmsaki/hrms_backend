import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import {
  normalizeTanzaniaPhone,
  toSmsGatewayMsisdn,
} from '../../common/utils/tanzania-phone.util';

export type SmsSendResult = {
  reference: string;
  providerCode: string | null;
  providerMessage: string | null;
  rawResponse: string;
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
  });

  constructor(private readonly configService: ConfigService) {}

  getConfigurationError(): string | null {
    const enabled = this.configService.get<boolean>('SMS_GATEWAY_ENABLED', false);
    if (!enabled) {
      return 'SMS gateway is disabled';
    }

    const url = this.configService.get<string>('SMS_GATEWAY_URL', '').trim();
    const username = this.configService
      .get<string>('SMS_GATEWAY_USERNAME', '')
      .trim();
    const password = this.configService
      .get<string>('SMS_GATEWAY_PASSWORD', '')
      .trim();
    const shortcode = this.configService
      .get<string>('SMS_GATEWAY_SHORTCODE', '')
      .trim();

    if (!url || !username || !password || !shortcode) {
      return 'SMS gateway is not fully configured';
    }

    return null;
  }

  isConfigured(): boolean {
    return this.getConfigurationError() === null;
  }

  async sendGenericNotificationSms(
    phone: string,
    title: string,
    message: string,
    actionUrl?: string | null,
  ): Promise<SmsSendResult> {
    const smsMessage = this.composeMessage(title, message, actionUrl);
    return this.sendTextSms(phone, smsMessage);
  }

  async sendTextSms(
    phone: string,
    smsMessage: string,
  ): Promise<SmsSendResult> {
    const configurationError = this.getConfigurationError();
    if (configurationError) {
      throw new Error(configurationError);
    }

    const url = this.configService.getOrThrow<string>('SMS_GATEWAY_URL');
    const username = this.configService.getOrThrow<string>(
      'SMS_GATEWAY_USERNAME',
    );
    const password = this.configService.getOrThrow<string>(
      'SMS_GATEWAY_PASSWORD',
    );
    const shortcode = this.configService.getOrThrow<string>(
      'SMS_GATEWAY_SHORTCODE',
    );
    const channel = this.configService.get<string>('SMS_GATEWAY_CHANNEL', '');
    const timeoutMs = this.configService.get<number>(
      'SMS_GATEWAY_TIMEOUT_MS',
      10000,
    );
    const reference = String(Date.now());
    const normalizedPhone = normalizeTanzaniaPhone(phone);
    if (!normalizedPhone) {
      throw new Error(
        'Phone number must be a valid Tanzanian number in +255 format',
      );
    }
    const gatewayMsisdn = toSmsGatewayMsisdn(normalizedPhone);

    const response = await axios.get<string>(url, {
      params: {
        message: smsMessage,
        msisdn: gatewayMsisdn,
        channel,
        shortcode,
        reference,
        username,
        password,
      },
      timeout: timeoutMs,
      responseType: 'text',
      transformResponse: [(data) => data],
    });

    const rawResponse =
      typeof response.data === 'string'
        ? response.data.trim()
        : String(response.data ?? '').trim();

    if (!rawResponse) {
      throw new Error('SMS gateway returned an empty response');
    }

    const parsed = this.parseGatewayResponse(rawResponse);
    const providerCode = parsed.error_code ?? null;
    const providerMessage =
      parsed.message ?? parsed.error_desc ?? parsed.description ?? null;

    if (providerCode !== '200') {
      throw new Error(
        providerMessage
          ? `SMS gateway rejected the request (${providerCode ?? 'unknown'}): ${providerMessage}`
          : `SMS gateway rejected the request (${providerCode ?? 'unknown'})`,
      );
    }

    this.logger.log(
      `SMS sent to ${normalizedPhone}. Reference: ${reference}. Provider code: ${providerCode}.`,
    );

    return {
      reference,
      providerCode,
      providerMessage,
      rawResponse,
    };
  }

  private composeMessage(
    title: string,
    message: string,
    actionUrl?: string | null,
  ): string {
    return [title.trim(), message.trim(), actionUrl?.trim() ?? '']
      .filter((part) => part.length > 0)
      .join('\n');
  }

  private parseGatewayResponse(rawResponse: string): Record<string, string> {
    const sanitized = rawResponse.replace(/<br\s*\/?>/gi, ' ');
    const parsed = this.parser.parse(sanitized) as unknown;
    const flattened = this.flattenFirstObject(parsed);

    return Object.fromEntries(
      Object.entries(flattened).map(([key, value]) => [key, String(value)]),
    );
  }

  private flattenFirstObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return {};
    }

    if (Array.isArray(value)) {
      return this.flattenFirstObject(value[0]);
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const isFlat = keys.every((key) => {
      const item = record[key];
      return item === null || ['string', 'number', 'boolean'].includes(typeof item);
    });

    if (isFlat) {
      return record;
    }

    for (const key of keys) {
      const nested = this.flattenFirstObject(record[key]);
      if (Object.keys(nested).length > 0) {
        return nested;
      }
    }

    return {};
  }
}
