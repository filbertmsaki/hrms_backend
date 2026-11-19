import { Request } from 'express';
import { isHttpsRequest } from './user-aware-throttler.guard';

const request = (secure: boolean, proto?: string | string[]) =>
  ({
    secure,
    headers: proto === undefined ? {} : { 'x-forwarded-proto': proto },
  }) as unknown as Request;

describe('isHttpsRequest', () => {
  it('is true for a direct HTTPS request', () => {
    expect(isHttpsRequest(request(true))).toBe(true);
  });

  it('is false for plain HTTP by IP (e.g. production on :8888)', () => {
    expect(isHttpsRequest(request(false))).toBe(false);
    expect(isHttpsRequest(request(false, 'http'))).toBe(false);
  });

  it('uses the browser-facing hop behind Nginx -> Next.js', () => {
    expect(isHttpsRequest(request(false, 'https,http'))).toBe(true);
    expect(isHttpsRequest(request(false, 'HTTPS'))).toBe(true);
    expect(isHttpsRequest(request(false, ['https', 'http']))).toBe(true);
  });

  it('is false when the browser-facing hop was HTTP', () => {
    expect(isHttpsRequest(request(false, 'http,https'))).toBe(false);
  });
});
