# Security: scope actor enrichment in security-event listings

The security-events listing scopes event rows to the current company for company-scoped actors, but its subsequent actor lookup fetches users by ID without verifying a relationship to that company. A malformed event whose `actor_user_id` points to another tenant's user can therefore expose that user's name or email in the company-scoped listing.

Evidence: `src/modules/security/security-events.service.ts`, `applyActorScope` and `findAll` actor enrichment. Platform-scoped access intentionally spans companies and must remain supported.

Investigate legitimate platform and cross-company actor cases, define tenant-safe enrichment and fallback behavior, and add tests for mismatched actor IDs and legitimate platform actors. No security-module implementation is included in this ticket.
