import 'reflect-metadata';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LeaveController } from './leave.controller';
import { LeaveCarryForwardController } from './leave-carry-forward.controller';
import { LeaveDelegationsController } from './leave-delegations.controller';
import { LeaveEngineController } from './leave-engine.controller';
import { LeaveExitSettlementsController } from './leave-exit-settlements.controller';
import { LeaveManagementRulesController } from './leave-management-rules.controller';
import { LeaveOpeningReviewsController } from './leave-opening-reviews.controller';
import { LeaveReportsController } from './leave-reports.controller';
import { LeaveVerificationController } from './leave-verification.controller';
import { LeaveCompOffController } from './leave-comp-off.controller';

/**
 * Backend enforcement net: every leave route must run PermissionsGuard with
 * declared permissions, unless it is deliberately public or self-service
 * (those scope to the caller's own employee inside the service).
 */
const SELF_SERVICE = new Set([
  'LeaveController.listMyLeaveRequests', // GET leave/requests/me — own requests only
]);

const controllers = [
  LeaveController,
  LeaveCarryForwardController,
  LeaveDelegationsController,
  LeaveEngineController,
  LeaveExitSettlementsController,
  LeaveManagementRulesController,
  LeaveOpeningReviewsController,
  LeaveReportsController,
  LeaveVerificationController,
  LeaveCompOffController,
];

function routes() {
  const out: Array<{
    name: string;
    route: string;
    guarded: boolean;
    permissions: string[] | undefined;
    isPublic: boolean;
  }> = [];
  for (const ctrl of controllers) {
    const classGuards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, ctrl) ?? [];
    const classPerms: string[] | undefined = Reflect.getMetadata(
      PERMISSIONS_KEY,
      ctrl,
    );
    for (const key of Object.getOwnPropertyNames(ctrl.prototype)) {
      const handler = ctrl.prototype[key];
      if (key === 'constructor' || typeof handler !== 'function') continue;
      const path = Reflect.getMetadata(PATH_METADATA, handler);
      if (path === undefined) continue;
      const method =
        RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)];
      const guards: unknown[] = [
        ...classGuards,
        ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []),
      ];
      out.push({
        name: `${ctrl.name}.${key}`,
        route: `${method} ${Reflect.getMetadata(PATH_METADATA, ctrl)}/${path}`,
        guarded: guards.includes(PermissionsGuard),
        permissions:
          Reflect.getMetadata(PERMISSIONS_KEY, handler) ?? classPerms,
        isPublic: Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true,
      });
    }
  }
  return out;
}

describe('leave route authorization metadata', () => {
  const all = routes();

  it('finds the leave routes', () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it.each(all.map((r) => [r.route, r] as const))(
    '%s enforces permissions',
    (_route, r) => {
      if (r.isPublic || SELF_SERVICE.has(r.name)) return;
      expect({ name: r.name, guarded: r.guarded }).toEqual({
        name: r.name,
        guarded: true,
      });
      expect(r.permissions?.length ?? 0).toBeGreaterThan(0);
    },
  );

  it('keeps public routes to the QR verification lookup', () => {
    expect(all.filter((r) => r.isPublic).map((r) => r.name)).toEqual([
      'LeaveVerificationController.lookup',
    ]);
  });
});
