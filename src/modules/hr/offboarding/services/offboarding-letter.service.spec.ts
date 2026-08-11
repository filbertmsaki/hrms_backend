import { Repository } from 'typeorm';
import { OffboardingLetterService } from './offboarding-letter.service';
import { OffboardingLetterTypeEnum } from '../enums/offboarding-letter-type.enum';
import type { OffboardingRequest } from '../entities/offboarding-request.entity';
import type { Document } from '../../documents/entities/document.entity';
import type { FilesService } from '../../../files/files.service';

describe('OffboardingLetterService', () => {
  let requestRepository: {
    findOne: jest.Mock;
  };
  let documentRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let filesService: { savePrivateBufferFile: jest.Mock };
  let service: OffboardingLetterService;

  beforeEach(() => {
    requestRepository = { findOne: jest.fn() };
    documentRepository = {
      findOne: jest.fn(),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: unknown) => value),
    };
    filesService = {
      savePrivateBufferFile: jest.fn().mockResolvedValue({
        storedFileName: 'relieving_letter.pdf',
        originalFileName: 'relieving_letter.pdf',
        mimeType: 'application/pdf',
        fileExtension: '.pdf',
        fileSize: 1234,
        publicPath: '/private-uploads/documents/offboarding/company-10/x.pdf',
      }),
    };

    service = new OffboardingLetterService(
      requestRepository as unknown as Repository<OffboardingRequest>,
      documentRepository as unknown as Repository<Document>,
      filesService as unknown as FilesService,
    );
  });

  it('reports a letter as already generated when a matching document exists', async () => {
    documentRepository.findOne.mockResolvedValue({ id: 5 });

    const result = await service.isLetterGenerated(
      55,
      OffboardingLetterTypeEnum.RELIEVING,
    );

    expect(result).toBe(true);
    expect(documentRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entity_id: 55,
          document_type: 'RELIEVING_LETTER',
        }),
      }),
    );
  });

  it('generates and stores a relieving letter document', async () => {
    requestRepository.findOne.mockResolvedValue({
      id: 55,
      company_id: 10,
      last_working_date: '2026-08-31',
      company: { name: 'Acme Ltd' },
      employee: {
        first_name: 'Jane',
        last_name: 'Doe',
        employee_no: 'EMP-001',
        hire_date: '2020-01-01',
        primary_department: { name: 'Finance' },
        primary_position: { name: 'Accountant' },
      },
    });

    const document = await service.generateAndStore(
      10,
      55,
      OffboardingLetterTypeEnum.RELIEVING,
    );

    expect(filesService.savePrivateBufferFile).toHaveBeenCalled();
    const call = filesService.savePrivateBufferFile.mock.calls[0][0];
    expect(call.mimeType).toBe('application/pdf');
    expect(Buffer.isBuffer(call.buffer)).toBe(true);
    expect(call.buffer.length).toBeGreaterThan(0);

    expect(documentRepository.save).toHaveBeenCalled();
    expect(document).toMatchObject({
      company_id: 10,
      entity_id: 55,
      document_type: 'RELIEVING_LETTER',
    });
  });

  it('throws when the offboarding request cannot be found', async () => {
    requestRepository.findOne.mockResolvedValue(null);

    await expect(
      service.generateAndStore(10, 999, OffboardingLetterTypeEnum.SERVICE),
    ).rejects.toThrow('Offboarding request not found');
  });
});
