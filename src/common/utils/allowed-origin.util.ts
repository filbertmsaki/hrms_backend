const EXACT_HOST_ANY_PORT_PATTERN =
  /^(https?):\/\/((?:localhost)|(?:127\.0\.0\.1)|(?:\d{1,3}(?:\.\d{1,3}){3})|(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+)):\*$/i;
const IPV4_SUBNET_ANY_HOST_PATTERN =
  /^(https?):\/\/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\*:\*$/i;
const SUBDOMAIN_PATTERN =
  /^(https?):\/\/\*\.([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::(\*|\d{1,5}))?$/i;

function isValidIpv4Octet(value: string): boolean {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
}

function isValidPort(value: string): boolean {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535;
}

function normalizeHostname(value: string): string {
  return value.toLowerCase();
}

function parseHttpOrigin(value: string, key: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid HTTP or HTTPS origin.`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${key} must be a valid HTTP or HTTPS origin.`);
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(
      `${key} must contain origins only, without paths: ${value}`,
    );
  }

  return parsed;
}

export function normalizeAllowedOriginPattern(
  value: string,
  key = 'Allowed origins',
): string {
  const trimmedValue = value.trim().replace(/\/+$/, '');
  const exactHostAnyPortMatch = trimmedValue.match(EXACT_HOST_ANY_PORT_PATTERN);

  if (exactHostAnyPortMatch) {
    const [, protocol, hostname] = exactHostAnyPortMatch;

    if (
      hostname.includes('.') &&
      hostname !== 'localhost' &&
      !hostname.match(/^\d{1,3}(?:\.\d{1,3}){3}$/) &&
      hostname.startsWith('*.')
    ) {
      throw new Error(`${key} must be a valid HTTP or HTTPS origin.`);
    }

    if (
      hostname.match(/^\d{1,3}(?:\.\d{1,3}){3}$/) &&
      !hostname.split('.').every(isValidIpv4Octet)
    ) {
      throw new Error(`${key} must be a valid HTTP or HTTPS origin.`);
    }

    return `${protocol.toLowerCase()}://${normalizeHostname(hostname)}:*`;
  }

  const subnetMatch = trimmedValue.match(IPV4_SUBNET_ANY_HOST_PATTERN);

  if (subnetMatch) {
    const [, protocol, firstOctet, secondOctet, thirdOctet] = subnetMatch;
    const subnetOctets = [firstOctet, secondOctet, thirdOctet];

    if (!subnetOctets.every(isValidIpv4Octet)) {
      throw new Error(`${key} must be a valid HTTP or HTTPS origin.`);
    }

    return `${protocol.toLowerCase()}://${firstOctet}.${secondOctet}.${thirdOctet}.*:*`;
  }

  const subdomainMatch = trimmedValue.match(SUBDOMAIN_PATTERN);

  if (subdomainMatch) {
    const [, protocol, domain, port] = subdomainMatch;

    if (port && port !== '*' && !isValidPort(port)) {
      throw new Error(`${key} must be a valid HTTP or HTTPS origin.`);
    }

    return port
      ? `${protocol.toLowerCase()}://*.${normalizeHostname(domain)}:${port}`
      : `${protocol.toLowerCase()}://*.${normalizeHostname(domain)}`;
  }

  return parseHttpOrigin(trimmedValue, key).origin;
}

export function isOriginAllowed(
  origin: string,
  allowedOrigins: readonly string[],
): boolean {
  let normalizedOrigin: string;
  let parsedOrigin: URL;

  try {
    parsedOrigin = parseHttpOrigin(origin, 'Origin');
    normalizedOrigin = parsedOrigin.origin;
  } catch {
    return false;
  }

  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin === normalizedOrigin) {
      return true;
    }

    const exactHostAnyPortMatch = allowedOrigin.match(
      EXACT_HOST_ANY_PORT_PATTERN,
    );

    if (exactHostAnyPortMatch) {
      return (
        parsedOrigin.protocol ===
          `${exactHostAnyPortMatch[1].toLowerCase()}:` &&
        parsedOrigin.hostname.toLowerCase() ===
          normalizeHostname(exactHostAnyPortMatch[2])
      );
    }

    const subnetMatch = allowedOrigin.match(IPV4_SUBNET_ANY_HOST_PATTERN);

    if (subnetMatch) {
      const [, protocol, firstOctet, secondOctet, thirdOctet] = subnetMatch;

      return (
        parsedOrigin.protocol === `${protocol.toLowerCase()}:` &&
        parsedOrigin.hostname.match(/^\d{1,3}(?:\.\d{1,3}){3}$/) !== null &&
        parsedOrigin.hostname.split('.').every(isValidIpv4Octet) &&
        parsedOrigin.hostname.startsWith(
          `${firstOctet}.${secondOctet}.${thirdOctet}.`,
        )
      );
    }

    const subdomainMatch = allowedOrigin.match(SUBDOMAIN_PATTERN);

    if (!subdomainMatch) {
      return false;
    }

    const [, protocol, domain, port] = subdomainMatch;
    const normalizedHostname = parsedOrigin.hostname.toLowerCase();
    const normalizedDomain = normalizeHostname(domain);
    const isSubdomainMatch =
      normalizedHostname !== normalizedDomain &&
      normalizedHostname.endsWith(`.${normalizedDomain}`);

    if (
      !isSubdomainMatch ||
      parsedOrigin.protocol !== `${protocol.toLowerCase()}:`
    ) {
      return false;
    }

    if (!port || port === '*') {
      return true;
    }

    const normalizedPort =
      parsedOrigin.port || (parsedOrigin.protocol === 'https:' ? '443' : '80');

    return normalizedPort === port;
  });
}
