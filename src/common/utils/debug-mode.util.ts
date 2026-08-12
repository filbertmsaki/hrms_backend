/**
 * When DEBUG=true, real server-side error messages are surfaced in API
 * responses even in production. Use only for temporary troubleshooting -
 * it can leak internal details (query fragments, file paths) to clients.
 */
export function isDebugModeEnabled(): boolean {
  return process.env.DEBUG === 'true';
}
