import { ROLES_KEY } from '../../../../common/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../../../common/decorators/permissions.decorator';
import { AttendanceProcessingController } from './attendance-processing.controller';

describe('cleanup administration access', () => {
  it.each([
    'getCleanupSettings',
    'updateCleanupSettings',
    'previewCleanup',
  ] as const)(
    'restricts %s to company administrators with company update permission',
    (method) => {
      const handler = AttendanceProcessingController.prototype[method];
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        'COMPANY_ADMIN',
      ]);
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        'companies:update',
      ]);
    },
  );
});
