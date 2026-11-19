import PDFKit from 'pdfkit';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  SupportingDocumentError,
  assignPageRanges,
  mergeLeavePdf,
  prepareSupportingDocuments,
} from './leave-pdf-attachments';

async function pdfWithPages(n: number, label: string): Promise<Buffer> {
  const doc = new PDFKit({ size: 'A4' });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) =>
    doc.on('end', () => r(Buffer.concat(chunks))),
  );
  for (let i = 0; i < n; i++) {
    if (i) doc.addPage();
    doc.text(`${label} ${i + 1}`);
  }
  doc.end();
  return done;
}

describe('leave PDF supporting documents', () => {
  // PDF rendering is CPU-bound; the default 5s is too tight under parallel load.
  jest.setTimeout(20_000);
  it('appends PDFs and images in upload order and merges into one PDF', async () => {
    const form = await pdfWithPages(2, 'form');
    const cert = await pdfWithPages(2, 'certificate');
    const png = await QRCode.toBuffer('img', { width: 300 });
    const prepared = await prepareSupportingDocuments(
      [
        {
          id: 1,
          file_name: 'cert.pdf',
          mime_type: 'application/pdf',
          buffer: cert,
        },
        { id: 2, file_name: 'photo.png', mime_type: 'image/png', buffer: png },
        {
          id: 3,
          file_name: 'notes.txt',
          mime_type: 'text/plain',
          buffer: Buffer.from('hello'),
        },
      ],
      'LV-2026-000007',
    );
    expect(prepared.map((p) => [p.id, p.disposition, p.page_count])).toEqual([
      [1, 'appended', 2],
      [2, 'appended', 1],
      [3, 'appended', 1],
    ]);
    const ranges = assignPageRanges(prepared, 2);
    expect(ranges.get(1)).toEqual({ from: 3, to: 4 });
    expect(ranges.get(2)).toEqual({ from: 5, to: 5 });
    expect(ranges.get(3)).toEqual({ from: 6, to: 6 });

    const merged = await mergeLeavePdf(
      form,
      prepared,
      'LV-2026-000007',
      'title',
    );
    const out = await PDFDocument.load(merged);
    expect(out.getPageCount()).toBe(6);
    expect(out.getTitle()).toBe('title');
  });

  it('keeps image pages undistorted and never upscales small images', async () => {
    const small = await QRCode.toBuffer('x', { width: 120 });
    const [prepared] = await prepareSupportingDocuments(
      [{ id: 1, file_name: 'a.png', mime_type: 'image/png', buffer: small }],
      'LV-1',
    );
    const page = prepared.pdf!.getPage(0);
    expect(page.getWidth()).toBeCloseTo(595.28, 1);
    expect(page.getHeight()).toBeCloseTo(841.89, 1);
  });

  it('lists unconvertible, duplicate and self-copy documents instead of appending them', async () => {
    const cert = await pdfWithPages(1, 'certificate');
    const prepared = await prepareSupportingDocuments(
      [
        {
          id: 1,
          file_name: 'cert.pdf',
          mime_type: 'application/pdf',
          buffer: cert,
        },
        {
          id: 2,
          file_name: 'cert-copy.pdf',
          mime_type: 'application/pdf',
          buffer: cert,
        },
        {
          id: 3,
          file_name: 'lab.docx',
          mime_type:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: Buffer.from('PK'),
        },
        {
          id: 4,
          file_name: 'Leave_Application_LV-2026-000007.pdf',
          mime_type: 'application/pdf',
          buffer: await pdfWithPages(1, 'form'),
        },
        {
          // Another application's form is a legitimate supporting document.
          id: 5,
          file_name: 'Leave_Application_LV-2026-000006-1-.pdf',
          mime_type: 'application/pdf',
          buffer: await pdfWithPages(1, 'other form'),
        },
      ],
      'LV-2026-000007',
    );
    expect(prepared.map((p) => p.disposition)).toEqual([
      'appended',
      'duplicate',
      'not_convertible',
      'self',
      'appended',
    ]);
  });

  it('fails clearly when a file is missing, damaged or not what it claims', async () => {
    await expect(
      prepareSupportingDocuments(
        [
          {
            id: 1,
            file_name: 'gone.pdf',
            mime_type: 'application/pdf',
            buffer: null,
          },
          {
            id: 2,
            file_name: 'broken.pdf',
            mime_type: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4 garbage'),
          },
          {
            id: 3,
            file_name: 'fake.png',
            mime_type: 'image/png',
            buffer: Buffer.from('not an image'),
          },
        ],
        'LV-1',
      ),
    ).rejects.toMatchObject({
      constructor: SupportingDocumentError,
      failures: [
        { file_name: 'gone.pdf', problem: 'file is missing from storage' },
        {
          file_name: 'broken.pdf',
          problem: expect.stringContaining('cannot be read'),
        },
        {
          file_name: 'fake.png',
          problem: expect.stringContaining('not a PNG/JPEG'),
        },
      ],
    });
  });
});
