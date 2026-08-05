import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { FilesService } from '../../files/files.service';
import {
  HR_PRIVATE_DOCUMENT_MAX_BYTES,
  HR_PRIVATE_DOCUMENT_MIME_TYPES,
} from '../../files/file-policy';
import { Document } from './entities/document.entity';
import { DocumentEntityTypeEnum } from './enums/document-entity-type.enum';
import { DocumentModuleEnum } from './enums/document-module.enum';
import { Base64FileDto } from '../../files/dtos/base64-file.dto';

export interface UploadDocumentInput {
  companyId: number;
  entityType: DocumentEntityTypeEnum;
  entityId: number;
  module: DocumentModuleEnum;
  documentTypeCode?: string | null;
  title: string;
  description?: string | null;
  expiryDate?: Date | null;
  file: Base64FileDto;
  uploadedByCompanyUserId: number | null;
  directorySegments: string[];
  fileNamePrefix: string;
}

@Injectable()
export class HrDocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly filesService: FilesService,
  ) {}

  private map(document: Document) {
    return {
      id: document.id,
      entity_type: document.entity_type,
      entity_id: document.entity_id,
      module: document.module,
      document_type: document.document_type,
      title: document.title,
      description: document.description,
      original_file_name: document.original_file_name,
      mime_type: document.mime_type,
      file_size: document.file_size,
      is_verified: document.is_verified,
      verified_at: document.verified_at,
      expiry_date: document.expiry_date,
      created_at: document.created_at,
    };
  }

  async findForEntity(
    companyId: number,
    entityType: DocumentEntityTypeEnum,
    entityId: number,
  ) {
    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: entityType,
        entity_id: entityId,
      },
      order: { created_at: 'DESC' },
    });

    return documents.map((document) => this.map(document));
  }

  async findOneForEntityOrFail(
    companyId: number,
    entityType: DocumentEntityTypeEnum,
    entityId: number,
    documentId: number,
  ): Promise<Document> {
    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        company_id: companyId,
        entity_type: entityType,
        entity_id: entityId,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  async upload(input: UploadDocumentInput) {
    const storedFile = await this.filesService.savePrivateBase64File(
      input.file,
      {
        directorySegments: input.directorySegments,
        fileNamePrefix: input.fileNamePrefix,
        allowedMimeTypes: [...HR_PRIVATE_DOCUMENT_MIME_TYPES],
        maxFileSizeBytes: HR_PRIVATE_DOCUMENT_MAX_BYTES,
        validateFileSignature: true,
      },
    );

    const document = await this.documentRepository.save(
      this.documentRepository.create({
        company_id: input.companyId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        module: input.module,
        document_type: input.documentTypeCode ?? null,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        file_name: storedFile.storedFileName,
        original_file_name: storedFile.originalFileName,
        mime_type: storedFile.mimeType,
        file_extension: storedFile.fileExtension,
        file_size: String(storedFile.fileSize),
        file_path: storedFile.publicPath,
        is_verified: false,
        uploaded_by_company_user_id: input.uploadedByCompanyUserId,
        expiry_date: input.expiryDate ?? null,
      }),
    );

    return this.map(document);
  }

  async getComplianceSummaryForEmployee(companyId: number, employeeId: number) {
    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.EMPLOYEE,
        entity_id: employeeId,
      },
    });

    const now = new Date();

    return {
      total_documents: documents.length,
      verified_documents: documents.filter((document) => document.is_verified)
        .length,
      pending_verification: documents.filter(
        (document) => !document.is_verified,
      ).length,
      expired_documents: documents.filter(
        (document) => document.expiry_date && document.expiry_date < now,
      ).length,
    };
  }

  /**
   * Read the actual stored bytes for download endpoints. Callers are
   * responsible for authorization (company/entity ownership) before calling
   * this — this method only resolves the file, it doesn't check access.
   */
  async readFile(document: Document): Promise<Buffer | null> {
    return this.filesService.readManagedFile(document.file_path);
  }

  async assertCanAccessDocumentOrFail(
    actor: AuthenticatedUser,
    document: Document,
  ): Promise<void> {
    if (!actor.companyId || document.company_id !== actor.companyId) {
      throw new NotFoundException('Document not found');
    }
  }
}
