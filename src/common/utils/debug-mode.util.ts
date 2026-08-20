/**
 * When DEBUG=true, real server-side error messages are surfaced in API
 * responses even in production. Use only for temporary troubleshooting -
 * it can leak internal details (query fragments, file paths) to clients.
 */
export function resolveDebugMode(value: string | undefined): boolean {
  if (!value || value.trim() === '') {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  // Some host tools set DEBUG to non-boolean values such as "release" or
  // namespace filters. Treat those as disabled so startup stays safe.
  return false;
}

export function isDebugModeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveDebugMode(env.DEBUG);
}
