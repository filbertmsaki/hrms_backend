import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import PDFDocument from 'pdfkit';
import { PDFDocument as PdfLibDocument, rgb, StandardFonts } from 'pdf-lib';
import { ContractSection } from './entities/employment-contract.entity';
import { ContractRenderContext } from './contract-templates.service';
import { formatLegalDate, titleCaseIfFlat } from './contract-format';

/** Where a party signs, in PDF points with a top-left origin (pdfkit). */
export type SignatureBox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SignatureLayout = {
  employer: SignatureBox;
  employee: SignatureBox;
};

export type ContractPdfInput = {
  title: string;
  referenceNo: string;
  version: number;
  contractTypeLabel: string;
  /**
   * New layout (redesigned drafts): the header carries company identity
   * only (full details are in the parties clause) and the title line drops
   * the contract type (it is in the Particulars). Older contracts keep the
   * classic layout.
   */
  compact?: boolean;
  /** Company logo (PNG/JPEG), printed centred at the top of page 1. */
  logo?: Buffer | null;
  /** Company tagline, printed in italics under the company name. */
  tagline?: string | null;
  startDate: string;
  endDate: string | null;
  particulars: Array<[string, string]>;
  sections: ContractSection[];
  context: ContractRenderContext;
  draft: boolean;
};

export type SignatureStamp = {
  party: 'COMPANY' | 'EMPLOYEE';
  kind: 'TYPED' | 'DRAWN';
  text?: string;
  png?: Buffer;
  name: string;
  title: string | null;
  signedAt: Date;
};

export type CertificateEntry = {
  party: string;
  name: string;
  title: string | null;
  method: string;
  verification: string;
  signedAt: Date;
  ip: string | null;
  documentSha256: string | null;
};

const A4: [number, number] = [595.28, 841.89];
/** 25 mm margins; the bottom one also reserves the initials/footer band. */
const MARGIN = { top: 71, bottom: 92, left: 71, right: 71 };
const BOX_HEIGHT = 110;
/** One dark brand colour, used sparingly for rules and section titles. */
const BRAND = '#1F2A44';
const FONT = {
  regular: 'Times-Roman',
  bold: 'Times-Bold',
  italic: 'Times-Italic',
};

/**
 * Splits clause text into bold defined terms (“the Employer” in quotes, i.e.
 * where the term is defined) and italic statute names written in full.
 */
export function richSegments(
  textValue: string,
): Array<{ text: string; font: string }> {
  const pattern =
    /([“"]the (?:Employer|Employee)[”"]|\bIN WITNESS WHEREOF\b)|((?:[A-Z][A-Za-z’'.-]*\s+(?:(?:and|of|the|on|for|in|&)\s+)*)+Act(?:,?\s*\d{4})?(?:\s*\(Cap\.?\s*\d+[A-Z]?\))?)/g;
  const out: Array<{ text: string; font: string }> = [];
  let last = 0;
  for (const match of textValue.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last)
      out.push({ text: textValue.slice(last, start), font: FONT.regular });
    out.push({
      // Typographic quotes around defined terms, as in the title block.
      text: match[1]
        ? match[0].replace(/^"/, '“').replace(/"$/, '”')
        : match[0],
      font: match[1] ? FONT.bold : FONT.italic,
    });
    last = start + match[0].length;
  }
  if (last < textValue.length)
    out.push({ text: textValue.slice(last), font: FONT.regular });
  return out.length ? out : [{ text: textValue, font: FONT.regular }];
}

/**
 * Clause body → paragraphs (numbered 1.1, 1.2 when there are several) and
 * list items ("a) …", "(b) …", "- …"), shown as (a), (b).
 */
export function clauseBlocks(
  bodyText: string,
): Array<{ kind: 'para' | 'item'; text: string }> {
  return bodyText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const item = /^(?:\(?[a-z]\)|\(?[ivx]+\)|[-•*])\s+(.*)$/i.exec(line);
      return item
        ? { kind: 'item' as const, text: item[1] }
        : { kind: 'para' as const, text: line };
    });
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** "13 November 2026, 15:06" in East Africa Time. */
function eatFull(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Dar_es_Salaam',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

@Injectable()
export class ContractDocumentService {
  /**
   * Renders the contract (preview/draft or the frozen base document) in a
   * formal legal layout: serif type, numbered clauses with hanging indents,
   * bordered particulars table, execution page and initialled footer.
   *
   * The signature boxes keep the inner geometry that `stampSignature`
   * relies on (label at +6, signing area from +20, name at h-42, title at
   * h-30, date at h-18), so stored layouts of earlier documents still work.
   */
  async renderContract(
    input: ContractPdfInput,
  ): Promise<{ buffer: Buffer; layout: SignatureLayout }> {
    const pdf = new PDFDocument({
      size: A4,
      margins: MARGIN,
      bufferPages: true,
      info: {
        Title: `${input.title} ${input.referenceNo}`,
        Author: input.context.companyName,
      },
    });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
    });
    const left = MARGIN.left;
    const width = A4[0] - MARGIN.left - MARGIN.right;
    const right = left + width;
    const limit = A4[1] - MARGIN.bottom;
    const { legal } = input.context;
    const employerName = input.context.companyName;
    const employeeName = titleCaseIfFlat(input.context.employeeName);
    const body = { size: 11, lineGap: 2.4 };
    const rule = (y: number, weight = 0.5, color = BRAND) =>
      pdf
        .save()
        .moveTo(left, y)
        .lineTo(right, y)
        .lineWidth(weight)
        .strokeColor(color)
        .stroke()
        .restore();
    const ensure = (height: number) => {
      if (pdf.y + height > limit) {
        pdf.addPage();
        pdf.y = MARGIN.top;
      }
    };
    /** Body text with defined terms in bold and statutes in italics. */
    const rich = (
      textValue: string,
      x: number,
      w: number,
      options: { align?: 'justify' | 'center' | 'left'; size?: number } = {},
    ) => {
      const parts = richSegments(textValue);
      const size = options.size ?? body.size;
      pdf.fontSize(size).fillColor('#000000');
      if (options.align === 'center') {
        // pdfkit cannot centre mixed-font runs; place short lines by hand.
        const widths = parts.map((part) =>
          pdf.font(part.font).widthOfString(part.text),
        );
        let cursor = x + (w - widths.reduce((a, b) => a + b, 0)) / 2;
        const y = pdf.y;
        parts.forEach((part, i) => {
          pdf.font(part.font).text(part.text, cursor, y, { lineBreak: false });
          cursor += widths[i];
        });
        pdf.x = left;
        pdf.y = y + pdf.currentLineHeight(true) + body.lineGap;
        return;
      }
      parts.forEach((part, i) => {
        pdf.font(part.font);
        const opts = {
          width: w,
          align: options.align ?? 'justify',
          lineGap: body.lineGap,
          continued: i < parts.length - 1,
        };
        if (i === 0) pdf.text(part.text, x, pdf.y, opts);
        else pdf.text(part.text, opts);
      });
      pdf.x = left;
    };

    // ── Title block ────────────────────────────────────────────────
    let titleTop = MARGIN.top;
    if (input.logo) {
      try {
        // Centred, at most 160 × 54 pt, aspect ratio kept.
        const image = (
          pdf as unknown as {
            openImage: (src: Buffer) => { width: number; height: number };
          }
        ).openImage(input.logo);
        const scale = Math.min(160 / image.width, 54 / image.height, 1);
        const w = image.width * scale;
        const h = image.height * scale;
        pdf.image(input.logo, left + (width - w) / 2, MARGIN.top - 10, {
          width: w,
          height: h,
        });
        titleTop = MARGIN.top - 10 + h + 8;
      } catch {
        // An unreadable logo never blocks the contract.
      }
    }
    pdf
      .font(FONT.bold)
      .fontSize(13)
      .fillColor('#000000')
      .text(employerName.toUpperCase(), left, titleTop, {
        width,
        align: 'center',
        characterSpacing: 0.4,
      });
    if (input.tagline?.trim())
      pdf
        .font(FONT.italic)
        .fontSize(9.5)
        .fillColor('#333333')
        .text(input.tagline.trim(), left, pdf.y + 1, {
          width,
          align: 'center',
        });
    const identity = [
      legal.address,
      [
        legal.registration_number
          ? `Registration No. ${legal.registration_number}`
          : null,
        legal.tin ? `TIN ${legal.tin}` : null,
      ]
        .filter(Boolean)
        .join('   |   '),
      [legal.phone ? `Tel. ${legal.phone}` : null, legal.email]
        .filter(Boolean)
        .join('   |   '),
    ].filter((line): line is string => !!line);
    pdf.moveDown(0.2).font(FONT.regular).fontSize(8.5).fillColor('#222222');
    for (const line of identity) pdf.text(line, { width, align: 'center' });
    pdf.moveDown(0.5);
    rule(pdf.y, 1.2);
    rule(pdf.y + 2.5, 0.4);
    pdf.y += 22;

    pdf
      .font(FONT.bold)
      .fontSize(17)
      .fillColor('#000000')
      .text(input.title.toUpperCase(), left, pdf.y, {
        width,
        align: 'center',
        characterSpacing: 0.8,
      });
    const issued = formatLegalDate(input.context.values.issue_date);
    pdf
      .moveDown(0.3)
      .font(FONT.regular)
      .fontSize(9.5)
      .text(
        [
          `Reference No. ${input.referenceNo}`,
          `Version ${input.version}`,
          issued ? `Date of Issue: ${issued}` : null,
        ]
          .filter(Boolean)
          .join('   |   '),
        { width, align: 'center' },
      );

    // Parties ("BETWEEN … AND …").
    pdf.moveDown(1.6);
    const centred = (textValue: string, font: string, size = body.size) =>
      pdf
        .font(font)
        .fontSize(size)
        .text(textValue, left, pdf.y, { width, align: 'center' });
    centred('BETWEEN', FONT.bold);
    pdf.moveDown(0.6);
    centred(employerName.toUpperCase(), FONT.bold);
    rich('(hereinafter referred to as “the Employer”)', left, width, {
      align: 'center',
    });
    pdf.moveDown(0.6);
    centred('AND', FONT.bold);
    pdf.moveDown(0.6);
    centred(employeeName.toUpperCase(), FONT.bold);
    rich('(hereinafter referred to as “the Employee”)', left, width, {
      align: 'center',
    });

    // ── Particulars of employment ─────────────────────────────────
    pdf.moveDown(1.6);
    const rows = input.particulars.filter(
      ([, value]) => !!value && value.trim() !== '' && value.trim() !== '-',
    );
    if (rows.length) {
      ensure(60);
      pdf
        .font(FONT.bold)
        .fontSize(11.5)
        .fillColor(BRAND)
        .text('PARTICULARS OF EMPLOYMENT', left, pdf.y, { width });
      pdf.fillColor('#000000');
      pdf.y += 5;
      const labelWidth = 150;
      const pad = 5;
      const tableRow = (label: string, value: string) => {
        pdf.fontSize(10);
        const lh = pdf
          .font(FONT.bold)
          .heightOfString(label, { width: labelWidth - 2 * pad });
        const vh = pdf
          .font(FONT.regular)
          .heightOfString(value, { width: width - labelWidth - 2 * pad });
        const h = Math.max(lh, vh, 11) + 2 * pad;
        if (pdf.y + h > limit) {
          pdf.addPage();
          pdf.y = MARGIN.top;
        }
        const y = pdf.y;
        pdf.save().rect(left, y, labelWidth, h).fill('#F2F2F2').restore();
        pdf
          .save()
          .lineWidth(0.5)
          .strokeColor('#000000')
          .rect(left, y, width, h)
          .moveTo(left + labelWidth, y)
          .lineTo(left + labelWidth, y + h)
          .stroke()
          .restore();
        pdf
          .font(FONT.bold)
          .fillColor('#000000')
          .text(label, left + pad, y + pad, { width: labelWidth - 2 * pad });
        pdf.font(FONT.regular).text(value, left + labelWidth + pad, y + pad, {
          width: width - labelWidth - 2 * pad,
        });
        pdf.y = y + h;
      };
      for (const [label, value] of rows) tableRow(label, value);
      pdf.x = left;
    }

    // ── Clauses: 1. HEADING → 1.1 sub-clause → (a) paragraph ──────
    pdf.y += 20;
    const NUM = 30; // clause number column
    const SUB = 34; // sub-clause number column
    const ITEM = 26; // (a) paragraph column
    const lineHeight =
      pdf.font(FONT.regular).fontSize(body.size).currentLineHeight(true) +
      body.lineGap;
    input.sections.forEach((section, index) => {
      const n = index + 1;
      const blocks = clauseBlocks(section.body);
      const numbered = blocks.filter((b) => b.kind === 'para').length > 1;
      const heading = section.heading.toUpperCase();
      // Keep the heading with (at least) the first three lines of text.
      pdf.font(FONT.bold).fontSize(body.size);
      const headingHeight = pdf.heightOfString(heading, {
        width: width - NUM,
      });
      pdf.font(FONT.regular);
      const first = blocks[0]
        ? Math.min(
            pdf.heightOfString(blocks[0].text, {
              width: width - NUM - (numbered ? SUB : 0),
              lineGap: body.lineGap,
            }),
            lineHeight * 2,
          )
        : 0;
      ensure(headingHeight + 4 + first);
      const top = pdf.y;
      pdf
        .font(FONT.bold)
        .fontSize(body.size)
        .fillColor('#000000')
        .text(`${n}.`, left, top, { width: NUM, lineBreak: false });
      pdf.text(heading, left + NUM, top, { width: width - NUM });
      pdf.y += 4;
      let sub = 0;
      let item = 0;
      for (const block of blocks) {
        ensure(lineHeight * 2);
        const y = pdf.y;
        if (block.kind === 'para') {
          item = 0;
          if (numbered) {
            sub++;
            pdf
              .font(FONT.regular)
              .fontSize(body.size)
              .text(`${n}.${sub}`, left + NUM, y, {
                width: SUB,
                lineBreak: false,
              });
            pdf.y = y;
            rich(block.text, left + NUM + SUB, width - NUM - SUB);
          } else rich(block.text, left + NUM, width - NUM);
        } else {
          const indent = left + NUM + (numbered ? SUB : 0);
          const label = `(${String.fromCharCode(97 + (item++ % 26))})`;
          pdf
            .font(FONT.regular)
            .fontSize(body.size)
            .text(label, indent, y, { width: ITEM, lineBreak: false });
          pdf.y = y;
          rich(block.text, indent + ITEM, right - indent - ITEM);
        }
        pdf.y += 6; // 6 pt after each paragraph
      }
      pdf.y += 6;
    });

    // ── Execution page (never split) ──────────────────────────────
    const gap = 24;
    const col = (width - gap) / 2;
    const SEAL = 58;
    const WITNESS = 104;
    pdf.font(FONT.bold).fontSize(9.5);
    const employerLabel = `Signed for and on behalf of ${employerName}`;
    const employeeLabel = 'Signed by the Employee';
    const labelHeight = Math.max(
      pdf.heightOfString(employerLabel, { width: col }),
      pdf.heightOfString(employeeLabel, { width: col }),
    );
    const executionHeight =
      24 + 40 + labelHeight + 6 + BOX_HEIGHT + 10 + SEAL + 12 + WITNESS;
    if (pdf.y + executionHeight > limit) pdf.addPage();
    else pdf.y += 10;
    pdf
      .font(FONT.bold)
      .fontSize(11.5)
      .fillColor(BRAND)
      .text('EXECUTION', left, pdf.y, { width });
    pdf.fillColor('#000000');
    rule(pdf.y + 2, 0.5);
    pdf.y += 10;
    rich(
      'IN WITNESS WHEREOF the parties have executed this Contract on the dates indicated below.',
      left,
      width,
    );
    pdf.y += 14;

    const columnTop = pdf.y;
    const boxTop = columnTop + labelHeight + 6;
    const page = pdf.bufferedPageRange().count - 1;
    const layout: SignatureLayout = {
      employer: { page, x: left, y: boxTop, width: col, height: BOX_HEIGHT },
      employee: {
        page,
        x: left + col + gap,
        y: boxTop,
        width: col,
        height: BOX_HEIGHT,
      },
    };
    const line = (x: number, y: number, w: number) =>
      pdf
        .save()
        .moveTo(x, y)
        .lineTo(x + w, y)
        .lineWidth(0.5)
        .strokeColor('#000000')
        .stroke()
        .restore();
    const block = (
      box: SignatureBox,
      heading: string,
      name: string,
      detail: string,
    ) => {
      pdf
        .font(FONT.bold)
        .fontSize(9.5)
        .fillColor('#000000')
        .text(heading, box.x, columnTop, { width: box.width });
      pdf
        .save()
        .lineWidth(0.5)
        .strokeColor('#000000')
        .rect(box.x, box.y, box.width, box.height)
        .stroke()
        .restore();
      const inner = { x: box.x + 8, width: box.width - 16 };
      pdf
        .font(FONT.italic)
        .fontSize(8)
        .fillColor('#444444')
        .text('Signature', inner.x, box.y + 6, inner);
      line(inner.x, box.y + box.height - 46, inner.width);
      pdf.font(FONT.regular).fontSize(9).fillColor('#000000');
      pdf.text(`Name: ${name}`, inner.x, box.y + box.height - 42, inner);
      pdf.text(detail, inner.x, box.y + box.height - 30, inner);
      pdf.text(
        'Date: ______________________',
        inner.x,
        box.y + box.height - 18,
        inner,
      );
    };
    block(
      layout.employer,
      employerLabel,
      input.context.signatoryName ?? '______________________',
      input.context.signatoryTitle
        ? `Designation: ${input.context.signatoryTitle}`
        : 'Designation: _______________',
    );
    block(
      layout.employee,
      employeeLabel,
      employeeName,
      input.context.employeeNo
        ? `Employee No.: ${input.context.employeeNo}`
        : 'Employee No.: _______________',
    );

    // Company seal / stamp space under the employer block.
    const sealTop = boxTop + BOX_HEIGHT + 10;
    pdf
      .save()
      .lineWidth(0.5)
      .dash(2, { space: 2 })
      .strokeColor('#666666')
      .rect(left, sealTop, col, SEAL)
      .stroke()
      .undash()
      .restore();
    pdf
      .font(FONT.italic)
      .fontSize(8)
      .fillColor('#555555')
      .text('Company seal / stamp', left, sealTop + SEAL / 2 - 4, {
        width: col,
        align: 'center',
      });

    // Witness sections, aligned across both columns.
    const witnessTop = sealTop + SEAL + 12;
    for (const x of [left, left + col + gap]) {
      pdf
        .font(FONT.bold)
        .fontSize(9)
        .fillColor('#000000')
        .text('In the presence of (Witness):', x, witnessTop, { width: col });
      const fields = ['Signature', 'Name', 'Address / Occupation', '', 'Date'];
      fields.forEach((label, i) => {
        const y = witnessTop + 18 + i * 17;
        let start = x;
        if (label) {
          pdf.font(FONT.regular).fontSize(9);
          pdf.text(`${label}:`, x, y, { width: col, lineBreak: false });
          start = x + pdf.widthOfString(`${label}:`) + 4;
        }
        line(start, y + 9, x + col - start);
      });
    }

    // ── Running header, footer, initials and draft mark ──────────
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      const savedTop = pdf.page.margins.top;
      const savedBottom = pdf.page.margins.bottom;
      pdf.page.margins.top = 0;
      pdf.page.margins.bottom = 0;
      const number = i - range.start + 1;
      if (number > 1) {
        pdf
          .font(FONT.italic)
          .fontSize(8.5)
          .fillColor('#555555')
          .text(`${input.title} – ${employeeName}`, left, 40, {
            width,
            align: 'right',
            lineBreak: false,
          });
        rule(52, 0.4, '#888888');
      }
      // Initials box for both parties.
      const initialsY = A4[1] - 82;
      const boxW = 46;
      const boxH = 15;
      pdf.font(FONT.regular).fontSize(8).fillColor('#333333');
      const employeeX = right - boxW;
      const employeeLabelX = employeeX - pdf.widthOfString('Employee') - 5;
      const employerX = employeeLabelX - 14 - boxW;
      const employerLabelX = employerX - pdf.widthOfString('Employer') - 5;
      const initialsLabelX =
        employerLabelX - pdf.widthOfString('Initials:') - 10;
      pdf.text('Initials:', initialsLabelX, initialsY + 4, {
        lineBreak: false,
      });
      pdf.text('Employer', employerLabelX, initialsY + 4, { lineBreak: false });
      pdf.text('Employee', employeeLabelX, initialsY + 4, { lineBreak: false });
      pdf
        .save()
        .lineWidth(0.5)
        .strokeColor('#555555')
        .rect(employerX, initialsY, boxW, boxH)
        .rect(employeeX, initialsY, boxW, boxH)
        .stroke()
        .restore();
      // Footer line and text.
      const footerY = A4[1] - 54;
      rule(footerY, 0.4, '#888888');
      pdf.font(FONT.regular).fontSize(8).fillColor('#666666');
      const textY = footerY + 6;
      pdf.text(
        `Ref. ${input.referenceNo}  |  Version ${input.version}`,
        left,
        textY,
        { width: width / 3, align: 'left', lineBreak: false },
      );
      pdf.text('Confidential', left + width / 3, textY, {
        width: width / 3,
        align: 'center',
        lineBreak: false,
      });
      pdf.text(
        `Page ${number} of ${range.count}`,
        left + (2 * width) / 3,
        textY,
        { width: width / 3, align: 'right', lineBreak: false },
      );
      if (input.draft) {
        pdf.save();
        pdf
          .rotate(-35, { origin: [A4[0] / 2, A4[1] / 2] })
          .font(FONT.bold)
          .fontSize(96)
          .fillColor('#808080')
          .fillOpacity(0.13)
          .text('DRAFT', 0, A4[1] / 2 - 50, {
            width: A4[0],
            align: 'center',
            lineBreak: false,
          });
        pdf.restore();
        pdf.fillOpacity(1);
      }
      pdf.fillColor('#000000');
      pdf.page.margins.top = savedTop;
      pdf.page.margins.bottom = savedBottom;
    }
    pdf.end();
    return { buffer: await done, layout };
  }

  /**
   * Draws one party's signature into its box. The input file is never
   * modified; a new buffer is returned.
   */
  async stampSignature(
    source: Buffer,
    layout: SignatureLayout,
    stamp: SignatureStamp,
  ): Promise<Buffer> {
    const pdf = await PdfLibDocument.load(source);
    const box = stamp.party === 'COMPANY' ? layout.employer : layout.employee;
    const page = pdf.getPage(Math.min(box.page, pdf.getPageCount() - 1));
    const height = page.getHeight();
    // Area between the heading and the name line.
    const area = {
      x: box.x + 8,
      y: height - (box.y + box.height - 46),
      width: box.width - 16,
      height: box.height - 66,
    };
    if (stamp.kind === 'DRAWN') {
      if (!stamp.png) throw new BadRequestException('Signature image missing');
      const image = await pdf.embedPng(stamp.png);
      const scale = Math.min(
        area.width / image.width,
        area.height / image.height,
        1,
      );
      page.drawImage(image, {
        x: area.x,
        y: area.y,
        width: image.width * scale,
        height: image.height * scale,
      });
    } else {
      const font = await pdf.embedFont(StandardFonts.TimesRomanItalic);
      const textValue = (stamp.text ?? stamp.name).slice(0, 100);
      let size = 22;
      while (size > 10 && font.widthOfTextAtSize(textValue, size) > area.width)
        size -= 1;
      page.drawText(textValue, {
        x: area.x,
        y: area.y + 8,
        size,
        font,
        color: rgb(0.05, 0.15, 0.45),
      });
    }
    // Replace the blank "Date: ____" line with the signing date and time.
    const small = await pdf.embedFont(StandardFonts.TimesRoman);
    page.drawRectangle({
      x: box.x + 4,
      y: height - (box.y + box.height - 4),
      width: box.width - 8,
      height: 15,
      color: rgb(1, 1, 1),
    });
    const dateLine = `Date: ${eatFull(stamp.signedAt)} EAT (signed electronically)`;
    let dateSize = 9;
    while (
      dateSize > 6.5 &&
      small.widthOfTextAtSize(dateLine, dateSize) > area.width
    )
      dateSize -= 0.5;
    page.drawText(dateLine, {
      x: area.x,
      y: height - (box.y + box.height - 10.5),
      size: dateSize,
      font: small,
      color: rgb(0.15, 0.15, 0.15),
    });
    return Buffer.from(await pdf.save());
  }

  /** Appends a signature certificate page listing every signing act. */
  async appendCertificate(
    source: Buffer,
    details: {
      referenceNo: string;
      version: number;
      title: string;
      companyName: string;
      employeeName: string;
      baseSha256: string | null;
      entries: CertificateEntry[];
    },
  ): Promise<Buffer> {
    const pdf = await PdfLibDocument.load(source);
    return this.writeCertificate(pdf, details);
  }

  /** Stand-alone certificate, used when an uploaded scan cannot be opened. */
  async renderCertificate(
    details: Parameters<ContractDocumentService['appendCertificate']>[1],
  ): Promise<Buffer> {
    return this.writeCertificate(await PdfLibDocument.create(), details);
  }

  private async writeCertificate(
    pdf: PdfLibDocument,
    details: Parameters<ContractDocumentService['appendCertificate']>[1],
  ): Promise<Buffer> {
    const page = pdf.addPage(A4);
    const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const font = await pdf.embedFont(StandardFonts.TimesRoman);
    const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    const width = A4[0] - MARGIN.left - MARGIN.right;
    const grey = rgb(0.4, 0.4, 0.4);
    const brand = rgb(0x1f / 255, 0x2a / 255, 0x44 / 255);
    const employeeName = titleCaseIfFlat(details.employeeName);
    const hr = (yPdf: number, thickness = 0.4, color = rgb(0.53, 0.53, 0.53)) =>
      page.drawLine({
        start: { x: MARGIN.left, y: yPdf },
        end: { x: A4[0] - MARGIN.right, y: yPdf },
        thickness,
        color,
      });

    // Running header, as on the contract pages.
    const header = `${details.title} – ${employeeName}`;
    page.drawText(header, {
      x: A4[0] - MARGIN.right - italic.widthOfTextAtSize(header, 8.5),
      y: A4[1] - 46,
      size: 8.5,
      font: italic,
      color: grey,
    });
    hr(A4[1] - 52);

    let y = A4[1] - MARGIN.top - 14;
    const line = (
      textValue: string,
      options: { bold?: boolean; size?: number; gap?: number } = {},
    ) => {
      const size = options.size ?? 10;
      const face = options.bold ? bold : font;
      for (const chunk of this.wrap(textValue, face, size, width)) {
        page.drawText(chunk, { x: MARGIN.left, y, size, font: face });
        y -= size + (options.gap ?? 3.5);
      }
    };
    const titleText = 'SIGNATURE CERTIFICATE';
    page.drawText(titleText, {
      x: MARGIN.left + (width - bold.widthOfTextAtSize(titleText, 16)) / 2,
      y,
      size: 16,
      font: bold,
    });
    y -= 18;
    const sub = `${details.title} | Reference No. ${details.referenceNo} | Version ${details.version}`;
    page.drawText(sub, {
      x: MARGIN.left + (width - font.widthOfTextAtSize(sub, 9.5)) / 2,
      y,
      size: 9.5,
      font,
    });
    y -= 12;
    hr(y, 0.6, brand);
    y -= 20;
    line(`Employer: ${details.companyName}`);
    line(`Employee: ${employeeName}`);
    if (details.baseSha256)
      line(`Original document SHA-256: ${details.baseSha256}`, { size: 9 });
    y -= 10;
    details.entries.forEach((entry, index) => {
      line(
        `${index + 1}.  ${entry.party === 'COMPANY' ? 'EMPLOYER' : 'EMPLOYEE'} — ${entry.name}${entry.title ? `, ${entry.title}` : ''}`,
        { bold: true },
      );
      line(
        `Method: ${entry.method.replace(/_/g, ' ').toLowerCase()}  |  Verification: ${entry.verification.replace(/_/g, ' ').toLowerCase()}`,
      );
      line(
        `Signed: ${eatFull(entry.signedAt)} EAT${entry.ip ? `  |  IP ${entry.ip}` : ''}`,
      );
      if (entry.documentSha256)
        line(`Document signed (SHA-256): ${entry.documentSha256}`, {
          size: 9,
        });
      y -= 8;
    });
    y -= 6;
    line(
      'Each signature was applied to the document identified by its SHA-256 fingerprint above. Any change to the signed pages changes the fingerprint and can be detected.',
      { size: 9 },
    );

    // Footer, as on the contract pages (no initials: nothing to initial).
    const footerY = 54;
    hr(footerY);
    const textY = footerY - 6 - 8;
    page.drawText(
      `Ref. ${details.referenceNo}  |  Version ${details.version}`,
      { x: MARGIN.left, y: textY, size: 8, font, color: grey },
    );
    const centre = 'Confidential';
    page.drawText(centre, {
      x: MARGIN.left + (width - font.widthOfTextAtSize(centre, 8)) / 2,
      y: textY,
      size: 8,
      font,
      color: grey,
    });
    const rightText = 'Signature certificate';
    page.drawText(rightText, {
      x: A4[0] - MARGIN.right - font.widthOfTextAtSize(rightText, 8),
      y: textY,
      size: 8,
      font,
      color: grey,
    });
    return Buffer.from(await pdf.save());
  }

  private wrap(
    textValue: string,
    font: { widthOfTextAtSize: (t: string, s: number) => number },
    size: number,
    width: number,
  ): string[] {
    const words = textValue.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && current) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    return lines;
  }
}
