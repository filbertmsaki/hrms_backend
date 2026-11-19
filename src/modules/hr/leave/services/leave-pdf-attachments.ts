import { createHash } from 'crypto';
import PDFKitDocument from 'pdfkit';
import { PDFDocument, PDFImage, StandardFonts, rgb } from 'pdf-lib';

/**
 * Supporting documents appended after the Leave Application Form, so the
 * download is one PDF. PDFs keep their pages and order; PNG / JPEG become
 * A4 pages (no upscaling, orientation follows the image); plain text is
 * typeset. Formats without an approved converter (Word, Excel, WebP) are
 * listed on the form as held in HRMS — never silently dropped. A missing or
 * damaged file is an error: no "complete" document is produced without it.
 */

export type SupportingSource = {
  id: number;
  file_name: string;
  mime_type: string;
  /** null → the file could not be read from storage. */
  buffer: Buffer | null;
};

export type PreparedSupporting = {
  id: number;
  file_name: string;
  disposition: 'appended' | 'not_convertible' | 'self' | 'duplicate';
  /** Rendered pages (appended only). */
  pdf: PDFDocument | null;
  page_count: number;
};

export class SupportingDocumentError extends Error {
  constructor(
    public readonly failures: { file_name: string; problem: string }[],
  ) {
    super(
      `Supporting document(s) could not be included: ${failures
        .map((f) => `${f.file_name} (${f.problem})`)
        .join('; ')}`,
    );
  }
}

const A4 = { w: 595.28, h: 841.89 };
const IMAGE_MARGIN = 36;
const STAMP_BAND = 18;
export const SUPPORTING_MAX_BYTES = 10 * 1024 * 1024;

function sniff(buffer: Buffer): 'pdf' | 'png' | 'jpeg' | null {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'jpeg';
  return null;
}

async function imagePage(
  buffer: Buffer,
  kind: 'png' | 'jpeg',
): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const image: PDFImage =
    kind === 'png' ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);
  const landscape = image.width > image.height;
  const pageW = landscape ? A4.h : A4.w;
  const pageH = landscape ? A4.w : A4.h;
  const boxW = pageW - 2 * IMAGE_MARGIN;
  const boxH = pageH - 2 * IMAGE_MARGIN - STAMP_BAND;
  // 96 dpi → points; scale down to fit, never up.
  const naturalW = image.width * 0.75;
  const naturalH = image.height * 0.75;
  const scale = Math.min(1, boxW / naturalW, boxH / naturalH);
  const w = naturalW * scale;
  const h = naturalH * scale;
  const page = pdf.addPage([pageW, pageH]);
  page.drawImage(image, {
    x: (pageW - w) / 2,
    y: STAMP_BAND + IMAGE_MARGIN + (boxH - h) / 2,
    width: w,
    height: h,
  });
  return pdf;
}

async function textPages(text: string, title: string): Promise<PDFDocument> {
  const doc = new PDFKitDocument({
    size: 'A4',
    margins: { top: 50, bottom: 60, left: 56, right: 56 },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.font('Helvetica-Bold').fontSize(10).text(title);
  doc.moveDown(0.5);
  doc.font('Courier').fontSize(9).text(text.replace(/\r\n/g, '\n'));
  doc.end();
  return PDFDocument.load(await done);
}

/**
 * Validates and converts each document. Throws SupportingDocumentError when
 * any document that should be appended cannot be (missing, oversized,
 * damaged, encrypted, or content that does not match its type).
 */
export async function prepareSupportingDocuments(
  sources: SupportingSource[],
  formReference: string,
): Promise<PreparedSupporting[]> {
  const failures: { file_name: string; problem: string }[] = [];
  const seen = new Map<string, string>();
  const out: PreparedSupporting[] = [];
  const selfName = new RegExp(
    `^Leave_Application_${formReference.replace(/[^A-Za-z0-9]/g, '.?')}(_Complete)?([-_ (]\\d+[)-]?)*\\.pdf$`,
    'i',
  );
  for (const s of sources) {
    const base = { id: s.id, file_name: s.file_name, pdf: null, page_count: 0 };
    if (selfName.test(s.file_name)) {
      out.push({ ...base, disposition: 'self' });
      continue;
    }
    if (!s.buffer) {
      failures.push({
        file_name: s.file_name,
        problem: 'file is missing from storage',
      });
      continue;
    }
    if (s.buffer.length > SUPPORTING_MAX_BYTES) {
      failures.push({ file_name: s.file_name, problem: 'file exceeds 10 MB' });
      continue;
    }
    const hash = createHash('sha256').update(s.buffer).digest('hex');
    if (seen.has(hash)) {
      out.push({ ...base, disposition: 'duplicate' });
      continue;
    }
    const mime = (s.mime_type || '').toLowerCase();
    const kind = sniff(s.buffer);
    try {
      if (mime === 'application/pdf' || kind === 'pdf') {
        if (kind !== 'pdf') throw new Error('content is not a PDF');
        const pdf = await PDFDocument.load(s.buffer, { updateMetadata: false });
        if (!pdf.getPageCount()) throw new Error('PDF has no pages');
        out.push({
          ...base,
          disposition: 'appended',
          pdf,
          page_count: pdf.getPageCount(),
        });
      } else if (
        mime === 'image/png' ||
        mime === 'image/jpeg' ||
        mime === 'image/jpg'
      ) {
        if (kind !== 'png' && kind !== 'jpeg')
          throw new Error('content is not a PNG/JPEG image');
        const pdf = await imagePage(s.buffer, kind);
        out.push({ ...base, disposition: 'appended', pdf, page_count: 1 });
      } else if (mime === 'text/plain') {
        const pdf = await textPages(s.buffer.toString('utf8'), s.file_name);
        out.push({
          ...base,
          disposition: 'appended',
          pdf,
          page_count: pdf.getPageCount(),
        });
      } else {
        out.push({ ...base, disposition: 'not_convertible' });
        continue;
      }
      seen.set(hash, s.file_name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        file_name: s.file_name,
        problem: /encrypt/i.test(message)
          ? 'PDF is password-protected'
          : `cannot be read (${message.slice(0, 120)})`,
      });
    }
  }
  if (failures.length) throw new SupportingDocumentError(failures);
  return out;
}

/** Page range of each appended document, given the form's page count. */
export function assignPageRanges(
  prepared: PreparedSupporting[],
  formPages: number,
): Map<number, { from: number; to: number }> {
  const ranges = new Map<number, { from: number; to: number }>();
  let next = formPages + 1;
  for (const p of prepared) {
    if (p.disposition !== 'appended') continue;
    ranges.set(p.id, { from: next, to: next + p.page_count - 1 });
    next += p.page_count;
  }
  return ranges;
}

/** Form first, then each appended document in order, each page stamped. */
export async function mergeLeavePdf(
  form: Buffer,
  prepared: PreparedSupporting[],
  reference: string,
  title: string,
): Promise<Buffer> {
  const out = await PDFDocument.load(form);
  const appended = prepared.filter(
    (p) => p.disposition === 'appended' && p.pdf,
  );
  const total =
    out.getPageCount() + appended.reduce((s, p) => s + p.page_count, 0);
  const font = await out.embedFont(StandardFonts.Helvetica);
  let pageNo = out.getPageCount();
  for (const [index, part] of appended.entries()) {
    const pages = await out.copyPages(part.pdf!, part.pdf!.getPageIndices());
    for (const page of pages) {
      out.addPage(page);
      pageNo += 1;
      // Rotated source pages are left unstamped rather than stamped sideways.
      if (page.getRotation().angle % 360 !== 0) continue;
      const label =
        `${reference} - Supporting document ${index + 1} of ${appended.length}: ${part.file_name} - Page ${pageNo} of ${total}`
          .replace(/[^\x20-\x7E]/g, '?')
          .slice(0, 160);
      const { width } = page.getSize();
      const size = 6.5;
      const textW = font.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: Math.max(8, (width - textW) / 2),
        y: 6,
        size,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });
    }
  }
  out.setTitle(title);
  return Buffer.from(await out.save());
}
