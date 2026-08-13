import {
  isOriginAllowed,
  normalizeAllowedOriginPattern,
} from './allowed-origin.util';

describe('allowed-origin.util', () => {
  describe('normalizeAllowedOriginPattern', () => {
    it('normalizes exact origins', () => {
      expect(
        normalizeAllowedOriginPattern(
          'http://localhost:3000/',
          'APP_ALLOWED_ORIGINS',
        ),
      ).toBe('http://localhost:3000');
    });

    it('accepts localhost wildcard ports', () => {
      expect(
        normalizeAllowedOriginPattern(
          'http://localhost:*',
          'APP_ALLOWED_ORIGINS',
        ),
      ).toBe('http://localhost:*');
    });

    it('accepts loopback wildcard ports', () => {
      expect(
        normalizeAllowedOriginPattern(
          'http://127.0.0.1:*',
          'APP_ALLOWED_ORIGINS',
        ),
      ).toBe('http://127.0.0.1:*');
    });

    it('accepts exact hosts with wildcard ports', () => {
      expect(
        normalizeAllowedOriginPattern(
          'http://192.168.1.30:*',
          'APP_ALLOWED_ORIGINS',
        ),
      ).toBe('http://192.168.1.30:*');
    });

    it('accepts ipv4 subnet wildcards', () => {
      expect(
        normalizeAllowedOriginPattern(
          'http://192.168.1.*:*',
          'APP_ALLOWED_ORIGINS',
        ),
      ).toBe('http://192.168.1.*:*');
    });

    it('accepts subdomain wildcards', () => {
      expect(
        normalizeAllowedOriginPattern(
          'https://*.alliance.co.tz',
          'APP_ALLOWED_ORIGINS',
        ),
      ).toBe('https://*.alliance.co.tz');
    });

    it('accepts subdomain wildcards with wildcard ports', () => {
      expect(
        normalizeAllowedOriginPattern(
          'https://*.alliance.co.tz:*',
          'APP_ALLOWED_ORIGINS',
        ),
      ).toBe('https://*.alliance.co.tz:*');
    });

    it('rejects invalid subnet wildcards', () => {
      expect(() =>
        normalizeAllowedOriginPattern(
          'http://192.168.999.*:*',
          'APP_ALLOWED_ORIGINS',
        ),
      ).toThrow('APP_ALLOWED_ORIGINS must be a valid HTTP or HTTPS origin.');
    });
  });

  describe('isOriginAllowed', () => {
    it('matches exact origins', () => {
      expect(
        isOriginAllowed('http://localhost:3000', ['http://localhost:3000']),
      ).toBe(true);
    });

    it('matches localhost wildcard ports', () => {
      expect(
        isOriginAllowed('http://localhost:5173', ['http://localhost:*']),
      ).toBe(true);
    });

    it('matches loopback wildcard ports', () => {
      expect(
        isOriginAllowed('http://127.0.0.1:4173', ['http://127.0.0.1:*']),
      ).toBe(true);
    });

    it('matches exact hosts with wildcard ports', () => {
      expect(
        isOriginAllowed('http://192.168.1.30:8888', ['http://192.168.1.30:*']),
      ).toBe(true);
    });

    it('matches ipv4 subnet wildcards', () => {
      expect(
        isOriginAllowed('http://192.168.1.44:5173', ['http://192.168.1.*:*']),
      ).toBe(true);
    });

    it('matches subdomains', () => {
      expect(
        isOriginAllowed('https://app.alliance.co.tz', ['https://*.alliance.co.tz']),
      ).toBe(true);
    });

    it('matches subdomains with wildcard ports', () => {
      expect(
        isOriginAllowed('https://admin.alliance.co.tz:8443', [
          'https://*.alliance.co.tz:*',
        ]),
      ).toBe(true);
    });

    it('does not match a different protocol', () => {
      expect(
        isOriginAllowed('https://localhost:5173', ['http://localhost:*']),
      ).toBe(false);
    });

    it('does not match a different host', () => {
      expect(
        isOriginAllowed('http://192.168.1.10:5173', ['http://localhost:*']),
      ).toBe(false);
    });

    it('does not match the root domain for a subdomain-only pattern', () => {
      expect(
        isOriginAllowed('https://alliance.co.tz', ['https://*.alliance.co.tz']),
      ).toBe(false);
    });
  });
});
