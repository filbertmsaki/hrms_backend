import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventsService } from '../../security/security-events.service';
import { ConfigureEmployeeNumberDto } from './dtos/configure-employee-number.dto';
import { Employee } from './entities/employee.entity';
import { EmployeeNumberSequence } from './entities/employee-number-sequence.entity';

@Injectable()
export class EmployeeNumberService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(EmployeeNumberSequence)
    private readonly sequenceRepository: Repository<EmployeeNumberSequence>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  private normalizePrefix(prefix: string): string {
    return prefix.trim().toUpperCase();
  }

  private formatEmployeeNumber(
    sequence: Pick<EmployeeNumberSequence, 'prefix' | 'padding'>,
    number: number,
  ): string {
    return [
      sequence.prefix,
      String(number).padStart(sequence.padding, '0'),
    ].join('/');
  }

  async getConfiguration(companyId: number): Promise<EmployeeNumberSequence> {
    const configuration = await this.sequenceRepository.findOne({
      where: { company_id: companyId },
    });

    if (!configuration) {
      throw new NotFoundException(
        'Employee number configuration has not been created for this company',
      );
    }

    return configuration;
  }

  async configure(
    companyId: number,
    dto: ConfigureEmployeeNumberDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
  ): Promise<EmployeeNumberSequence> {
    const normalizedPrefix = this.normalizePrefix(dto.prefix);

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmployeeNumberSequence);
      let configuration = await repository
        .createQueryBuilder('sequence')
        .setLock('pessimistic_write')
        .where('sequence.company_id = :companyId', { companyId })
        .getOne();

      if (!configuration) {
        configuration = repository.create({
          company_id: companyId,
          prefix: normalizedPrefix,
          padding: dto.padding ?? 3,
          next_number: dto.next_number ?? 1,
          updated_by_company_user_id: actor.companyMembershipId ?? null,
        });

        return repository.save(configuration);
      }

      if (
        dto.next_number !== undefined &&
        dto.next_number < configuration.next_number
      ) {
        throw new BadRequestException(
          `next_number cannot be reduced below ${configuration.next_number}`,
        );
      }

      const oldValues = {
        prefix: configuration.prefix,
        padding: configuration.padding,
        next_number: configuration.next_number,
      };

      configuration.prefix = normalizedPrefix;
      configuration.padding = dto.padding ?? configuration.padding;
      configuration.next_number = dto.next_number ?? configuration.next_number;
      configuration.updated_by_company_user_id =
        actor.companyMembershipId ?? null;

      const saved = await repository.save(configuration);

      await this.securityEventsService.log(
        {
          eventType: SecurityEventType.EMPLOYEE_NUMBER_CONFIGURATION_UPDATED,
          outcome: SecurityEventOutcome.SUCCESS,
          actor,
          companyId,
          resourceType: 'employee_number_sequence',
          resourceId: saved.id,
          oldValues,
          newValues: {
            prefix: saved.prefix,
            padding: saved.padding,
            next_number: saved.next_number,
          },
          context,
        },
        manager,
      );

      return saved;
    });
  }

  async allocateNext(companyId: number): Promise<string> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const repository = manager.getRepository(EmployeeNumberSequence);
      const sequence = await repository
        .createQueryBuilder('sequence')
        .setLock('pessimistic_write')
        .where('sequence.company_id = :companyId', { companyId })
        .getOne();

      if (!sequence) {
        throw new BadRequestException(
          'Configure the employee number prefix before creating employees',
        );
      }

      const allocatedNumber = sequence.next_number;
      const employeeNumber = this.formatEmployeeNumber(
        sequence,
        allocatedNumber,
      );
      sequence.next_number = allocatedNumber + 1;

      await repository.save(sequence);
      return employeeNumber;
    });
  }

  async reserveImportedNumber(
    companyId: number,
    employeeNumber: string,
  ): Promise<string> {
    const normalized = employeeNumber.trim().toUpperCase();

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const sequence = await manager
        .getRepository(EmployeeNumberSequence)
        .createQueryBuilder('sequence')
        .setLock('pessimistic_write')
        .where('sequence.company_id = :companyId', { companyId })
        .getOne();

      if (!sequence) {
        throw new BadRequestException(
          'Employee number configuration is missing',
        );
      }

      const pattern = new RegExp(`^${sequence.prefix}/(\\d+)$`);
      const match = normalized.match(pattern);
      if (!match) {
        throw new BadRequestException(
          `Imported employee number must use format ${sequence.prefix}/${'0'.repeat(sequence.padding)}`,
        );
      }

      const numericValue = Number(match[1]);
      if (!Number.isInteger(numericValue) || numericValue < 1) {
        throw new BadRequestException('Invalid employee number');
      }

      const existing = await manager.getRepository(Employee).findOne({
        where: { company_id: companyId, employee_no: normalized },
        select: ['id'],
      });

      if (existing) {
        throw new ConflictException(
          `Employee number "${normalized}" already exists`,
        );
      }

      if (numericValue >= sequence.next_number) {
        sequence.next_number = numericValue + 1;
        await manager.getRepository(EmployeeNumberSequence).save(sequence);
      }

      return normalized;
    });
  }
}
