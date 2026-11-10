import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import PDFDocument from 'pdfkit';
import { PDFDocument as PdfLibDocument, rgb, StandardFonts } from 'pdf-lib';
import { ContractSection } from './entities/employment-contract.entity';
import { ContractRenderContext } from './contract-templates.service';

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
const MARGIN = { top: 72, bottom: 64, left: 72, right: 72 };
const BOX_HEIGHT = 110;

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function eat(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

@Injectable()
export class ContractDocumentService {
  /** Renders the contract (preview/draft or the frozen base document). */
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
    const width = A4[0] - MARGIN.left - MARGIN.right;
    const { legal } = input.context;

    // Header block (first page): employer details.
    pdf
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(input.context.companyName, { align: 'left' });
    pdf.font('Helvetica').fontSize(9).fillColor('#444444');
    const headerLines = [
      legal.address,
      [
        legal.registration_number
          ? `Reg. no. ${legal.registration_number}`
          : null,
        legal.tin ? `TIN ${legal.tin}` : null,
      ]
        .filter(Boolean)
        .join('  ·  '),
      [legal.phone, legal.email].filter(Boolean).join('  ·  '),
    ].filter((line): line is string => !!line);
    for (const line of headerLines) pdf.text(line);
    pdf.fillColor('#000000');
    pdf
      .moveDown(0.5)
      .moveTo(MARGIN.left, pdf.y)
      .lineTo(A4[0] - MARGIN.right, pdf.y)
      .strokeColor('#999999')
      .stroke();

    pdf
      .moveDown(1)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(input.title, { align: 'center' });
    pdf
      .font('Helvetica')
      .fontSize(10)
      .text(
        `${input.contractTypeLabel}  ·  Ref ${input.referenceNo}  ·  Version ${input.version}`,
        {
          align: 'center',
        },
      );

    // Written particulars table.
    pdf
      .moveDown(1)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('Particulars of employment');
    pdf.moveDown(0.3).fontSize(10);
    for (const [label, value] of input.particulars) {
      const y = pdf.y;
      pdf.font('Helvetica-Bold').text(label, MARGIN.left, y, { width: 170 });
      const labelBottom = pdf.y;
      pdf
        .font('Helvetica')
        .text(value || '-', MARGIN.left + 180, y, { width: width - 180 });
      pdf.y = Math.max(labelBottom, pdf.y) + 2;
    }
    pdf.x = MARGIN.left;

    // Clauses.
    pdf.moveDown(1);
    input.sections.forEach((section, index) => {
      if (pdf.y > A4[1] - MARGIN.bottom - 80) pdf.addPage();
      pdf
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(`${index + 1}. ${section.heading}`, MARGIN.left, pdf.y, {
          width,
        });
      pdf
        .moveDown(0.2)
        .font('Helvetica')
        .fontSize(10)
        .text(section.body, { width, align: 'justify', lineGap: 2 });
      pdf.moveDown(0.6);
    });

    // Signature blocks: keep both on one page.
    if (pdf.y > A4[1] - MARGIN.bottom - (BOX_HEIGHT + 60)) pdf.addPage();
    pdf
      .moveDown(1)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('Signatures', MARGIN.left, pdf.y);
    pdf.moveDown(0.5);
    const boxTop = pdf.y;
    const boxWidth = (width - 20) / 2;
    const page = pdf.bufferedPageRange().count - 1;
    const layout: SignatureLayout = {
      employer: {
        page,
        x: MARGIN.left,
        y: boxTop,
        width: boxWidth,
        height: BOX_HEIGHT,
      },
      employee: {
        page,
        x: MARGIN.left + boxWidth + 20,
        y: boxTop,
        width: boxWidth,
        height: BOX_HEIGHT,
      },
    };
    const drawBox = (
      box: SignatureBox,
      heading: string,
      name: string,
      title: string,
    ) => {
      pdf
        .rect(box.x, box.y, box.width, box.height)
        .strokeColor('#bbbbbb')
        .stroke();
      pdf
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#000000')
        .text(heading, box.x + 8, box.y + 6, { width: box.width - 16 });
      pdf
        .font('Helvetica')
        .fontSize(9)
        .text(`Name: ${name}`, box.x + 8, box.y + box.height - 42, {
          width: box.width - 16,
        })
        .text(title, box.x + 8, box.y + box.height - 30, {
          width: box.width - 16,
        })
        .text(
          'Date: ____________________',
          box.x + 8,
          box.y + box.height - 18,
          {
            width: box.width - 16,
          },
        );
    };
    drawBox(
      layout.employer,
      'For and on behalf of the Employer',
      input.context.signatoryName ?? '______________________',
      input.context.signatoryTitle ?? 'Title: __________________',
    );
    drawBox(
      layout.employee,
      'Employee',
      input.context.employeeName,
      input.context.employeeNo
        ? `Employee no. ${input.context.employeeNo}`
        : '',
    );

    // Footer, page numbers and draft watermark on every page.
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      const bottom = pdf.page.margins.bottom;
      pdf.page.margins.bottom = 0;
      pdf
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#666666')
        .text(
          `${input.referenceNo} · v${input.version}  —  Page ${i - range.start + 1} of ${range.count}`,
          MARGIN.left,
          A4[1] - 40,
          { width, align: 'center' },
        );
      if (input.draft) {
        pdf.save();
        pdf
          .rotate(-35, { origin: [A4[0] / 2, A4[1] / 2] })
          .font('Helvetica-Bold')
          .fontSize(96)
          .fillColor('#dc2626')
          .fillOpacity(0.12)
          .text('DRAFT', 0, A4[1] / 2 - 50, { width: A4[0], align: 'center' });
        pdf.restore();
        pdf.fillOpacity(1);
      }
      pdf.fillColor('#000000');
      pdf.page.margins.bottom = bottom;
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
    const small = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawRectangle({
      x: box.x + 4,
      y: height - (box.y + box.height - 4),
      width: box.width - 8,
      height: 15,
      color: rgb(1, 1, 1),
    });
    page.drawText(`Date: ${eat(stamp.signedAt)} EAT (signed electronically)`, {
      x: area.x,
      y: height - (box.y + box.height - 10.5),
      size: 8,
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
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let y = A4[1] - MARGIN.top;
    const line = (
      textValue: string,
      options: { bold?: boolean; size?: number } = {},
    ) => {
      const size = options.size ?? 9;
      const chunks = this.wrap(
        textValue,
        options.bold ? bold : font,
        size,
        A4[0] - MARGIN.left - MARGIN.right,
      );
      for (const chunk of chunks) {
        page.drawText(chunk, {
          x: MARGIN.left,
          y,
          size,
          font: options.bold ? bold : font,
        });
        y -= size + 4;
      }
    };
    line('Signature certificate', { bold: true, size: 15 });
    y -= 6;
    line(
      `${details.title} · Ref ${details.referenceNo} · Version ${details.version}`,
    );
    line(`Employer: ${details.companyName}`);
    line(`Employee: ${details.employeeName}`);
    if (details.baseSha256)
      line(`Original document SHA-256: ${details.baseSha256}`);
    y -= 8;
    details.entries.forEach((entry, index) => {
      line(
        `${index + 1}. ${entry.party === 'COMPANY' ? 'Employer' : 'Employee'} — ${entry.name}${entry.title ? `, ${entry.title}` : ''}`,
        {
          bold: true,
        },
      );
      line(
        `Method: ${entry.method.replace(/_/g, ' ').toLowerCase()} · Verification: ${entry.verification.replace(/_/g, ' ').toLowerCase()}`,
      );
      line(
        `Signed: ${eat(entry.signedAt)} (EAT)${entry.ip ? ` · IP ${entry.ip}` : ''}`,
      );
      if (entry.documentSha256)
        line(`Document signed (SHA-256): ${entry.documentSha256}`);
      y -= 6;
    });
    y -= 6;
    line(
      'Each signature was applied to the document identified by its SHA-256 fingerprint above. Any change to the signed pages changes the fingerprint and can be detected.',
      { size: 8 },
    );
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
