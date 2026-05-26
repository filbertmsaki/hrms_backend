import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export function normalizeHikvisionError(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  const message = (error as { message?: string } | null)?.message ?? 'Unknown Hikvision error';
  const code = (error as { code?: string } | null)?.code;
  const lowered = message.toLowerCase();

  if (lowered.includes('401') || lowered.includes('unauthorized')) {
    return new UnauthorizedException('Hikvision digest authentication failed');
  }

  if (lowered.includes('400') || lowered.includes('bad request')) {
    return new HttpException('Invalid request sent to Hikvision device', HttpStatus.BAD_REQUEST);
  }

  if (code === 'ECONNABORTED' || lowered.includes('timeout')) {
    return new ServiceUnavailableException('Hikvision request timeout');
  }

  if (code === 'ECONNRESET' || lowered.includes('connection reset')) {
    return new ServiceUnavailableException('Hikvision connection reset');
  }

  if (code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'ECONNREFUSED') {
    return new ServiceUnavailableException('Hikvision device is offline or unreachable');
  }

  return new ServiceUnavailableException(`Hikvision integration error: ${message}`);
}
