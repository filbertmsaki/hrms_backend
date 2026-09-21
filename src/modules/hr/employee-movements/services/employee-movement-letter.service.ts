import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { EntityManager, Repository } from 'typeorm';
import { FilesService } from '../../../files/files.service';
import { HR_PRIVATE_DOCUMENT_MIME_TYPES } from '../../../files/file-policy';
import { Document } from '../../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../../documents/enums/document-module.enum';
import { EmployeeMovement } from '../entities/employee-movement.entity';
import { EmployeeMovementLetterTypeEnum } from '../enums/employee-movement-letter-type.enum';

const LETTER_DOCUMENT_TYPES: Record<EmployeeMovementLetterTypeEnum, string> = {
  [EmployeeMovementLetterTypeEnum.TRANSFER]: 'MOVEMENT_TRANSFER_LETTER',
  [EmployeeMovementLetterTypeEnum.PROMOTION]: 'MOVEMENT_PROMOTION_LETTER',
  [EmployeeMovementLetterTypeEnum.DEMOTION]: 'MOVEMENT_DEMOTION_LETTER',
  [EmployeeMovementLetterTypeEnum.POSITION_CHANGE]:
    'MOVEMENT_POSITION_CHANGE_LETTER',
  [EmployeeMovementLetterTypeEnum.SALARY_REVISION]:
    'MOVEMENT_SALARY_REVISION_LETTER',
  [EmployeeMovementLetterTypeEnum.GENERIC]: 'MOVEMENT_GENERIC_LETTER',
};

const LETTER_TITLES: Record<EmployeeMovementLetterTypeEnum, string> = {
  [EmployeeMovementLetterTypeEnum.TRANSFER]: 'Transfer Letter',
  [EmployeeMovementLetterTypeEnum.PROMOTION]: 'Promotion Letter',
  [EmployeeMovementLetterTypeEnum.DEMOTION]: 'Demotion Letter',
  [EmployeeMovementLetterTypeEnum.POSITION_CHANGE]: 'Position Change Letter',
  [EmployeeMovementLetterTypeEnum.SALARY_REVISION]: 'Salary Revision Letter',
  [EmployeeMovementLetterTypeEnum.GENERIC]: 'Movement Notification Letter',
};

@Injectable()
export class EmployeeMovementLetterService {
  constructor(
    @InjectRepository(EmployeeMovement)
    private readonly movementRepository: Repository<EmployeeMovement>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly filesService: FilesService,
  ) {}

  private getMovementRepository(
    manager?: EntityManager,
  ): Repository<EmployeeMovement> {
    return manager?.getRepository(EmployeeMovement) ?? this.movementRepository;
  }

  private getDocumentRepository(manager?: EntityManager): Repository<Document> {
    return manager?.getRepository(Document) ?? this.documentRepository;
  }

  private renderPdf(input: {
    companyName: string;
    letterType: EmployeeMovementLetterTypeEnum;
    employeeName: string;
    employeeNumber: string;
    movementTitle: string;
    movementType: string;
    reason: string;
    effectiveDate: string;
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
    if (input.letterType === EmployeeMovementLetterTypeEnum.TRANSFER) {
      body = `This letter confirms that ${input.employeeName} (Employee No: ${input.employeeNumber}) has been transferred as part of "${input.movementTitle}", effective ${input.effectiveDate}. Reason: ${input.reason}`;
    } else if (input.letterType === EmployeeMovementLetterTypeEnum.PROMOTION) {
      body = `We are pleased to inform ${input.employeeName} (Employee No: ${input.employeeNumber}) of their promotion, effective ${input.effectiveDate}, as part of "${input.movementTitle}". Reason: ${input.reason}`;
    } else if (input.letterType === EmployeeMovementLetterTypeEnum.DEMOTION) {
      body = `This letter notifies ${input.employeeName} (Employee No: ${input.employeeNumber}) of a change in role effective ${input.effectiveDate}, as part of "${input.movementTitle}". Reason: ${input.reason}`;
    } else if (
      input.letterType === EmployeeMovementLetterTypeEnum.POSITION_CHANGE
    ) {
      body = `This letter confirms a change of position for ${input.employeeName} (Employee No: ${input.employeeNumber}), effective ${input.effectiveDate}, as part of "${input.movementTitle}". Reason: ${input.reason}`;
    } else if (
      input.letterType === EmployeeMovementLetterTypeEnum.SALARY_REVISION
    ) {
      body = `This letter confirms a revision to the compensation of ${input.employeeName} (Employee No: ${input.employeeNumber}), effective ${input.effectiveDate}, as part of "${input.movementTitle}". Reason: ${input.reason}`;
    } else {
      body = `This letter confirms an organizational movement (${input.movementType}) for ${input.employeeName} (Employee No: ${input.employeeNumber}), effective ${input.effectiveDate}, titled "${input.movementTitle}". Reason: ${input.reason}`;
    }

    document.fontSize(11).text(body, { align: 'left' });
    document.moveDown(2);
    document.text('Authorized Signatory');
    document.text(input.companyName);

    document.end();
    return finished;
  }

  async isLetterGenerated(
    movementId: number,
    letterType: EmployeeMovementLetterTypeEnum,
    manager?: EntityManager,
  ): Promise<boolean> {
    const existing = await this.getDocumentRepository(manager).findOne({
      where: {
        entity_type: DocumentEntityTypeEnum.EMPLOYEE_MOVEMENT,
        entity_id: movementId,
        document_type: LETTER_DOCUMENT_TYPES[letterType],
      },
    });

    return Boolean(existing);
  }

  async generateAndStore(
    companyId: number,
    movementId: number,
    letterType: EmployeeMovementLetterTypeEnum,
    manager?: EntityManager,
  ): Promise<Document> {
    const movement = await this.getMovementRepository(manager).findOne({
      where: { id: movementId, companyId },
      relations: {
        employee: {
          primary_department: true,
          primary_position: true,
          company: true,
        },
      },
    });

    if (!movement) {
      throw new NotFoundException('Employee movement not found');
    }

    const employee = movement.employee;
    const employeeName = `${employee.first_name} ${employee.last_name}`.trim();
    const companyName = employee.company?.name ?? 'the company';

    const pdfBuffer = await this.renderPdf({
      companyName,
      letterType,
      employeeName,
      employeeNumber: employee.employee_no,
      movementTitle: movement.title,
      movementType: movement.movementType,
      reason: movement.reason,
      effectiveDate: movement.effectiveDate,
      issueDate: new Date().toISOString().slice(0, 10),
    });

    const storedFile = await this.filesService.savePrivateBufferFile({
      buffer: pdfBuffer,
      fileName: `${LETTER_DOCUMENT_TYPES[letterType].toLowerCase()}.pdf`,
      mimeType: 'application/pdf',
      directorySegments: [
        'documents',
        'employee-movements',
        `company-${companyId}`,
      ],
      fileNamePrefix: `movement-${movementId}-${letterType.toLowerCase()}`,
      allowedMimeTypes: [...HR_PRIVATE_DOCUMENT_MIME_TYPES, 'application/pdf'],
    });

    return this.getDocumentRepository(manager).save(
      this.getDocumentRepository(manager).create({
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.EMPLOYEE_MOVEMENT,
        entity_id: movementId,
        module: DocumentModuleEnum.EMPLOYEE_MOVEMENT,
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
