import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Base64FileDto } from './base64-file.dto';

describe('Base64FileDto', () => {
  it('accepts a complete base64 file payload', async () => {
    const dto = plainToInstance(Base64FileDto, {
      fileName: 'document.pdf',
      fileSize: 12,
      mimeType: 'application/pdf',
      fileString: Buffer.from('hello world!').toString('base64'),
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid file payload', async () => {
    const dto = plainToInstance(Base64FileDto, {
      fileName: 'document',
      fileSize: 0,
      mimeType: 'pdf',
      fileString: 'not-base64',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
