import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ImportEmployeeFinancePaymentFileDto } from '../dto/employee-finance.dto';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeBankAccount } from '../../employees/entities/employee-bank-account.entity';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceDisbursement,
  EmployeeFinanceLedgerEntry,
} from '../entities/employee-finance-account.entities';
import {
  EmployeeFinanceIntegrationLog,
  EmployeeFinanceIntegrationSettings,
} from '../entities/employee-finance-integration.entities';
import {
  EmployeeFinanceDisbursementStatusEnum,
  EmployeeFinanceLedgerEntryTypeEnum,
  EmployeeFinanceProductTypeEnum,
} from '../employee-finance.enums';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from '../employee-finance-secret.util';
import {
  actorMembershipId,
  hash,
  recordValue,
  textValue,
  todayString,
} from '../employee-finance.utils';
import {
  EmployeeFinanceAuditService,
  EmployeeFinanceBankColumnMap,
  EmployeeFinancePaymentImportService,
} from './employee-finance-core.services';
import { EmployeeFinanceMoney } from './employee-finance-money.util';

export const GL_ROLES = [
  'loans_receivable',
  'bank',
  'interest_income',
  'unearned_interest',
  'fee_income',
  'penalty_income',
  'payroll_clearing',
  'final_settlement_clearing',
  'write_off_expense',
  'suspense',
] as const;

export type GlRole = (typeof GL_ROLES)[number];

const DEFAULT_BANK_TEMPLATE = {
  format: 'CSV',
  delimiter: ',',
  include_header: true,
  columns: [
    { header: 'Beneficiary Name', field: 'beneficiary_name' },
    { header: 'Account Number', field: 'account_number' },
    { header: 'Bank Name', field: 'bank_name' },
    { header: 'Bank Code', field: 'bank_code' },
    { header: 'Branch Code', field: 'branch_code' },
    { header: 'Amount', field: 'amount' },
    { header: 'Currency', field: 'currency' },
    { header: 'Payment Reference', field: 'payment_reference' },
    { header: 'Narration', field: 'narration' },
    { header: 'Debit Account', field: 'debit_account' },
  ],
};

export const BANK_FILE_FIELDS = [
  'beneficiary_name',
  'employee_no',
  'account_number',
  'account_name',
  'bank_name',
  'bank_code',
  'branch_code',
  'swift_code',
  'amount',
  'currency',
  'payment_reference',
  'payment_date',
  'narration',
  'debit_account',
  'loan_account_no',
] as const;

const DEFAULT_IMPORT_MAPPING: Required<EmployeeFinanceBankColumnMap> = {
  reference: ['payment_reference', 'reference', 'transaction_reference'],
  amount: ['amount', 'paid_amount', 'transaction_amount'],
  status: ['status', 'result', 'payment_status'],
};

/** Retry delays for failed direct transmissions, in minutes. */
const RETRY_DELAYS_MINUTES = [5, 15, 60, 240, 720];

type SettingsInput = {
  erp_mode?: string;
  erp_provider?: string;
  erp_environment?: string;
  erp_endpoint_url?: string | null;
  erp_auth_type?: string;
  erp_credentials?: Record<string, string> | null;
  bank_mode?: string;
  bank_provider?: string;
  bank_environment?: string;
  bank_endpoint_url?: string | null;
  bank_auth_type?: string;
  bank_credentials?: Record<string, string> | null;
  debit_account_number?: string | null;
  bank_file_template?: Record<string, unknown> | null;
  bank_import_mapping?: Record<string, unknown> | null;
  gl_mapping?: Record<string, unknown> | null;
};

type Credentials = Record<string, string>;

type TransmitResult = {
  ok: boolean;
  status: number;
  reference: string | null;
  body: unknown;
};

/**
 * A connector to an outside system. Adapters are selected by provider name
 * so a bank- or ERP-specific connector can be added without changing the
 * loan module.
 */
interface ConnectorAdapter {
  test(
    endpoint: string,
    credentials: Credentials,
    authType: string,
  ): Promise<TransmitResult>;
  send(
    endpoint: string,
    credentials: Credentials,
    authType: string,
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ): Promise<TransmitResult>;
}

function authHeaders(authType: string, credentials: Credentials) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (authType === 'bearer' && credentials.token) {
    headers.authorization = `Bearer ${credentials.token}`;
  } else if (authType === 'api-key' && credentials.api_key) {
    headers[credentials.api_key_header || 'x-api-key'] = credentials.api_key;
  } else if (authType === 'basic' && credentials.username) {
    headers.authorization = `Basic ${Buffer.from(
      `${credentials.username}:${credentials.password ?? ''}`,
    ).toString('base64')}`;
  }
  return headers;
}

async function readBody(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 2000);
  }
}

/** JSON over HTTPS with an Idempotency-Key header; fits most webhook ERPs and REST banks. */
export class GenericJsonConnector implements ConnectorAdapter {
  constructor(
    private readonly paths: { test: string; send: string },
    private readonly fetcher: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  private url(endpoint: string, path: string) {
    return `${endpoint.replace(/\/+$/, '')}${path}`;
  }

  async test(endpoint: string, credentials: Credentials, authType: string) {
    const response = await this.fetcher(this.url(endpoint, this.paths.test), {
      method: 'GET',
      headers: authHeaders(authType, credentials),
      signal: AbortSignal.timeout(15_000),
    });
    return {
      ok: response.ok,
      status: response.status,
      reference: null,
      body: await readBody(response),
    };
  }

  async send(
    endpoint: string,
    credentials: Credentials,
    authType: string,
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ) {
    const response = await this.fetcher(this.url(endpoint, this.paths.send), {
      method: 'POST',
      headers: {
        ...authHeaders(authType, credentials),
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await readBody(response);
    return {
      ok: response.ok,
      status: response.status,
      reference: textValue(recordValue(body).reference, '') || null,
      body,
    };
  }
}

export const EMPLOYEE_FINANCE_CONNECTORS: Record<
  'ERP' | 'BANK',
  Record<string, ConnectorAdapter>
> = {
  ERP: {
    GENERIC_WEBHOOK: new GenericJsonConnector({
      test: '/health',
      send: '/journals',
    }),
  },
  BANK: {
    GENERIC_REST: new GenericJsonConnector({
      test: '/health',
      send: '/payments',
    }),
  },
};

@Injectable()
export class EmployeeFinanceIntegrationService {
  private readonly logger = new Logger(EmployeeFinanceIntegrationService.name);

  constructor(
    private readonly auditService: EmployeeFinanceAuditService,
    private readonly paymentImportService: EmployeeFinancePaymentImportService,
    @InjectRepository(EmployeeFinanceIntegrationSettings)
    private readonly settingsRepository: Repository<EmployeeFinanceIntegrationSettings>,
    @InjectRepository(EmployeeFinanceIntegrationLog)
    private readonly logRepository: Repository<EmployeeFinanceIntegrationLog>,
    @InjectRepository(EmployeeFinanceLedgerEntry)
    private readonly ledgerRepository: Repository<EmployeeFinanceLedgerEntry>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceDisbursement)
    private readonly disbursementRepository: Repository<EmployeeFinanceDisbursement>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeBankAccount)
    private readonly bankAccountRepository: Repository<EmployeeBankAccount>,
  ) {}

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  private async settingsFor(companyId: number) {
    return (
      (await this.settingsRepository.findOne({ where: { companyId } })) ??
      this.settingsRepository.create({
        companyId,
        erpMode: 'FILE',
        erpProvider: 'GENERIC_WEBHOOK',
        erpEnvironment: 'SANDBOX',
        erpAuthType: 'none',
        bankMode: 'FILE',
        bankProvider: 'GENERIC_REST',
        bankEnvironment: 'SANDBOX',
        bankAuthType: 'none',
        bankFileTemplate: DEFAULT_BANK_TEMPLATE,
        bankImportMapping: DEFAULT_IMPORT_MAPPING,
        glMapping: {},
      })
    );
  }

  /** Settings with credentials replaced by "is set" flags. */
  private present(settings: EmployeeFinanceIntegrationSettings) {
    const glMapping = recordValue(settings.glMapping);
    return {
      erp_mode: settings.erpMode,
      erp_provider: settings.erpProvider,
      erp_environment: settings.erpEnvironment,
      erp_endpoint_url: settings.erpEndpointUrl,
      erp_auth_type: settings.erpAuthType,
      erp_credentials_set: Boolean(settings.erpCredentials),
      bank_mode: settings.bankMode,
      bank_provider: settings.bankProvider,
      bank_environment: settings.bankEnvironment,
      bank_endpoint_url: settings.bankEndpointUrl,
      bank_auth_type: settings.bankAuthType,
      bank_credentials_set: Boolean(settings.bankCredentials),
      debit_account_number: settings.debitAccountNumber,
      bank_file_template: settings.bankFileTemplate ?? DEFAULT_BANK_TEMPLATE,
      bank_import_mapping: settings.bankImportMapping ?? DEFAULT_IMPORT_MAPPING,
      gl_mapping: glMapping,
      unmapped_gl_roles: GL_ROLES.filter(
        (role) =>
          role !== 'unearned_interest' &&
          role !== 'suspense' &&
          !textValue(glMapping[role]),
      ),
      available: {
        erp_providers: Object.keys(EMPLOYEE_FINANCE_CONNECTORS.ERP),
        bank_providers: Object.keys(EMPLOYEE_FINANCE_CONNECTORS.BANK),
        gl_roles: GL_ROLES,
        bank_file_fields: BANK_FILE_FIELDS,
      },
      updated_at: settings.updatedAt ?? null,
    };
  }

  async getSettings(actor: AuthenticatedUser) {
    return this.present(await this.settingsFor(actor.companyId!));
  }

  async updateSettings(actor: AuthenticatedUser, dto: SettingsInput) {
    const settings = await this.settingsFor(actor.companyId!);
    const choose = (
      value: string | undefined,
      allowed: string[],
      field: string,
    ) => {
      if (value === undefined) return undefined;
      const normalized = value.trim().toUpperCase();
      if (!allowed.includes(normalized)) {
        throw new BadRequestException(
          `${field} must be one of ${allowed.join(', ')}.`,
        );
      }
      return normalized;
    };
    const url = (value: string | null | undefined, field: string) => {
      if (value === undefined) return undefined;
      if (value === null || !value.trim()) return null;
      let parsed: URL;
      try {
        parsed = new URL(value.trim());
      } catch {
        throw new BadRequestException(`${field} is not a valid URL.`);
      }
      if (
        parsed.protocol !== 'https:' &&
        process.env.NODE_ENV === 'production'
      ) {
        throw new BadRequestException(`${field} must use https.`);
      }
      return parsed.toString().replace(/\/+$/, '');
    };
    const auth = (value: string | undefined) => {
      if (value === undefined) return undefined;
      const normalized = value.trim().toLowerCase();
      if (!['none', 'bearer', 'api-key', 'basic'].includes(normalized)) {
        throw new BadRequestException(
          'Auth type must be none, bearer, api-key, or basic.',
        );
      }
      return normalized;
    };
    const provider = (value: string | undefined, channel: 'ERP' | 'BANK') => {
      if (value === undefined) return undefined;
      const normalized = value.trim().toUpperCase();
      if (!EMPLOYEE_FINANCE_CONNECTORS[channel][normalized]) {
        throw new BadRequestException(
          `${channel} provider must be one of ${Object.keys(EMPLOYEE_FINANCE_CONNECTORS[channel]).join(', ')}.`,
        );
      }
      return normalized;
    };
    const assign = <K extends keyof EmployeeFinanceIntegrationSettings>(
      key: K,
      value: EmployeeFinanceIntegrationSettings[K] | undefined,
    ) => {
      if (value !== undefined) settings[key] = value;
    };
    assign(
      'erpMode',
      choose(dto.erp_mode, ['OFF', 'FILE', 'DIRECT'], 'ERP mode'),
    );
    assign('erpProvider', provider(dto.erp_provider, 'ERP'));
    assign(
      'erpEnvironment',
      choose(dto.erp_environment, ['SANDBOX', 'LIVE'], 'ERP environment'),
    );
    assign('erpEndpointUrl', url(dto.erp_endpoint_url, 'ERP endpoint'));
    assign('erpAuthType', auth(dto.erp_auth_type));
    assign('bankMode', choose(dto.bank_mode, ['FILE', 'DIRECT'], 'Bank mode'));
    assign('bankProvider', provider(dto.bank_provider, 'BANK'));
    assign(
      'bankEnvironment',
      choose(dto.bank_environment, ['SANDBOX', 'LIVE'], 'Bank environment'),
    );
    assign('bankEndpointUrl', url(dto.bank_endpoint_url, 'Bank endpoint'));
    assign('bankAuthType', auth(dto.bank_auth_type));
    if (dto.debit_account_number !== undefined) {
      settings.debitAccountNumber = dto.debit_account_number?.trim() || null;
    }
    // Credentials are write-only: an empty object clears them, omitted keeps them.
    if (dto.erp_credentials !== undefined) {
      settings.erpCredentials =
        dto.erp_credentials && Object.keys(dto.erp_credentials).length
          ? encryptIntegrationSecret(JSON.stringify(dto.erp_credentials))
          : null;
    }
    if (dto.bank_credentials !== undefined) {
      settings.bankCredentials =
        dto.bank_credentials && Object.keys(dto.bank_credentials).length
          ? encryptIntegrationSecret(JSON.stringify(dto.bank_credentials))
          : null;
    }
    if (dto.bank_file_template !== undefined) {
      settings.bankFileTemplate = this.validTemplate(dto.bank_file_template);
    }
    if (dto.bank_import_mapping !== undefined) {
      settings.bankImportMapping = this.validImportMapping(
        dto.bank_import_mapping,
      );
    }
    if (dto.gl_mapping !== undefined) {
      const mapping = recordValue(dto.gl_mapping);
      const unknown = Object.keys(mapping).filter(
        (key) => !(GL_ROLES as readonly string[]).includes(key),
      );
      if (unknown.length) {
        throw new BadRequestException(
          `Unknown GL roles: ${unknown.join(', ')}.`,
        );
      }
      settings.glMapping = Object.fromEntries(
        Object.entries(mapping)
          .map(([key, value]): [string, string] => [
            key,
            textValue(value).trim(),
          ])
          .filter(([, value]) => value),
      );
    }
    for (const channel of ['ERP', 'BANK'] as const) {
      const mode = channel === 'ERP' ? settings.erpMode : settings.bankMode;
      const endpoint =
        channel === 'ERP' ? settings.erpEndpointUrl : settings.bankEndpointUrl;
      if (mode === 'DIRECT' && !endpoint) {
        throw new BadRequestException(
          `${channel} direct mode needs an endpoint URL. Test the connection in sandbox before switching to live.`,
        );
      }
    }
    settings.updatedByCompanyUserId = actorMembershipId(actor);
    const saved = await this.settingsRepository.save(settings);
    await this.auditService.log({
      actor,
      action: 'finance.integration.settings_updated',
      entityType: 'EMPLOYEE_FINANCE_INTEGRATION_SETTINGS',
      entityId: saved.id,
      // Never log the credentials themselves.
      summary: {
        erp_mode: saved.erpMode,
        erp_environment: saved.erpEnvironment,
        bank_mode: saved.bankMode,
        bank_environment: saved.bankEnvironment,
        credentials_changed: {
          erp: dto.erp_credentials !== undefined,
          bank: dto.bank_credentials !== undefined,
        },
      },
    });
    return this.present(saved);
  }

  private validTemplate(value: Record<string, unknown> | null) {
    if (!value) return DEFAULT_BANK_TEMPLATE;
    const format = textValue(value.format, 'CSV').toUpperCase();
    if (!['CSV', 'XLSX'].includes(format)) {
      throw new BadRequestException('Bank file format must be CSV or XLSX.');
    }
    const columns = Array.isArray(value.columns) ? value.columns : [];
    if (!columns.length) {
      throw new BadRequestException(
        'The bank file template needs at least one column.',
      );
    }
    const normalized = columns.map((column, index) => {
      const record = recordValue(column);
      const field = textValue(record.field).trim();
      const literal = textValue(record.value);
      if (
        !(BANK_FILE_FIELDS as readonly string[]).includes(field) &&
        field !== 'literal'
      ) {
        throw new BadRequestException(
          `Column ${index + 1}: field must be one of ${BANK_FILE_FIELDS.join(', ')}, or literal.`,
        );
      }
      return {
        header: textValue(record.header, field).trim() || field,
        field,
        ...(field === 'literal' ? { value: literal } : {}),
      };
    });
    const delimiter = textValue(value.delimiter, ',');
    if (![',', ';', '|', '\t'].includes(delimiter)) {
      throw new BadRequestException(
        'Delimiter must be comma, semicolon, pipe, or tab.',
      );
    }
    return {
      format,
      delimiter,
      include_header: value.include_header !== false,
      columns: normalized,
    };
  }

  private validImportMapping(value: Record<string, unknown> | null) {
    if (!value) return DEFAULT_IMPORT_MAPPING;
    const list = (raw: unknown, fallback: string[]) => {
      const items = Array.isArray(raw)
        ? raw
            .map((item) => textValue(item).trim().toLowerCase())
            .filter(Boolean)
        : textValue(raw)
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);
      return items.length ? items : fallback;
    };
    return {
      reference: list(value.reference, DEFAULT_IMPORT_MAPPING.reference),
      amount: list(value.amount, DEFAULT_IMPORT_MAPPING.amount),
      status: list(value.status, DEFAULT_IMPORT_MAPPING.status),
    };
  }

  private credentials(raw: string | null): Credentials {
    if (!raw) return {};
    const parsed = recordValue(
      JSON.parse(decryptIntegrationSecret(raw) ?? '{}'),
    );
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, textValue(value)]),
    );
  }

  private connector(
    channel: 'ERP' | 'BANK',
    settings: EmployeeFinanceIntegrationSettings,
  ) {
    const providerName =
      channel === 'ERP' ? settings.erpProvider : settings.bankProvider;
    const adapter = EMPLOYEE_FINANCE_CONNECTORS[channel][providerName];
    if (!adapter) {
      throw new ConflictException(
        `No ${channel} connector named ${providerName}.`,
      );
    }
    const endpoint =
      channel === 'ERP' ? settings.erpEndpointUrl : settings.bankEndpointUrl;
    if (!endpoint) {
      throw new ConflictException(`Set the ${channel} endpoint URL first.`);
    }
    return {
      adapter,
      endpoint,
      authType:
        channel === 'ERP' ? settings.erpAuthType : settings.bankAuthType,
      credentials: this.credentials(
        channel === 'ERP' ? settings.erpCredentials : settings.bankCredentials,
      ),
      environment:
        channel === 'ERP' ? settings.erpEnvironment : settings.bankEnvironment,
    };
  }

  // -------------------------------------------------------------------------
  // Logs
  // -------------------------------------------------------------------------

  private async log(
    entry: Partial<EmployeeFinanceIntegrationLog> & {
      companyId: number;
      idempotencyKey: string;
    },
  ) {
    const existing = await this.logRepository.findOne({
      where: {
        companyId: entry.companyId,
        idempotencyKey: entry.idempotencyKey,
      },
    });
    return this.logRepository.save(
      this.logRepository.create({ ...(existing ?? {}), ...entry }),
    );
  }

  listLogs(
    actor: AuthenticatedUser,
    query: { channel?: string; status?: string },
  ) {
    return this.logRepository.find({
      where: {
        companyId: actor.companyId!,
        ...(query.channel ? { channel: query.channel.toUpperCase() } : {}),
        ...(query.status ? { status: query.status.toUpperCase() } : {}),
      },
      order: { id: 'DESC' },
      take: 200,
      select: [
        'id',
        'channel',
        'operation',
        'mode',
        'environment',
        'status',
        'attemptCount',
        'nextRetryAt',
        'fileName',
        'recordCount',
        'totalAmount',
        'responseSummary',
        'error',
        'createdByCompanyUserId',
        'createdAt',
        'updatedAt',
        'idempotencyKey',
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Connection test
  // -------------------------------------------------------------------------

  async testConnection(actor: AuthenticatedUser, channel: 'ERP' | 'BANK') {
    const settings = await this.settingsFor(actor.companyId!);
    const { adapter, endpoint, authType, credentials, environment } =
      this.connector(channel, settings);
    let result: TransmitResult;
    try {
      result = await adapter.test(endpoint, credentials, authType);
    } catch (error) {
      result = {
        ok: false,
        status: 0,
        reference: null,
        body: error instanceof Error ? error.message : String(error),
      };
    }
    await this.log({
      companyId: actor.companyId!,
      channel,
      operation: 'CONNECTION_TEST',
      mode: 'DIRECT',
      environment,
      idempotencyKey: `test:${channel}:${Date.now()}`,
      status: result.ok ? 'SUCCESS' : 'FAILED',
      responseSummary: { status: result.status, body: result.body },
      error: result.ok
        ? null
        : `Connection test failed (HTTP ${result.status}).`,
      createdByCompanyUserId: actorMembershipId(actor),
    });
    return { ok: result.ok, status: result.status, environment, endpoint };
  }

  // -------------------------------------------------------------------------
  // ERP / accounting
  // -------------------------------------------------------------------------

  private glCode(mapping: Record<string, unknown>, role: GlRole) {
    return textValue(mapping[role]) || `UNMAPPED:${role}`;
  }

  /** Debit and credit roles for one ledger movement. */
  private rolesFor(
    entry: EmployeeFinanceLedgerEntry,
    mapping: Record<string, unknown>,
  ): [GlRole, GlRole] {
    const type = entry.entryType;
    switch (type) {
      case EmployeeFinanceLedgerEntryTypeEnum.PRINCIPAL_DISBURSEMENT:
        return ['loans_receivable', 'bank'];
      case EmployeeFinanceLedgerEntryTypeEnum.INTEREST_ACCRUAL:
        return [
          'loans_receivable',
          textValue(mapping.unearned_interest)
            ? 'unearned_interest'
            : 'interest_income',
        ];
      case EmployeeFinanceLedgerEntryTypeEnum.PROCESSING_FEE:
        return ['loans_receivable', 'fee_income'];
      case EmployeeFinanceLedgerEntryTypeEnum.PENALTY:
        return ['loans_receivable', 'penalty_income'];
      case EmployeeFinanceLedgerEntryTypeEnum.PAYROLL_REPAYMENT:
        return ['payroll_clearing', 'loans_receivable'];
      case EmployeeFinanceLedgerEntryTypeEnum.DIRECT_REPAYMENT:
      case EmployeeFinanceLedgerEntryTypeEnum.ADDITIONAL_REPAYMENT:
        return ['bank', 'loans_receivable'];
      case EmployeeFinanceLedgerEntryTypeEnum.SETTLEMENT_REPAYMENT:
        return [
          entry.sourceType === 'EXIT_RECOVERY'
            ? 'final_settlement_clearing'
            : 'bank',
          'loans_receivable',
        ];
      case EmployeeFinanceLedgerEntryTypeEnum.INTEREST_WAIVER:
        return [
          textValue(mapping.unearned_interest)
            ? 'unearned_interest'
            : 'interest_income',
          'loans_receivable',
        ];
      case EmployeeFinanceLedgerEntryTypeEnum.FEE_WAIVER:
        return ['fee_income', 'loans_receivable'];
      case EmployeeFinanceLedgerEntryTypeEnum.PRINCIPAL_WRITE_OFF:
        return ['write_off_expense', 'loans_receivable'];
      default:
        return entry.direction === 'DEBIT'
          ? ['loans_receivable', 'suspense']
          : ['suspense', 'loans_receivable'];
    }
  }

  private async exportedEntryIds(companyId: number) {
    const logs = await this.logRepository.find({
      where: {
        companyId,
        channel: 'ERP',
        operation: In(['JOURNAL_EXPORT', 'JOURNAL_POST']),
        status: 'SUCCESS',
      },
    });
    const ids = new Set<number>();
    for (const log of logs) {
      const list = recordValue(log.requestPayload).ledger_entry_ids;
      if (Array.isArray(list)) list.forEach((id) => ids.add(Number(id)));
    }
    return ids;
  }

  /**
   * Balanced double-entry journal lines for loan ledger movements in a
   * period. Unmapped roles are labelled so Finance can see what still needs
   * a GL code before importing.
   */
  async buildJournal(
    companyId: number,
    query: { date_from?: string; date_to?: string; only_unexported?: boolean },
  ) {
    const settings = await this.settingsFor(companyId);
    const mapping = recordValue(settings.glMapping);
    let entries = await this.ledgerRepository.find({
      where: {
        companyId,
        ...(query.date_to
          ? { effectiveDate: LessThanOrEqual(query.date_to) }
          : {}),
      },
      order: { effectiveDate: 'ASC', id: 'ASC' },
    });
    if (query.date_from)
      entries = entries.filter(
        (entry) => entry.effectiveDate >= query.date_from!,
      );
    if (query.only_unexported !== false) {
      const exported = await this.exportedEntryIds(companyId);
      entries = entries.filter((entry) => !exported.has(entry.id));
    }
    entries = entries.filter(
      (entry) => EmployeeFinanceMoney.toCents(entry.totalAmount) !== 0n,
    );
    const accounts = entries.length
      ? await this.accountRepository.find({
          where: {
            companyId,
            id: In(
              Array.from(new Set(entries.map((entry) => entry.accountId))),
            ),
          },
        })
      : [];
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const employees = accounts.length
      ? await this.employeeRepository.find({
          where: {
            company_id: companyId,
            id: In(
              Array.from(
                new Set(accounts.map((account) => account.employeeId)),
              ),
            ),
          },
          select: ['id', 'employee_no'],
        })
      : [];
    const employeeNo = new Map(
      employees.map((employee) => [employee.id, employee.employee_no]),
    );
    const lines: Array<Record<string, string | number>> = [];
    let debitTotal = 0n;
    let creditTotal = 0n;
    const unmapped = new Set<string>();
    for (const entry of entries) {
      const [debitRole, creditRole] = this.rolesFor(entry, mapping);
      const account = accountById.get(entry.accountId);
      const amount = EmployeeFinanceMoney.fromCents(
        EmployeeFinanceMoney.toCents(entry.totalAmount) < 0n
          ? -EmployeeFinanceMoney.toCents(entry.totalAmount)
          : EmployeeFinanceMoney.toCents(entry.totalAmount),
      );
      const journalNo = `EFJ-${companyId}-${entry.id}`;
      const description = `${entry.entryType.replace(/_/g, ' ').toLowerCase()} ${account?.accountNo ?? entry.accountId}`;
      for (const [role, side] of [
        [debitRole, 'DEBIT'],
        [creditRole, 'CREDIT'],
      ] as const) {
        const code = this.glCode(mapping, role);
        if (code.startsWith('UNMAPPED')) unmapped.add(role);
        lines.push({
          journal_no: journalNo,
          posting_date: entry.effectiveDate,
          gl_account: code,
          gl_role: role,
          debit: side === 'DEBIT' ? amount : '0.00',
          credit: side === 'CREDIT' ? amount : '0.00',
          description,
          loan_account_no: account?.accountNo ?? '',
          employee_no: account
            ? (employeeNo.get(account.employeeId) ?? '')
            : '',
          ledger_entry_id: entry.id,
          source: `${entry.sourceType}${entry.sourceId ? `:${entry.sourceId}` : ''}`,
        });
      }
      debitTotal += EmployeeFinanceMoney.toCents(amount);
      creditTotal += EmployeeFinanceMoney.toCents(amount);
    }
    return {
      ledger_entry_ids: entries.map((entry) => entry.id),
      journal_count: entries.length,
      debit_total: EmployeeFinanceMoney.fromCents(debitTotal),
      credit_total: EmployeeFinanceMoney.fromCents(creditTotal),
      balanced: debitTotal === creditTotal,
      unmapped_roles: Array.from(unmapped),
      lines,
    };
  }

  /** File-mode accounting: a journal file Finance imports into the ERP. */
  async exportJournal(
    actor: AuthenticatedUser,
    query: {
      date_from?: string;
      date_to?: string;
      only_unexported?: boolean;
      format?: string;
    },
  ) {
    const companyId = actor.companyId!;
    const settings = await this.settingsFor(companyId);
    if (settings.erpMode === 'OFF') {
      throw new ConflictException(
        'Accounting export is switched off in integration settings.',
      );
    }
    const journal = await this.buildJournal(companyId, query);
    if (!journal.journal_count) {
      throw new ConflictException(
        'There are no loan postings to export for this period.',
      );
    }
    const format = (query.format ?? 'xlsx').toLowerCase();
    const headers = Object.keys(journal.lines[0]);
    let buffer: Buffer;
    let contentType: string;
    if (format === 'csv') {
      const escape = (value: string | number | boolean | null | undefined) =>
        `"${String(value ?? '').replace(/"/g, '""')}"`;
      buffer = Buffer.from(
        [
          headers.join(','),
          ...journal.lines.map((line) =>
            headers.map((key) => escape(line[key])).join(','),
          ),
        ].join('\r\n'),
        'utf8',
      );
      contentType = 'text/csv; charset=utf-8';
    } else {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Journal');
      sheet.addRow(headers).font = { bold: true };
      journal.lines.forEach((line) =>
        sheet.addRow(headers.map((key) => line[key])),
      );
      sheet.columns.forEach((column) => (column.width = 18));
      const summary = workbook.addWorksheet('Control');
      for (const [label, value] of [
        ['Journals', journal.journal_count],
        ['Total debits', journal.debit_total],
        ['Total credits', journal.credit_total],
        ['Balanced', journal.balanced ? 'YES' : 'NO'],
        ['Unmapped roles', journal.unmapped_roles.join(', ') || 'none'],
        [
          'Period',
          `${query.date_from ?? 'start'} to ${query.date_to ?? todayString()}`,
        ],
      ]) {
        summary.addRow([label, value]);
      }
      buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      contentType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    const fileName = `loan-journal-${query.date_from ?? 'all'}-to-${query.date_to ?? todayString()}.${format === 'csv' ? 'csv' : 'xlsx'}`;
    await this.log({
      companyId,
      channel: 'ERP',
      operation: 'JOURNAL_EXPORT',
      mode: 'FILE',
      environment: settings.erpEnvironment,
      idempotencyKey: `journal-export:${hash(journal.ledger_entry_ids)}`,
      status: 'SUCCESS',
      fileName,
      recordCount: journal.journal_count,
      totalAmount: journal.debit_total,
      requestPayload: { ledger_entry_ids: journal.ledger_entry_ids, ...query },
      responseSummary: {
        balanced: journal.balanced,
        unmapped_roles: journal.unmapped_roles,
      },
      createdByCompanyUserId: actorMembershipId(actor),
    });
    return { buffer, fileName, contentType };
  }

  /** Direct-mode accounting: posts the journal through the ERP connector. */
  async postJournal(
    actor: AuthenticatedUser,
    query: { date_from?: string; date_to?: string },
  ) {
    const companyId = actor.companyId!;
    const settings = await this.settingsFor(companyId);
    if (settings.erpMode !== 'DIRECT') {
      throw new ConflictException(
        'Direct ERP posting is off. Use the journal export, or switch ERP mode to DIRECT after a successful sandbox test.',
      );
    }
    const journal = await this.buildJournal(companyId, {
      ...query,
      only_unexported: true,
    });
    if (!journal.journal_count) {
      throw new ConflictException(
        'There are no unposted loan journals for this period.',
      );
    }
    if (journal.unmapped_roles.length) {
      throw new ConflictException(
        `Map these GL roles before posting: ${journal.unmapped_roles.join(', ')}.`,
      );
    }
    const idempotencyKey = `journal-post:${hash(journal.ledger_entry_ids)}`;
    const payload = {
      company_id: companyId,
      ledger_entry_ids: journal.ledger_entry_ids,
      lines: journal.lines,
      debit_total: journal.debit_total,
      credit_total: journal.credit_total,
    };
    return this.transmit(
      actor,
      settings,
      'ERP',
      'JOURNAL_POST',
      idempotencyKey,
      payload,
      journal.journal_count,
      journal.debit_total,
    );
  }

  // -------------------------------------------------------------------------
  // Bank
  // -------------------------------------------------------------------------

  private async paymentRows(companyId: number, disbursementIds?: number[]) {
    const settings = await this.settingsFor(companyId);
    const disbursements = await this.disbursementRepository.find({
      where: {
        companyId,
        status: EmployeeFinanceDisbursementStatusEnum.APPROVED,
        ...(disbursementIds?.length ? { id: In(disbursementIds) } : {}),
      },
      order: { id: 'ASC' },
    });
    if (!disbursements.length) {
      throw new ConflictException(
        'There are no approved disbursements waiting for payment.',
      );
    }
    const accounts = await this.accountRepository.find({
      where: { companyId, id: In(disbursements.map((item) => item.accountId)) },
    });
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const employeeIds = Array.from(
      new Set(accounts.map((account) => account.employeeId)),
    );
    const employees = await this.employeeRepository.find({
      where: { company_id: companyId, id: In(employeeIds) },
      select: ['id', 'employee_no', 'first_name', 'last_name'],
    });
    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee]),
    );
    const bankAccounts = await this.bankAccountRepository.find({
      where: { employee_id: In(employeeIds) },
      order: { is_primary: 'DESC', id: 'DESC' },
    });
    const today = todayString();
    const bankFor = (employeeId: number) =>
      bankAccounts.find(
        (item) =>
          item.employee_id === employeeId &&
          (!item.effective_to || item.effective_to >= today),
      );
    const missing: string[] = [];
    const rows = disbursements.map((disbursement) => {
      const account = accountById.get(disbursement.accountId)!;
      const employee = employeeById.get(account.employeeId);
      const bank = bankFor(account.employeeId);
      if (!bank)
        missing.push(employee?.employee_no ?? String(account.employeeId));
      const name = employee
        ? [employee.first_name, employee.last_name].filter(Boolean).join(' ')
        : '';
      return {
        disbursement_id: disbursement.id,
        beneficiary_name: bank?.account_name || name,
        employee_no: employee?.employee_no ?? '',
        account_number: bank?.account_number ?? '',
        account_name: bank?.account_name ?? name,
        bank_name: bank?.bank_name ?? '',
        bank_code: bank?.bank_code ?? '',
        branch_code: bank?.bank_branch_code ?? '',
        swift_code: bank?.swift_code ?? '',
        amount: disbursement.amount,
        currency: bank?.account_currency || 'TZS',
        payment_reference: disbursement.paymentReference,
        payment_date: disbursement.paymentDate,
        narration: `${account.productType === EmployeeFinanceProductTypeEnum.SALARY_ADVANCE ? 'Salary advance' : 'Staff loan'} ${account.accountNo}`,
        debit_account: settings.debitAccountNumber ?? '',
        loan_account_no: account.accountNo,
      };
    });
    if (missing.length) {
      throw new ConflictException(
        `These employees have no active bank account: ${missing.join(', ')}.`,
      );
    }
    return { settings, rows };
  }

  /** File-mode payments: a transfer file in the bank's layout. */
  async bankPaymentFile(actor: AuthenticatedUser, disbursementIds?: number[]) {
    const companyId = actor.companyId!;
    const { settings, rows } = await this.paymentRows(
      companyId,
      disbursementIds,
    );
    const template = recordValue(
      settings.bankFileTemplate ?? DEFAULT_BANK_TEMPLATE,
    );
    const columns = (
      Array.isArray(template.columns)
        ? template.columns
        : DEFAULT_BANK_TEMPLATE.columns
    ).map(recordValue);
    const cells = rows.map((row) =>
      columns.map((column) =>
        textValue(column.field) === 'literal'
          ? textValue(column.value)
          : textValue(
              (row as Record<string, unknown>)[textValue(column.field)],
            ),
      ),
    );
    const headers = columns.map((column) =>
      textValue(column.header, textValue(column.field)),
    );
    const total = rows.reduce(
      (sum, row) => EmployeeFinanceMoney.add(sum, row.amount),
      '0.00',
    );
    const format = textValue(template.format, 'CSV').toUpperCase();
    let buffer: Buffer;
    let contentType: string;
    if (format === 'XLSX') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Payments');
      if (template.include_header !== false)
        sheet.addRow(headers).font = { bold: true };
      cells.forEach((line) => sheet.addRow(line));
      buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      contentType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      const delimiter = textValue(template.delimiter, ',');
      const escape = (value: string) =>
        value.includes(delimiter) || value.includes('"') || value.includes('\n')
          ? `"${value.replace(/"/g, '""')}"`
          : value;
      const lines = cells.map((line) => line.map(escape).join(delimiter));
      if (template.include_header !== false)
        lines.unshift(headers.map(escape).join(delimiter));
      buffer = Buffer.from(lines.join('\r\n'), 'utf8');
      contentType = 'text/csv; charset=utf-8';
    }
    const ids = rows.map((row) => row.disbursement_id);
    const fileName = `loan-payments-${todayString()}-${ids.length}.${format === 'XLSX' ? 'xlsx' : 'csv'}`;
    await this.log({
      companyId,
      channel: 'BANK',
      operation: 'PAYMENT_FILE',
      mode: 'FILE',
      environment: settings.bankEnvironment,
      idempotencyKey: `payment-file:${hash(ids)}:${Date.now()}`,
      status: 'SUCCESS',
      fileName,
      recordCount: rows.length,
      totalAmount: total,
      requestPayload: { disbursement_ids: ids },
      createdByCompanyUserId: actorMembershipId(actor),
    });
    await this.auditService.log({
      actor,
      action: 'finance.bank.payment_file_generated',
      entityType: 'EMPLOYEE_FINANCE_INTEGRATION',
      entityId: fileName,
      summary: { disbursement_ids: ids, total },
    });
    return { buffer, fileName, contentType };
  }

  /**
   * Direct-mode payments through the bank connector. Disbursements stay
   * APPROVED; Finance confirms them when the bank statement shows the money
   * went out, exactly as in file mode.
   */
  async submitPayments(actor: AuthenticatedUser, disbursementIds?: number[]) {
    const companyId = actor.companyId!;
    const { settings, rows } = await this.paymentRows(
      companyId,
      disbursementIds,
    );
    if (settings.bankMode !== 'DIRECT') {
      throw new ConflictException(
        'Direct bank submission is off. Download the payment file instead, or switch bank mode to DIRECT after a sandbox test.',
      );
    }
    const ids = rows.map((row) => row.disbursement_id);
    const total = rows.reduce(
      (sum, row) => EmployeeFinanceMoney.add(sum, row.amount),
      '0.00',
    );
    return this.transmit(
      actor,
      settings,
      'BANK',
      'PAYMENT_SUBMIT',
      `payment-submit:${hash(ids)}`,
      { payments: rows, total, debit_account: settings.debitAccountNumber },
      rows.length,
      total,
    );
  }

  /** Imports a bank statement using the company's column mapping. */
  async importStatement(
    actor: AuthenticatedUser,
    dto: ImportEmployeeFinancePaymentFileDto,
  ) {
    const settings = await this.settingsFor(actor.companyId!);
    const mapping = this.validImportMapping(
      recordValue(settings.bankImportMapping),
    );
    const result = await this.paymentImportService.importFile(actor, dto, {
      columnMap: mapping,
    });
    await this.log({
      companyId: actor.companyId!,
      channel: 'BANK',
      operation: 'STATEMENT_IMPORT',
      mode: 'FILE',
      environment: settings.bankEnvironment,
      idempotencyKey: `statement-import:${Date.now()}:${actorMembershipId(actor)}`,
      status: 'SUCCESS',
      fileName: dto.file.fileName,
      recordCount: Number(recordValue(result.summary).imported_rows ?? 0),
      responseSummary: recordValue(result.summary),
      createdByCompanyUserId: actorMembershipId(actor),
    });
    return result;
  }

  // -------------------------------------------------------------------------
  // Transmission with retry and duplicate protection
  // -------------------------------------------------------------------------

  private async transmit(
    actor: AuthenticatedUser | null,
    settings: EmployeeFinanceIntegrationSettings,
    channel: 'ERP' | 'BANK',
    operation: string,
    idempotencyKey: string,
    payload: Record<string, unknown>,
    recordCount: number,
    totalAmount: string,
  ) {
    const companyId = settings.companyId;
    const previous = await this.logRepository.findOne({
      where: { companyId, idempotencyKey },
    });
    if (previous?.status === 'SUCCESS') {
      // The same batch was already accepted; never send it twice.
      return { duplicate: true, log_id: previous.id, status: previous.status };
    }
    const { adapter, endpoint, authType, credentials, environment } =
      this.connector(channel, settings);
    let result: TransmitResult;
    try {
      result = await adapter.send(
        endpoint,
        credentials,
        authType,
        idempotencyKey,
        payload,
      );
    } catch (error) {
      result = {
        ok: false,
        status: 0,
        reference: null,
        body: error instanceof Error ? error.message : String(error),
      };
    }
    const attempts = (previous?.attemptCount ?? 0) + 1;
    const exhausted = attempts > RETRY_DELAYS_MINUTES.length;
    const saved = await this.log({
      companyId,
      channel,
      operation,
      mode: 'DIRECT',
      environment,
      idempotencyKey,
      status: result.ok ? 'SUCCESS' : exhausted ? 'ABANDONED' : 'FAILED',
      attemptCount: attempts,
      nextRetryAt:
        result.ok || exhausted
          ? null
          : new Date(Date.now() + RETRY_DELAYS_MINUTES[attempts - 1] * 60_000),
      recordCount,
      totalAmount,
      requestPayload: payload,
      responseSummary: {
        status: result.status,
        reference: result.reference,
        body: result.body,
      },
      error: result.ok ? null : `HTTP ${result.status}`,
      createdByCompanyUserId: actor
        ? actorMembershipId(actor)
        : (previous?.createdByCompanyUserId ?? null),
    });
    if (!result.ok && exhausted) {
      this.logger.error(
        `${channel} ${operation} ${idempotencyKey} abandoned after ${attempts} attempts.`,
      );
    }
    return {
      duplicate: false,
      log_id: saved.id,
      status: saved.status,
      reference: result.reference,
      next_retry_at: saved.nextRetryAt,
    };
  }

  async retry(actor: AuthenticatedUser, logId: number) {
    const log = await this.logRepository.findOne({
      where: { id: logId, companyId: actor.companyId! },
    });
    if (!log) throw new NotFoundException('Integration log not found.');
    if (
      !['FAILED', 'ABANDONED'].includes(log.status) ||
      log.mode !== 'DIRECT' ||
      !log.requestPayload
    ) {
      throw new ConflictException(
        'Only failed direct transmissions can be retried.',
      );
    }
    if (log.status === 'ABANDONED') {
      log.attemptCount = 0;
      await this.logRepository.save(log);
    }
    const settings = await this.settingsFor(log.companyId);
    return this.transmit(
      actor,
      settings,
      log.channel as 'ERP' | 'BANK',
      log.operation,
      log.idempotencyKey,
      log.requestPayload,
      log.recordCount,
      log.totalAmount,
    );
  }

  @Cron(process.env.EMPLOYEE_FINANCE_INTEGRATION_RETRY_CRON || '0 */5 * * * *')
  async retryDue() {
    const due = await this.logRepository.find({
      where: {
        status: 'FAILED',
        mode: 'DIRECT',
        nextRetryAt: LessThanOrEqual(new Date()),
      },
      take: 20,
    });
    for (const log of due) {
      try {
        const settings = await this.settingsFor(log.companyId);
        if (
          (log.channel === 'ERP' ? settings.erpMode : settings.bankMode) !==
          'DIRECT'
        )
          continue;
        await this.transmit(
          null,
          settings,
          log.channel as 'ERP' | 'BANK',
          log.operation,
          log.idempotencyKey,
          log.requestPayload ?? {},
          log.recordCount,
          log.totalAmount,
        );
      } catch (error) {
        this.logger.warn(
          `Integration retry ${log.id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return due.length;
  }
}
