import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Document } from '../../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../../documents/enums/document-module.enum';
import { ProbationCase } from '../entities/probation-case.entity';
import { ProbationExtension } from '../entities/probation-extension.entity';
import { ProbationLetterTypeEnum } from '../enums/probation-letter-type.enum';
import { UpsertProbationLetterTemplateDto } from '../dtos/upsert-probation-letter-template.dto';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { EmployeeLettersService } from '../../letters/employee-letters.service';
import { LetterTemplatesService } from '../../letters/letter-templates.service';
import { LetterTemplate } from '../../letters/entities/letter-template.entity';
import { LetterTypeEnum } from '../../letters/letter-catalogue';
import {
  DEFAULT_LETTER_TIMEZONE,
  formatLetterDate,
  isoDateInTimezone,
} from '../../letters/letter-rules';

const LETTER_DOCUMENT_TYPES: Record<ProbationLetterTypeEnum, string> = {
  [ProbationLetterTypeEnum.CONFIRMATION]: 'CONFIRMATION_LETTER',
  [ProbationLetterTypeEnum.EXTENSION]: 'PROBATION_EXTENSION_LETTER',
  [ProbationLetterTypeEnum.NOT_CONFIRMED]: 'PROBATION_NOT_CONFIRMED_LETTER',
};

const LETTER_TITLES: Record<ProbationLetterTypeEnum, string> = {
  [ProbationLetterTypeEnum.CONFIRMATION]: 'Confirmation Letter',
  [ProbationLetterTypeEnum.EXTENSION]: 'Probation Extension Letter',
  [ProbationLetterTypeEnum.NOT_CONFIRMED]: 'Probation Outcome Letter',
};

/** Probation letter types now live in the Employee Letters module. */
export const PROBATION_TO_LETTER_TYPE: Record<
  ProbationLetterTypeEnum,
  LetterTypeEnum
> = {
  [ProbationLetterTypeEnum.CONFIRMATION]: LetterTypeEnum.CONFIRMATION,
  [ProbationLetterTypeEnum.EXTENSION]: LetterTypeEnum.PROBATION_EXTENSION,
  [ProbationLetterTypeEnum.NOT_CONFIRMED]:
    LetterTypeEnum.PROBATION_NOT_CONFIRMED,
};

@Injectable()
export class ProbationLetterService {
  constructor(
    @InjectRepository(ProbationCase)
    private readonly caseRepository: Repository<ProbationCase>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly letters: EmployeeLettersService,
    private readonly letterTemplates: LetterTemplatesService,
  ) {}

  /**
   * Updates the merged company default template for the probation type
   * (a new template version). Response keeps the old probation shape.
   */
  async upsertTemplate(
    actor: AuthenticatedUser,
    dto: UpsertProbationLetterTemplateDto,
  ) {
    if (!actor.companyId || !actor.companyMembershipId)
      throw new BadRequestException('Company membership required');
    const type = PROBATION_TO_LETTER_TYPE[dto.letter_type];
    await this.letterTemplates.ensureDefaults(actor.companyId);
    const template = await this.letterTemplates.defaultFor(
      actor.companyId,
      type,
    );
    if (!template)
      throw new BadRequestException(
        'No active letter template exists for this probation letter type',
      );
    await this.letterTemplates.update(actor, template.id, {
      body: dto.body.trim(),
      signatory_name: dto.signatory_name.trim(),
      signatory_title: dto.signatory_title.trim(),
      is_default: true,
    });
    const saved = await this.letterTemplates.find(actor.companyId, template.id);
    return this.legacyShape(saved, dto.letter_type, dto.letterhead.trim());
  }

  async listTemplates(actor: AuthenticatedUser) {
    if (!actor.companyId)
      throw new BadRequestException('Company membership required');
    await this.letterTemplates.ensureDefaults(actor.companyId);
    const result: ReturnType<ProbationLetterService['legacyShape']>[] = [];
    for (const legacy of Object.values(ProbationLetterTypeEnum)) {
      const template = await this.letterTemplates.defaultFor(
        actor.companyId,
        PROBATION_TO_LETTER_TYPE[legacy],
      );
      if (template) result.push(this.legacyShape(template, legacy));
    }
    return result;
  }

  private legacyShape(
    template: LetterTemplate,
    legacyType: ProbationLetterTypeEnum,
    letterhead?: string,
  ) {
    return {
      id: template.id,
      companyId: template.company_id,
      letterType: legacyType,
      letterhead: letterhead ?? template.name,
      body: template.body,
      signatoryName: template.signatory_name ?? '',
      signatoryTitle: template.signatory_title ?? '',
      updatedByCompanyUserId: template.updated_by_company_user_id,
      updatedAt: template.updated_at,
      letter_template_id: template.id,
      letter_type: template.letter_type,
    };
  }

  private getCaseRepository(
    manager?: EntityManager,
  ): Repository<ProbationCase> {
    return manager?.getRepository(ProbationCase) ?? this.caseRepository;
  }

  private getDocumentRepository(manager?: EntityManager): Repository<Document> {
    return manager?.getRepository(Document) ?? this.documentRepository;
  }

  async isLetterGenerated(
    probationCaseId: number,
    letterType: ProbationLetterTypeEnum,
    manager?: EntityManager,
  ): Promise<boolean> {
    const existing = await this.getDocumentRepository(manager).findOne({
      where: {
        entity_type: DocumentEntityTypeEnum.PROBATION_CASE,
        entity_id: probationCaseId,
        document_type: LETTER_DOCUMENT_TYPES[letterType],
      },
    });

    return Boolean(existing);
  }

  /**
   * Issues the probation letter through the Employee Letters module (company
   * default template, reference number, QR, no approval step) and returns
   * its Document, still attached to the probation case.
   */
  async generateAndStore(
    companyId: number,
    probationCaseId: number,
    letterType: ProbationLetterTypeEnum,
    manager?: EntityManager,
  ): Promise<Document> {
    const caseRepository = this.getCaseRepository(manager);
    const probationCase = await caseRepository.findOne({
      where: { id: probationCaseId, companyId },
      relations: { employee: true },
    });

    if (!probationCase) {
      throw new NotFoundException('Probation case not found');
    }

    const employee = probationCase.employee;
    const today = isoDateInTimezone(new Date(), DEFAULT_LETTER_TIMEZONE);
    const extra: Record<string, string> = {};
    if (letterType === ProbationLetterTypeEnum.CONFIRMATION) {
      extra.effective_date = probationCase.confirmationDate ?? today;
    } else if (letterType === ProbationLetterTypeEnum.EXTENSION) {
      const extension = await caseRepository.manager
        .getRepository(ProbationExtension)
        .findOne({
          where: { probationCaseId },
          order: { extensionNumber: 'DESC' },
        });
      extra.extension_end_date =
        extension?.newEndDate ?? probationCase.currentDueDate;
      extra.extension_reason =
        extension?.reason?.trim() ||
        'Further time is required to assess your performance against the agreed objectives.';
    } else {
      const lastDay = employee.exit_date ?? today;
      extra.effective_date = today;
      extra.last_working_day = lastDay;
    }

    const date = (value: string | null | undefined) =>
      value ? formatLetterDate(String(value).slice(0, 10)) : '';
    return this.letters.issueSystemLetter(
      companyId,
      probationCase.employeeId,
      PROBATION_TO_LETTER_TYPE[letterType],
      extra,
      null,
      {
        manager,
        valueOverrides: {
          probation_start_date: date(probationCase.originalStartDate),
          probation_end_date: date(probationCase.currentDueDate),
          confirmation_date: date(probationCase.confirmationDate ?? today),
        },
        document: {
          entityType: DocumentEntityTypeEnum.PROBATION_CASE,
          entityId: probationCaseId,
          module: DocumentModuleEnum.PROBATION,
          documentType: LETTER_DOCUMENT_TYPES[letterType],
          title: `${LETTER_TITLES[letterType]} - ${employee.employee_no}`,
          description: `Auto-generated ${LETTER_TITLES[letterType].toLowerCase()} for ${`${employee.first_name} ${employee.last_name}`.trim()}`,
        },
      },
    );
  }
}
