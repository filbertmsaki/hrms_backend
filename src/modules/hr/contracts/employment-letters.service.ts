import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { FilesService } from '../../files/files.service';
import { Company } from '../../companies/entities/company.entity';
import { Document } from '../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { Employee } from '../employees/entities/employee.entity';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from '../employee-movements/entities/employee-compensation-version.entity';
import { RecruitmentCandidate } from '../recruitment/entities/recruitment-candidate.entity';
import { RecruitmentRequest } from '../recruitment/entities/recruitment-request.entity';
import { Position } from '../positions/entities/position.entity';
import { Department } from '../departments/entities/department.entity';
import {
  EmploymentLetterTemplate,
  EmploymentLetterType,
} from './entities/employment-letter-template.entity';
import { UpsertEmploymentLetterTemplateDto } from './dto/upsert-employment-letter-template.dto';

const TEMPLATE_KEYS = [
  'company_name',
  'employee_name',
  'employee_number',
  'position',
  'department',
  'hire_date',
  'salary',
  'currency',
  'pay_frequency',
  'issue_date',
] as const;

export function renderEmploymentLetterBody(
  template: string,
  values: Record<string, string>,
) {
  const tokens = [...template.matchAll(/\{\{([^}]+)\}\}/g)];
  for (const match of tokens) {
    const key = match[1].trim();
    if (!(TEMPLATE_KEYS as readonly string[]).includes(key)) {
      throw new BadRequestException(`Unknown template field: ${key}`);
    }
    if (!values[key]?.trim()) {
      throw new BadRequestException(
        `Template value ${key} is not available for this record`,
      );
    }
  }
  return template.replace(
    /\{\{([^}]+)\}\}/g,
    (_match, rawKey: string) => values[rawKey.trim()],
  );
}

@Injectable()
export class EmploymentLettersService {
  constructor(
    @InjectRepository(EmploymentLetterTemplate)
    private readonly templateRepository: Repository<EmploymentLetterTemplate>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(RecruitmentCandidate)
    private readonly candidateRepository: Repository<RecruitmentCandidate>,
    @InjectRepository(RecruitmentRequest)
    private readonly recruitmentRequestRepository: Repository<RecruitmentRequest>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeCompensationVersion)
    private readonly compensationRepository: Repository<EmployeeCompensationVersion>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly filesService: FilesService,
  ) {}

  async listTemplates(actor: AuthenticatedUser) {
    const companyId = this.companyId(actor);
    return this.templateRepository.find({
      where: { companyId },
      order: { letterType: 'ASC' },
    });
  }

  async upsertTemplate(
    actor: AuthenticatedUser,
    dto: UpsertEmploymentLetterTemplateDto,
  ) {
    const companyId = this.companyId(actor);
    const current = await this.templateRepository.findOneBy({
      companyId,
      letterType: dto.letter_type,
    });
    const unknownTokens = [...dto.body.matchAll(/\{\{([^}]+)\}\}/g)]
      .map((match) => match[1].trim())
      .filter((key) => !(TEMPLATE_KEYS as readonly string[]).includes(key));
    if (unknownTokens.length) {
      throw new BadRequestException(
        `Unknown template field: ${unknownTokens[0]}`,
      );
    }
    return this.templateRepository.save(
      this.templateRepository.create({
        id: current?.id,
        companyId,
        letterType: dto.letter_type,
        title: dto.title.trim(),
        body: dto.body.trim(),
        signatoryName: dto.signatory_name.trim(),
        signatoryTitle: dto.signatory_title.trim(),
        updatedByCompanyUserId: actor.companyMembershipId!,
        version: (current?.version ?? 0) + 1,
      }),
    );
  }

  async generateForCandidate(actor: AuthenticatedUser, candidateId: number) {
    const companyId = this.companyId(actor);
    const candidate = await this.candidateRepository.findOneBy({
      id: candidateId,
      companyId,
    });
    if (!candidate)
      throw new NotFoundException('Recruitment candidate not found');
    if (!candidate.offerSalary || !candidate.offerStartDate) {
      throw new BadRequestException(
        'Draft the candidate offer before generating its letter',
      );
    }
    const request = await this.recruitmentRequestRepository.findOneBy({
      id: candidate.requestId,
      companyId,
    });
    if (!request) throw new NotFoundException('Recruitment request not found');
    const position = await this.positionRepository.findOneBy({
      id: request.positionId,
      company_id: companyId,
    });
    const department = position?.department_id
      ? await this.departmentRepository.findOneBy({
          id: position.department_id,
          company_id: companyId,
        })
      : null;
    const values = await this.values(
      companyId,
      {
        employeeName:
          `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim(),
        employeeNumber: 'Assigned after registration',
        position: position?.name ?? request.jobTitle,
        department: department?.name ?? 'N/A',
        hireDate: candidate.offerStartDate,
        salary: candidate.offerSalary,
        currency: '',
        payFrequency: '',
      },
      EmploymentLetterType.OFFER,
    );
    const document = await this.storePdf(
      companyId,
      DocumentEntityTypeEnum.CANDIDATE,
      candidate.id,
      EmploymentLetterType.OFFER,
      values,
      actor.companyMembershipId!,
    );
    candidate.offerDocumentId = document.id;
    await this.candidateRepository.save(candidate);
    return this.mapDocument(document);
  }

  async generateForEmployee(
    actor: AuthenticatedUser,
    employeeId: number,
    type: EmploymentLetterType = EmploymentLetterType.APPOINTMENT,
  ) {
    const values = await this.employeeLetterValues(actor, employeeId, type);
    const document = await this.storePdf(
      this.companyId(actor),
      DocumentEntityTypeEnum.EMPLOYEE,
      employeeId,
      type,
      values,
      actor.companyMembershipId!,
    );
    return this.mapDocument(document);
  }

  async previewForEmployee(
    actor: AuthenticatedUser,
    employeeId: number,
    type: EmploymentLetterType,
  ) {
    const values = await this.employeeLetterValues(actor, employeeId, type);
    const buffer = await this.renderPdf(values);
    return {
      file_name: `${type.toLowerCase()}-preview.pdf`,
      mime_type: 'application/pdf',
      content_base64: buffer.toString('base64'),
    };
  }

  private async employeeLetterValues(
    actor: AuthenticatedUser,
    employeeId: number,
    type: EmploymentLetterType,
  ) {
    if (
      ![
        EmploymentLetterType.APPOINTMENT,
        EmploymentLetterType.JOINING_FORM,
        EmploymentLetterType.OTHER,
      ].includes(type)
    ) {
      throw new BadRequestException('Unsupported employee letter type');
    }
    const companyId = this.companyId(actor);
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
      relations: {
        company: true,
        primary_position: true,
        primary_department: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const compensation = await this.compensationRepository.findOne({
      where: {
        companyId,
        employeeId,
        status: EmployeeCompensationVersionStatusEnum.ACTIVE,
      },
      order: { effectiveFrom: 'DESC' },
    });
    const values = await this.values(
      companyId,
      {
        employeeName: `${employee.first_name} ${employee.last_name}`.trim(),
        employeeNumber: employee.employee_no,
        position: employee.primary_position?.name ?? 'N/A',
        department: employee.primary_department?.name ?? 'N/A',
        hireDate: employee.hire_date ?? 'N/A',
        salary: compensation?.baseSalary ?? '',
        currency: compensation?.currency ?? '',
        payFrequency: compensation?.payFrequency ?? '',
      },
      type,
    );
    return values;
  }

  async employeeHistory(actor: AuthenticatedUser, employeeId: number) {
    const companyId = this.companyId(actor);
    const employee = await this.employeeRepository.findOneBy({
      id: employeeId,
      company_id: companyId,
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.EMPLOYEE,
        entity_id: employeeId,
        module: DocumentModuleEnum.CONTRACT,
      },
      order: { created_at: 'DESC' },
      take: 100,
    });
    return documents.map((document) => this.mapDocument(document));
  }

  async download(actor: AuthenticatedUser, documentId: number) {
    const companyId = this.companyId(actor);
    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        company_id: companyId,
        module: DocumentModuleEnum.CONTRACT,
        document_type: In([
          'OFFER_LETTER',
          'APPOINTMENT_LETTER',
          'JOINING_FORM_LETTER',
          'OTHER_LETTER',
        ]),
      },
    });
    if (!document) throw new NotFoundException('Employment letter not found');
    const buffer = await this.filesService.readManagedFile(document.file_path);
    if (!buffer)
      throw new NotFoundException('Employment letter file not found');
    return {
      buffer,
      fileName: document.original_file_name,
      mimeType: document.mime_type ?? 'application/pdf',
    };
  }

  private async values(
    companyId: number,
    person: Record<string, string>,
    type: EmploymentLetterType,
  ) {
    const template = await this.templateRepository.findOneBy({
      companyId,
      letterType: type,
    });
    if (!template)
      throw new BadRequestException(
        `Configure the ${type.toLowerCase()} letter template first`,
      );
    const company = await this.companyRepository.findOneBy({ id: companyId });
    return {
      template,
      body: renderEmploymentLetterBody(template.body, {
        ...person,
        company_name: company?.name ?? '',
        issue_date: new Date().toISOString().slice(0, 10),
      }),
      companyName: company?.name ?? '',
      person,
    };
  }

  private async storePdf(
    companyId: number,
    entityType: DocumentEntityTypeEnum,
    entityId: number,
    type: EmploymentLetterType,
    values: Awaited<ReturnType<EmploymentLettersService['values']>>,
    actorCompanyUserId: number,
  ) {
    const buffer = await this.renderPdf(values);
    const file = await this.filesService.savePrivateBufferFile({
      buffer,
      fileName: `${type.toLowerCase()}-letter.pdf`,
      mimeType: 'application/pdf',
      directorySegments: [
        'documents',
        'employment-letters',
        `company-${companyId}`,
      ],
      fileNamePrefix: `${type.toLowerCase()}-${entityType.toLowerCase()}-${entityId}`,
      allowedMimeTypes: ['application/pdf'],
    });
    return this.documentRepository.save(
      this.documentRepository.create({
        company_id: companyId,
        entity_type: entityType,
        entity_id: entityId,
        module: DocumentModuleEnum.CONTRACT,
        document_type: `${type}_LETTER`,
        title: values.template.title,
        description: `${type.toLowerCase()} letter generated from template ${values.template.id} version ${values.template.version}`,
        file_name: file.storedFileName,
        original_file_name: file.originalFileName,
        mime_type: file.mimeType,
        file_extension: file.fileExtension,
        file_size: String(file.fileSize),
        file_path: file.publicPath,
        uploaded_by_company_user_id: actorCompanyUserId,
        metadata: {
          template_id: values.template.id,
          template_version: values.template.version,
          letter_type: type,
          generated_by_company_user_id: actorCompanyUserId,
        },
      }),
    );
  }

  private async renderPdf(
    values: Awaited<ReturnType<EmploymentLettersService['values']>>,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const pdf = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      pdf.fontSize(16).font('Helvetica-Bold').text(values.companyName);
      pdf
        .moveDown()
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(values.template.title);
      pdf
        .moveDown()
        .fontSize(11)
        .font('Helvetica')
        .text(values.body, { lineGap: 3 });
      pdf
        .moveDown(2)
        .font('Helvetica-Bold')
        .text(values.template.signatoryName);
      pdf.font('Helvetica').text(values.template.signatoryTitle);
      pdf.end();
    });
  }

  private mapDocument(document: Document) {
    return {
      id: document.id,
      title: document.title,
      document_type: document.document_type,
      entity_type: document.entity_type,
      entity_id: document.entity_id,
      file_name: document.original_file_name,
      download_url: `/api/employment-letters/documents/${document.id}/download`,
      created_at: document.created_at,
    };
  }

  private companyId(actor: AuthenticatedUser) {
    if (!actor.companyId || !actor.companyMembershipId)
      throw new BadRequestException('Active company context is required');
    return actor.companyId;
  }
}
