import { ForbiddenException } from '@nestjs/common';

export const COMPANY_MODULE_KEYS = ['roles', 'permissions'] as const;

export type CompanyModuleKey = (typeof COMPANY_MODULE_KEYS)[number];

export type CompanyModules = Record<CompanyModuleKey, boolean>;

type JsonRecord = Record<string, unknown>;

const DEFAULT_COMPANY_MODULES: CompanyModules = {
  roles: true,
  permissions: true,
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function splitModuleRecord(value: unknown): {
  raw: JsonRecord;
  legacyAccessGovernance?: boolean;
} {
  const raw = isJsonRecord(value) ? { ...value } : {};
  const legacyAccessGovernance = readOptionalBoolean(raw.access_governance);

  delete raw.access_governance;

  return {
    raw,
    legacyAccessGovernance,
  };
}

export function resolveCompanyModules(
  metadata: JsonRecord | null | undefined,
): CompanyModules {
  const metadataRecord = isJsonRecord(metadata) ? metadata : {};
  const moduleRecord = splitModuleRecord(metadataRecord.modules);

  return {
    roles:
      readOptionalBoolean(moduleRecord.raw.roles) ??
      moduleRecord.legacyAccessGovernance ??
      DEFAULT_COMPANY_MODULES.roles,
    permissions:
      readOptionalBoolean(moduleRecord.raw.permissions) ??
      moduleRecord.legacyAccessGovernance ??
      DEFAULT_COMPANY_MODULES.permissions,
  };
}

export function normalizeCompanyMetadata(
  metadata: JsonRecord | null | undefined,
): JsonRecord {
  const metadataRecord = isJsonRecord(metadata) ? { ...metadata } : {};
  const moduleRecord = splitModuleRecord(metadataRecord.modules);
  const resolvedModules = resolveCompanyModules(metadataRecord);

  return {
    ...metadataRecord,
    modules: {
      ...moduleRecord.raw,
      ...resolvedModules,
    },
  };
}

export function mergeCompanyMetadata(
  currentMetadata: JsonRecord | null | undefined,
  incomingMetadata: JsonRecord | null | undefined,
): JsonRecord {
  const normalizedCurrentMetadata = normalizeCompanyMetadata(currentMetadata);
  const currentModuleRecord = splitModuleRecord(
    normalizedCurrentMetadata.modules,
  );
  const incomingMetadataRecord = isJsonRecord(incomingMetadata)
    ? incomingMetadata
    : {};
  const incomingModuleRecord = splitModuleRecord(
    incomingMetadataRecord.modules,
  );

  const { modules: _currentModules, ...currentWithoutModules } =
    normalizedCurrentMetadata;
  const { modules: _incomingModules, ...incomingWithoutModules } =
    incomingMetadataRecord;

  const currentModules = resolveCompanyModules(normalizedCurrentMetadata);
  const mergedLegacyAccessGovernance =
    incomingModuleRecord.legacyAccessGovernance;

  return {
    ...currentWithoutModules,
    ...incomingWithoutModules,
    modules: {
      ...currentModuleRecord.raw,
      ...incomingModuleRecord.raw,
      roles:
        readOptionalBoolean(incomingModuleRecord.raw.roles) ??
        mergedLegacyAccessGovernance ??
        currentModules.roles,
      permissions:
        readOptionalBoolean(incomingModuleRecord.raw.permissions) ??
        mergedLegacyAccessGovernance ??
        currentModules.permissions,
    },
  };
}

export function createCompanyModuleDisabledPayload(module: CompanyModuleKey): {
  success: false;
  message: string;
  code: 'COMPANY_MODULE_DISABLED';
  module: CompanyModuleKey;
} {
  const label = module === 'roles' ? 'Roles' : 'Permissions';

  return {
    success: false,
    message: `${label} are not enabled for this company`,
    code: 'COMPANY_MODULE_DISABLED',
    module,
  };
}

export function assertCompanyModuleEnabled(
  modules: CompanyModules | null | undefined,
  module: CompanyModuleKey,
): void {
  const effectiveModules = modules ?? DEFAULT_COMPANY_MODULES;

  if (effectiveModules[module]) {
    return;
  }

  throw new ForbiddenException(createCompanyModuleDisabledPayload(module));
}
