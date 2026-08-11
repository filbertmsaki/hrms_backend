import { SetMetadata, applyDecorators } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';
export const PERMISSION_MATCH_MODE_KEY = 'permission_match_mode';

export enum PermissionMatchMode {
  ALL = 'all',
  ANY = 'any',
}

export const PermissionsAll = (...permissions: string[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    SetMetadata(PERMISSION_MATCH_MODE_KEY, PermissionMatchMode.ALL),
  );

export const PermissionsAny = (...permissions: string[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    SetMetadata(PERMISSION_MATCH_MODE_KEY, PermissionMatchMode.ANY),
  );

export const Permissions = PermissionsAll;
