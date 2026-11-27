/**
 * Shared HR document standard, taken from the Leave Application PDF
 * (modules/hr/leave/services/leave-pdf.service.ts): A4, the same margins,
 * built-in Helvetica faces, monochrome-with-navy tokens, a page-1-only
 * letterhead, a footer with "Page i of N" on every page, and the
 * authorization block with the verification QR in an 80% / 20% split.
 *
 * New document generators (employee letters first) build on these helpers so
 * every HRMS PDF looks the same. The leave PDF keeps its own copy for now and
 * is covered by its own tests; it can move onto this kit without changes to
 * its output.
 */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/** Monochrome design tokens for office printing (same as the leave PDF). */
export const HR_DOC_TOKENS = {
  ink: '#111111',
  text: '#333333',
  muted: '#666666',
  navy: '#1d385f',
  border: '#c1cddd',
  white: '#FFFFFF',
} as const;

const CM = 72 / 2.54;
/** A4 margins: 2 cm top/right/bottom, 2.5 cm binding edge on the left. */
export const HR_DOC_A4_MARGINS = {
  top: 2 * CM,
  bottom: 2 * CM,
  right: 2 * CM,
  left: 2.5 * CM,
};

/** Authorization facts 80% | QR 20%. */
export const HR_DOC_AUTH_INFO_SHARE = 0.8;
/** ≈ 2.3 cm printed — reliable for phone cameras. */
export const HR_DOC_QR_MIN = 66;
const QR_PAD = 6;
const QR_CAPTION = 14;
/** Footer band below the bottom margin edge. */
const FOOTER_OFFSET = 10;

export type HrDocBranding = {
  companyName: string;
  /** PNG/JPEG bytes of the company logo, if any. */
  logo?: Buffer | null;
  address?: string | null;
  branchName?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
};

/** Reads letterhead fields from Company.metadata the same way the leave PDF does. */
export function brandingFromCompanyMetadata(
  companyName: string,
  metadata: Record<string, unknown> | null | undefined,
): Omit<HrDocBranding, 'logo'> & {
  logoUrl: string | null;
  timezone: string | null;
} {
  const meta = metadata ?? {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };
  return {
    companyName,
    address: pick('address', 'company_address'),
    phone: pick('phone', 'company_phone'),
    email: pick('email', 'company_email'),
    website: pick('website'),
    logoUrl: pick('logo_url'),
    timezone: pick('timezone'),
  };
}

export type HrDocHandle = {
  doc: PDFKit.PDFDocument;
  /** Resolves with the PDF bytes after `doc.end()`. */
  finished: Promise<Buffer>;
};

/** A4 document with the standard margins and buffered pages (for footers). */
export function createHrA4Document(info: {
  title: string;
  author: string;
  subject: string;
}): HrDocHandle {
  const doc = new PDFDocument({
    size: 'A4',
    margins: HR_DOC_A4_MARGINS,
    bufferPages: true,
    info: { Title: info.title, Author: info.author, Subject: info.subject },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, finished };
}

export function hrDocFrame(doc: PDFKit.PDFDocument) {
  const left = doc.page.margins.left;
  return { left, width: doc.page.width - left - doc.page.margins.right };
}

export function hrDocUsableHeight(doc: PDFKit.PDFDocument) {
  return doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
}

/** Starts a new page when `needed` points do not fit below the cursor. */
export function hrDocEnsureSpace(
  doc: PDFKit.PDFDocument,
  needed: number,
): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

/**
 * Page-1 letterhead: navy top rule, logo, company name, location and contact
 * on the left; label/value rows (reference, date …) on the right. Optional
 * centred title with the double rule. Leaves the cursor below it.
 */
export function drawHrLetterhead(
  doc: PDFKit.PDFDocument,
  brand: HrDocBranding,
  meta: Array<[string, string]>,
  title?: string,
): void {
  const C = HR_DOC_TOKENS;
  const { left, width } = hrDocFrame(doc);
  const top = 30;
  doc.rect(0, 0, doc.page.width, 6).fill(C.navy);

  let textX = left;
  let logoBottom = top;
  if (brand.logo) {
    try {
      doc.image(brand.logo, left, top, { fit: [48, 48] });
      textX = left + 58;
      logoBottom = top + 48;
    } catch {
      // Unsupported image formats are skipped rather than failing the PDF.
    }
  }

  const metaW = 168;
  const nameW = width - metaW - 12 - (textX - left);
  doc
    .font('Helvetica-Bold')
    .fontSize(12.5)
    .fillColor(C.navy)
    .text(brand.companyName.toUpperCase(), textX, top + 2, {
      width: nameW,
      characterSpacing: 0.3,
    });
  const location = [brand.branchName, brand.address]
    .filter((v) => v && v.trim())
    .join('  ·  ');
  if (location)
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(C.text)
      .text(location, textX, doc.y + 2, { width: nameW });
  const contact = [brand.phone, brand.email, brand.website]
    .filter(Boolean)
    .join('  ·  ');
  if (contact)
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text(contact, textX, doc.y + 1, { width: nameW });
  const leftBottom = Math.max(doc.y, logoBottom);

  const mx = left + width - metaW;
  let my = top + 1;
  for (const [label, value] of meta) {
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text(label, mx, my, { width: 58, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(C.ink)
      .text(value, mx + 58, my - 0.5, {
        width: metaW - 58,
        align: 'right',
        lineBreak: false,
      });
    my += 13;
  }

  let y = Math.max(leftBottom, my) + 10;
  if (title) {
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(C.navy)
      .text(title.toUpperCase(), left, y, {
        width,
        align: 'center',
        characterSpacing: 1.4,
      });
    y = doc.y + 4;
  }
  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .lineWidth(1.2)
    .strokeColor(C.navy)
    .stroke();
  doc
    .moveTo(left, y + 2.5)
    .lineTo(left + width, y + 2.5)
    .lineWidth(0.5)
    .strokeColor(C.navy)
    .stroke();
  doc.x = left;
  doc.y = y + 16;
}

/**
 * Footer on every buffered page: company name and reference on the left,
 * generated time and "Page i of N" on the right. Call after all content.
 */
export function drawHrFooters(
  doc: PDFKit.PDFDocument,
  opts: {
    companyName: string;
    referenceLabel: string;
    generatedLabel: string;
    extraPages?: number;
  },
): void {
  const C = HR_DOC_TOKENS;
  const range = doc.bufferedPageRange();
  const total = range.count + Math.max(0, opts.extraPages ?? 0);
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const { left, width } = hrDocFrame(doc);
    const savedBottom = doc.page.margins.bottom;
    const y = doc.page.height - savedBottom + FOOTER_OFFSET;
    doc.page.margins.bottom = -doc.page.height;
    doc
      .moveTo(left, y - 5)
      .lineTo(left + width, y - 5)
      .lineWidth(0.6)
      .strokeColor(C.border)
      .stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(C.navy)
      .text(opts.companyName, left, y, {
        width: width * 0.6,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(C.muted)
      .text(opts.referenceLabel, left, y + 10, {
        width: width * 0.6,
        lineBreak: false,
      })
      .text(opts.generatedLabel, left + width * 0.4, y, {
        width: width * 0.6,
        align: 'right',
        lineBreak: false,
      })
      .text(
        `Page ${i - range.start + 1} of ${total}`,
        left + width * 0.4,
        y + 10,
        {
          width: width * 0.6,
          align: 'right',
          lineBreak: false,
        },
      );
    doc.page.margins.bottom = savedBottom;
  }
}

/** Verification QR as PNG bytes, same settings as the leave PDF. */
export function hrDocQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 360,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

/**
 * Authorization block: signature facts on the left (80%), verification QR on
 * the right (20%), kept together on one page. `render` draws the left side
 * inside the given box and returns its height; it is measured first (on a
 * throw-away pass) so the whole block moves to the next page if needed.
 */
export async function drawHrAuthorizationWithQr(
  doc: PDFKit.PDFDocument,
  opts: {
    verificationUrl?: string | null;
    /** Height the left side needs at the given width (measured before drawing). */
    measure: (width: number) => number;
    /** Draws the left side at (x, y) with the given width. */
    render: (x: number, y: number, width: number) => void;
  },
): Promise<void> {
  const C = HR_DOC_TOKENS;
  const { left, width } = hrDocFrame(doc);
  const hasQr = !!opts.verificationUrl;
  const infoWidth = hasQr ? width * HR_DOC_AUTH_INFO_SHARE : width;
  const qrWidth = width - infoWidth;
  const infoHeight = opts.measure(infoWidth - 12);
  const qrSize = hasQr
    ? Math.max(HR_DOC_QR_MIN, Math.min(qrWidth - 2 * QR_PAD, 100))
    : 0;
  const blockHeight = Math.max(
    infoHeight,
    hasQr ? qrSize + QR_CAPTION + QR_PAD : 0,
  );
  // Keep the signature and the QR together (unless the block is taller than a page).
  if (blockHeight <= hrDocUsableHeight(doc)) hrDocEnsureSpace(doc, blockHeight);
  const top = doc.y;
  opts.render(left, top, infoWidth - 12);
  if (hasQr) {
    const qr = await hrDocQrPng(opts.verificationUrl!);
    const qx = left + infoWidth;
    doc.image(qr, qx + (qrWidth - qrSize) / 2, top, {
      width: qrSize,
      height: qrSize,
    });
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(C.navy)
      .text('Scan to Verify', qx, top + qrSize + 3, {
        width: qrWidth,
        align: 'center',
        lineBreak: false,
      });
  }
  doc.x = left;
  doc.y = top + blockHeight;
}

type Run = { text: string; bold: boolean; italic: boolean };

/** Splits `**bold**` and `_italic_` (the shared Textarea's formatting) into runs. */
function inlineRuns(text: string): Run[] {
  const runs: Run[] = [];
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last)
      runs.push({
        text: text.slice(last, match.index),
        bold: false,
        italic: false,
      });
    const token = match[0];
    if (token.startsWith('**'))
      runs.push({ text: token.slice(2, -2), bold: true, italic: false });
    else runs.push({ text: token.slice(1, -1), bold: false, italic: true });
    last = match.index + token.length;
  }
  if (last < text.length)
    runs.push({ text: text.slice(last), bold: false, italic: false });
  return runs.length ? runs : [{ text, bold: false, italic: false }];
}

function fontFor(run: Run) {
  if (run.bold && run.italic) return 'Helvetica-BoldOblique';
  if (run.bold) return 'Helvetica-Bold';
  if (run.italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

/**
 * Letter body from the shared Textarea markup: paragraphs (blank line),
 * `- ` bullets, `1. ` numbered items, `**bold**`, `_italic_`. Paragraphs are
 * never split across pages when they fit on one; long ones flow naturally.
 */
export function drawHrRichText(
  doc: PDFKit.PDFDocument,
  body: string,
  opts: { fontSize?: number; lineGap?: number; paragraphGap?: number } = {},
): void {
  const C = HR_DOC_TOKENS;
  const size = opts.fontSize ?? 10.5;
  const lineGap = opts.lineGap ?? 2.5;
  const paragraphGap = opts.paragraphGap ?? 8;
  const { left, width } = hrDocFrame(doc);
  const blocks = body.replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (!lines.length) continue;
    for (const raw of lines) {
      const bullet = /^\s*-\s+(.*)$/.exec(raw);
      const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(raw);
      const indent = bullet || numbered ? 16 : 0;
      const marker = bullet ? '•' : numbered ? `${numbered[1]}.` : '';
      const text = bullet ? bullet[1] : numbered ? numbered[2] : raw;
      const runs = inlineRuns(text);
      const plain = runs.map((r) => r.text).join('');
      doc.font('Helvetica').fontSize(size);
      const height = doc.heightOfString(plain, {
        width: width - indent,
        lineGap,
      });
      if (height <= hrDocUsableHeight(doc)) hrDocEnsureSpace(doc, height);
      const y = doc.y;
      if (marker)
        doc
          .font('Helvetica')
          .fontSize(size)
          .fillColor(C.ink)
          .text(marker, left, y, { width: indent, lineBreak: false });
      doc.x = left + indent;
      doc.y = y;
      runs.forEach((run, i) => {
        doc
          .font(fontFor(run))
          .fontSize(size)
          .fillColor(C.ink)
          .text(
            run.text,
            i === 0 ? left + indent : undefined,
            i === 0 ? y : undefined,
            {
              width: width - indent,
              lineGap,
              align: indent ? 'left' : 'justify',
              continued: i < runs.length - 1,
            },
          );
      });
      doc.x = left;
      doc.y += lineGap;
    }
    doc.y += paragraphGap;
  }
}

/**
 * Same markup and pagination as `drawHrRichText`, but safe for inline
 * `**bold**` / `_italic_` runs inside a paragraph: pdfkit's justified
 * `continued` text breaks the line after each run and drops spaces, so
 * paragraphs with mixed runs are set left-aligned and plain paragraphs stay
 * justified. Used by the employee letters PDF.
 */
export function drawHrRichTextFlow(
  doc: PDFKit.PDFDocument,
  body: string,
  opts: { fontSize?: number; lineGap?: number; paragraphGap?: number } = {},
): void {
  const C = HR_DOC_TOKENS;
  const size = opts.fontSize ?? 10.5;
  const lineGap = opts.lineGap ?? 2.5;
  const paragraphGap = opts.paragraphGap ?? 8;
  const { left, width } = hrDocFrame(doc);
  const blocks = body.replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (!lines.length) continue;
    for (const raw of lines) {
      const bullet = /^\s*-\s+(.*)$/.exec(raw);
      const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(raw);
      const indent = bullet || numbered ? 16 : 0;
      const marker = bullet ? '•' : numbered ? `${numbered[1]}.` : '';
      const text = bullet ? bullet[1] : numbered ? numbered[2] : raw;
      const runs = inlineRuns(text);
      const plain = runs.map((r) => r.text).join('');
      const textWidth = width - indent;
      doc.font('Helvetica').fontSize(size);
      const height = doc.heightOfString(plain, { width: textWidth, lineGap });
      if (height <= hrDocUsableHeight(doc)) hrDocEnsureSpace(doc, height);
      const y = doc.y;
      if (marker)
        doc
          .font('Helvetica')
          .fontSize(size)
          .fillColor(C.ink)
          .text(marker, left, y, { width: indent, lineBreak: false });
      const align = indent || runs.length > 1 ? 'left' : 'justify';
      doc.x = left + indent;
      doc.y = y;
      runs.forEach((run, i) => {
        doc.font(fontFor(run)).fontSize(size).fillColor(C.ink);
        const options = {
          width: textWidth,
          lineGap,
          align,
          continued: i < runs.length - 1,
        } as const;
        if (i === 0) doc.text(run.text, left + indent, y, options);
        else doc.text(run.text, options);
      });
      doc.x = left;
      doc.y += lineGap;
    }
    doc.y += paragraphGap;
  }
}
