import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { EntityManager, Repository } from 'typeorm';
import { FilesService } from '../../../files/files.service';
import { HR_PRIVATE_DOCUMENT_MIME_TYPES } from '../../../files/file-policy';
import { Document } from '../../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../../documents/enums/document-module.enum';
import { ProbationCase } from '../entities/probation-case.entity';
import { ProbationLetterTypeEnum } from '../enums/probation-letter-type.enum';

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

@Injectable()
export class ProbationLetterService {
  constructor(
    @InjectRepository(ProbationCase)
    private readonly caseRepository: Repository<ProbationCase>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly filesService: FilesService,
  ) {}

  private getCaseRepository(
    manager?: EntityManager,
  ): Repository<ProbationCase> {
    return manager?.getRepository(ProbationCase) ?? this.caseRepository;
  }

  private getDocumentRepository(manager?: EntityManager): Repository<Document> {
    return manager?.getRepository(Document) ?? this.documentRepository;
  }

  private renderPdf(input: {
    companyName: string;
    letterType: ProbationLetterTypeEnum;
    employeeName: string;
    employeeNumber: string;
    position: string;
    department: string;
    hireDate: string;
    probationStartDate: string;
    probationEndDate: string;
    confirmationDate: string;
    issueDate: string;
  }): Promise<Buffer> {
    const document = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
    });

    document.fontSize(16).font('Helvetica-Bold').text(input.companyName);
    document
      .fontSize(12)
      .font('Helvetica')
      .text(LETTER_TITLES[input.letterType]);
    document.moveDown(1);
    document.fontSize(10).text(`Date: ${input.issueDate}`);
    document.moveDown(1);

    let body: string;
    if (input.letterType === ProbationLetterTypeEnum.CONFIRMATION) {
      body = `We are pleased to confirm that ${input.employeeName} (Employee No: ${input.employeeNumber}), who joined as ${input.position} in the ${input.department} department on ${input.hireDate}, has successfully completed the probationary period and is confirmed as a permanent employee effective ${input.confirmationDate}.`;
    } else if (input.letterType === ProbationLetterTypeEnum.EXTENSION) {
      body = `This is to notify ${input.employeeName} (Employee No: ${input.employeeNumber}) that their probationary period has been extended. The revised probation end date is ${input.probationEndDate}.`;
    } else {
      body = `This letter records the outcome of the probationary review for ${input.employeeName} (Employee No: ${input.employeeNumber}), whose probation period ran from ${input.probationStartDate} to ${input.probationEndDate}.`;
    }

    document.fontSize(11).text(body, { align: 'left' });
    document.moveDown(2);
    document.text('Authorized Signatory');
    document.text(input.companyName);

    document.end();
    return finished;
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

  async generateAndStore(
    companyId: number,
    probationCaseId: number,
    letterType: ProbationLetterTypeEnum,
    manager?: EntityManager,
  ): Promise<Document> {
    const probationCase = await this.getCaseRepository(manager).findOne({
      where: { id: probationCaseId, companyId },
      relations: {
        employee: {
          primary_department: true,
          primary_position: true,
          company: true,
        },
      },
    });

    if (!probationCase) {
      throw new NotFoundException('Probation case not found');
    }

    const employee = probationCase.employee;
    const employeeName = `${employee.first_name} ${employee.last_name}`.trim();
    const companyName = employee.company?.name ?? 'the company';

    const pdfBuffer = await this.renderPdf({
      companyName,
      letterType,
      employeeName,
      employeeNumber: employee.employee_no,
      position: employee.primary_position?.name ?? 'N/A',
      department: employee.primary_department?.name ?? 'N/A',
      hireDate: employee.hire_date ?? 'N/A',
      probationStartDate: probationCase.originalStartDate,
      probationEndDate: probationCase.currentDueDate,
      confirmationDate:
        probationCase.confirmationDate ?? new Date().toISOString().slice(0, 10),
      issueDate: new Date().toISOString().slice(0, 10),
    });

    const storedFile = await this.filesService.savePrivateBufferFile({
      buffer: pdfBuffer,
      fileName: `${LETTER_DOCUMENT_TYPES[letterType].toLowerCase()}.pdf`,
      mimeType: 'application/pdf',
      directorySegments: ['documents', 'probation', `company-${companyId}`],
      fileNamePrefix: `probation-${probationCaseId}-${letterType.toLowerCase()}`,
      allowedMimeTypes: [...HR_PRIVATE_DOCUMENT_MIME_TYPES, 'application/pdf'],
    });

    return this.getDocumentRepository(manager).save(
      this.getDocumentRepository(manager).create({
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.PROBATION_CASE,
        entity_id: probationCaseId,
        module: DocumentModuleEnum.PROBATION,
        document_type: LETTER_DOCUMENT_TYPES[letterType],
        title: `${LETTER_TITLES[letterType]} - ${employee.employee_no}`,
        description: `Auto-generated ${LETTER_TITLES[letterType].toLowerCase()} for ${employeeName}`,
        file_name: storedFile.storedFileName,
        original_file_name: storedFile.originalFileName,
        mime_type: storedFile.mimeType,
        file_extension: storedFile.fileExtension,
        file_size: String(storedFile.fileSize),
        file_path: storedFile.publicPath,
        uploaded_by_company_user_id: null,
        expiry_date: null,
      }),
    );
  }
}
