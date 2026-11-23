import { AdvancedConsoleLogger, QueryRunner } from 'typeorm';

/** Feedback SQL can contain identities and anonymous answers in adjacent queries. */
export class PrivacyQueryLogger extends AdvancedConsoleLogger {
  private sensitive(query: string) {
    return /feedback_(responses|participation)|oidc_(providers|requests|identities)/i.test(
      query,
    );
  }
  logQuery(query: string, parameters?: unknown[], runner?: QueryRunner) {
    if (!this.sensitive(query)) super.logQuery(query, parameters, runner);
  }
  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    runner?: QueryRunner,
  ) {
    if (this.sensitive(query))
      super.logQueryError(
        'Sensitive database operation failed (details redacted)',
        '[sensitive operation]',
        undefined,
        runner,
      );
    else
      super.logQueryError(
        error instanceof Error ? error.message : error,
        query,
        parameters,
        runner,
      );
  }
  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    runner?: QueryRunner,
  ) {
    if (!this.sensitive(query))
      super.logQuerySlow(time, query, parameters, runner);
  }
}
