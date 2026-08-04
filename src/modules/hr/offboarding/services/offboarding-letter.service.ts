import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { EntityManager, Repository } from 'typeorm';
import { FilesService } from '../../../files/files.service';
import { HR_PRIVATE_DOCUMENT_MIME_TYPES } from '../../../files/file-policy';
import { Document } from '../../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../../documents/enums/document-module.enum';
import { OffboardingRequest } from '../entities/offboarding-request.entity';
import { OffboardingLetterTypeEnum } from '../enums/offboarding-letter-type.enum';

const LETTER_DOCUMENT_TYPES: Record<OffboardingLetterTypeEnum, string> = {
  [OffboardingLetterTypeEnum.RELIEVING]: 'RELIEVING_LETTER',
  [OffboardingLetterTypeEnum.SERVICE]: 'SERVICE_LETTER',
};

const LETTER_TITLES: Record<OffboardingLetterTypeEnum, string> = {
  [OffboardingLetterTypeEnum.RELIEVING]: 'Relieving Letter',
  [OffboardingLetterTypeEnum.SERVICE]: 'Service Letter',
};

@Injectable()
export class OffboardingLetterService {
  constructor(
    @InjectRepository(OffboardingRequest)
    private readonly requestRepository: Repository<OffboardingRequest>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly filesService: FilesService,
  ) {}

  private getRequestRepository(
    manager?: EntityManager,
  ): Repository<OffboardingRequest> {
    return manager?.getRepository(OffboardingRequest) ?? this.requestRepository;
  }

  private getDocumentRepository(manager?: EntityManager): Repository<Document> {
    return manager?.getRepository(Document) ?? this.documentRepository;
  }

  private renderPdf(input: {
    companyName: string;
    letterType: OffboardingLetterTypeEnum;
    employeeName: string;
    employeeNumber: string;
    position: string;
    department: string;
    hireDate: string;
    lastWorkingDate: string;
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

    const body =
      input.letterType === OffboardingLetterTypeEnum.RELIEVING
        ? `This is to confirm that ${input.employeeName} (Employee No: ${input.employeeNumber}), who worked as ${input.position} in the ${input.department} department, has been relieved of their duties effective ${input.lastWorkingDate}. All handover formalities have been completed as part of the offboarding process.`
        : `This is to certify that ${input.employeeName} (Employee No: ${input.employeeNumber}) was employed with ${input.companyName} from ${input.hireDate} to ${input.lastWorkingDate}, serving as ${input.position} in the ${input.department} department.`;

    document.fontSize(11).text(body, { align: 'left' });
    document.moveDown(2);
    document.text('Authorized Signatory');
    document.text(input.companyName);

    document.end();
    return finished;
  }

  async isLetterGenerated(
    offboardingRequestId: number,
    letterType: OffboardingLetterTypeEnum,
    manager?: EntityManager,
  ): Promise<boolean> {
    const existing = await this.getDocumentRepository(manager).findOne({
      where: {
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: offboardingRequestId,
        document_type: LETTER_DOCUMENT_TYPES[letterType],
      },
    });
    return Boolean(existing);
  }

  async generateAndStore(
    companyId: number,
    offboardingRequestId: number,
    letterType: OffboardingLetterTypeEnum,
    manager?: EntityManager,
  ): Promise<Document> {
    const request = await this.getRequestRepository(manager).findOne({
      where: { id: offboardingRequestId, company_id: companyId },
      relations: {
        employee: {
          primary_department: true,
          primary_position: true,
        },
        company: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Offboarding request not found');
    }

    const employee = request.employee;
    const employeeName = `${employee.first_name} ${employee.last_name}`.trim();
    const companyName = request.company?.name ?? 'the company';

    const pdfBuffer = await this.renderPdf({
      companyName,
      letterType,
      employeeName,
      employeeNumber: employee.employee_no,
      position: employee.primary_position?.name ?? 'N/A',
      department: employee.primary_department?.name ?? 'N/A',
      hireDate: employee.hire_date ?? 'N/A',
      lastWorkingDate: request.last_working_date,
      issueDate: new Date().toISOString().slice(0, 10),
    });

    const storedFile = await this.filesService.savePrivateBufferFile({
      buffer: pdfBuffer,
      fileName: `${LETTER_DOCUMENT_TYPES[letterType].toLowerCase()}.pdf`,
      mimeType: 'application/pdf',
      directorySegments: ['documents', 'offboarding', `company-${companyId}`],
      fileNamePrefix: `offboarding-${offboardingRequestId}-${letterType.toLowerCase()}`,
      allowedMimeTypes: [...HR_PRIVATE_DOCUMENT_MIME_TYPES, 'application/pdf'],
    });

    return this.getDocumentRepository(manager).save(
      this.getDocumentRepository(manager).create({
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: offboardingRequestId,
        module: DocumentModuleEnum.OFFBOARDING,
        document_type: LETTER_DOCUMENT_TYPES[letterType],
        title: LETTER_TITLES[letterType],
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
