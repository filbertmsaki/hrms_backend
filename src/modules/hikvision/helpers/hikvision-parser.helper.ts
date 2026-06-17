import { BadGatewayException, Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

@Injectable()
export class HikvisionParserHelper {
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: true,
    trimValues: true,
  });

  parsePayload(payload: string): Record<string, unknown> {
    const normalized = payload.trim();
    if (!normalized) {
      throw new BadGatewayException(
        'Empty payload received from Hikvision device',
      );
    }

    if (normalized.startsWith('{') || normalized.startsWith('[')) {
      try {
        return JSON.parse(normalized) as Record<string, unknown>;
      } catch (error) {
        const message = (error as Error).message || 'Unknown JSON parse error';
        throw new BadGatewayException(
          `Invalid JSON from Hikvision device: ${message}`,
        );
      }
    }

    try {
      return this.xmlParser.parse(normalized) as Record<string, unknown>;
    } catch (error) {
      const message = (error as Error).message || 'Unknown XML parse error';
      throw new BadGatewayException(
        `Invalid XML from Hikvision device: ${message}`,
      );
    }
  }

  findFirstStringDeep(
    source: Record<string, unknown>,
    candidateKeys: string[],
    maxDepth = 6,
  ): string | undefined {
    const keySet = new Set(candidateKeys.map((key) => key.toLowerCase()));

    const visit = (node: unknown, depth: number): string | undefined => {
      if (depth > maxDepth || node === null || node === undefined) {
        return undefined;
      }

      if (typeof node === 'object' && !Array.isArray(node)) {
        const record = node as Record<string, unknown>;

        for (const [key, value] of Object.entries(record)) {
          if (!keySet.has(key.toLowerCase())) {
            continue;
          }

          const normalized = this.toSafeString(value);
          if (normalized) {
            return normalized;
          }
        }

        for (const value of Object.values(record)) {
          const found = visit(value, depth + 1);
          if (found) {
            return found;
          }
        }
      }

      if (Array.isArray(node)) {
        for (const item of node) {
          const found = visit(item, depth + 1);
          if (found) {
            return found;
          }
        }
      }

      return undefined;
    };

    return visit(source, 0);
  }

  extractRoot(
    source: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> {
    const candidate = source[key];
    if (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate)
    ) {
      return candidate as Record<string, unknown>;
    }
    return source;
  }

  private toSafeString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }
}
