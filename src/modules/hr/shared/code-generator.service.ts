import { ConflictException, Injectable } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';

export interface CodeGeneratorConfig {
  /** Prefix to prepend to the generated code (e.g., 'BR-' for branches) */
  prefix?: string;
  /** Suffix to append to the generated code (e.g., '-ACTIVE') */
  suffix?: string;
  /** Minimum number of digits for the sequence number (default: 4) */
  minDigits?: number;
  /** The column name in the entity that stores the code (default: 'code') */
  codeColumn?: string;
  /** The column name to filter by company (default: 'company_id') */
  companyColumn?: string;
}

@Injectable()
export class CodeGeneratorService {
  /**
   * Generate a unique auto-incrementing code for a given entity type.
   * Format: {PREFIX}{SEQUENCE}{SUFFIX}
   * e.g., BR-0001 for branches, DEP-0001 for departments, POS-0001 for positions
   *
   * If the generated code already exists, it will increment the sequence number
   * until a unique code is found.
   */
  async generateCode<T extends ObjectLiteral>(
    repository: Repository<T>,
    companyId: number,
    config: CodeGeneratorConfig = {},
  ): Promise<string> {
    const {
      prefix = '',
      suffix = '',
      minDigits = 4,
      codeColumn = 'code',
      companyColumn = 'company_id',
    } = config;

    // Find the highest existing code for this entity type and company
    const lastRecord = await repository
      .createQueryBuilder('entity')
      .where(`entity.${companyColumn} = :companyId`, { companyId })
      .andWhere(`entity.${codeColumn} IS NOT NULL`)
      .andWhere(`entity.${codeColumn} LIKE :prefix`, {
        prefix: `${prefix}%${suffix ? `%${suffix}` : ''}`,
      })
      .orderBy(`entity.${codeColumn}`, 'DESC')
      .limit(1)
      .getOne();

    let nextNumber = 1;

    if (lastRecord) {
      const lastCode = (lastRecord as any)[codeColumn] as string;
      // Extract the numeric part from the code
      const numericPart = lastCode
        .replace(prefix, '')
        .replace(suffix, '')
        .trim();
      const parsedNumber = parseInt(numericPart, 10);
      if (!isNaN(parsedNumber)) {
        nextNumber = parsedNumber + 1;
      }
    }

    // Try to generate a unique code
    let code: string;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      const paddedNumber = String(nextNumber).padStart(minDigits, '0');
      code = `${prefix}${paddedNumber}${suffix}`;

      // Check uniqueness scoped to the company
      const existing = await repository.findOne({
        where: { [codeColumn]: code, [companyColumn]: companyId } as any,
        select: ['id'] as any,
      });

      if (!existing) {
        return code;
      }

      nextNumber++;
      attempts++;
    } while (attempts < maxAttempts);

    // Fallback: use timestamp-based code if all sequence numbers are taken
    const timestamp = Date.now().toString(36).toUpperCase();
    code = `${prefix}${timestamp}${suffix}`;

    return code;
  }

  /**
   * Validate that a manually provided code does not already exist within the same company.
   * Returns true if the code is unique, false otherwise.
   */
  async validateCodeUnique<T extends ObjectLiteral>(
    repository: Repository<T>,
    companyId: number,
    code: string,
    excludeId?: number,
    codeColumn: string = 'code',
    companyColumn: string = 'company_id',
  ): Promise<boolean> {
    const queryBuilder = repository
      .createQueryBuilder('entity')
      .where(`entity.${companyColumn} = :companyId`, { companyId })
      .andWhere(`entity.${codeColumn} = :code`, { code });

    if (excludeId) {
      queryBuilder.andWhere('entity.id != :excludeId', { excludeId });
    }

    const existing = await queryBuilder.getOne();
    return !existing;
  }

  /**
   * Resolve the final code for creation.
   * If the user provides a code, validate its uniqueness (scoped to company).
   * If no code is provided, auto-generate one.
   * Returns the final code to use.
   */
  async resolveCode<T extends ObjectLiteral>(
    repository: Repository<T>,
    companyId: number,
    providedCode: string | undefined | null,
    config: CodeGeneratorConfig = {},
  ): Promise<string> {
    if (providedCode) {
      // User provided a code - validate uniqueness within the same company
      const isUnique = await this.validateCodeUnique(
        repository,
        companyId,
        providedCode,
        undefined,
        config.codeColumn ?? 'code',
        config.companyColumn ?? 'company_id',
      );

      if (!isUnique) {
        throw new ConflictException(
          `Code "${providedCode}" already exists in this company. Please use a different code.`,
        );
      }

      return providedCode;
    }

    // Auto-generate a unique code
    return this.generateCode(repository, companyId, config);
  }
}
