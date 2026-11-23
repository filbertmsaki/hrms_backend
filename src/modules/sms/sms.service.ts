import { Injectable, Logger } from '@nestjs/common';
import { SmsSettingsService } from './sms-settings.service';
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

  constructor(private readonly settings: SmsSettingsService) {}

  async sendGenericNotificationSms(
    phone: string,
    title: string,
    message: string,
    actionUrl: string | null | undefined,
    companyId: number | null,
  ): Promise<SmsSendResult> {
    const smsMessage = this.composeMessage(title, message, actionUrl);
    return this.sendTextSms(phone, smsMessage, companyId);
  }

  async sendTextSms(
    phone: string,
    smsMessage: string,
    companyId: number | null,
  ): Promise<SmsSendResult> {
    const { url, password, username, shortcode, channel, timeoutMs } =
      await this.settings.deliveryGateway(companyId);
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
      maxRedirects: 0,
      responseType: 'text',
      transformResponse: [(data: string) => data],
    });

    const rawResponse =
      typeof response.data === 'string'
        ? response.data.trim()
        : String(response.data ?? '').trim();

    if (!rawResponse) {
      throw new Error('SMS gateway returned an empty response');
    }

    const redact = (text: string) =>
      [
        password,
        encodeURIComponent(password),
        username,
        encodeURIComponent(username),
      ]
        .filter(Boolean)
        .reduce(
          (content, secret) => content.split(secret).join('[redacted]'),
          text,
        );
    const parsed = this.parseGatewayResponse(rawResponse);
    const providerCode = parsed.error_code ?? null;
    const message = parsed.message ?? parsed.error_desc ?? parsed.description;
    const providerMessage = message ? redact(message) : null;
    const safeResponse = redact(rawResponse);

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
      rawResponse: safeResponse,
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
      const [first] = value as unknown[];
      return this.flattenFirstObject(first);
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const isFlat = keys.every((key) => {
      const item = record[key];
      return (
        item === null || ['string', 'number', 'boolean'].includes(typeof item)
      );
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
