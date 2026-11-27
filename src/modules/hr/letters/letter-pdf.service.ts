import { Injectable, Optional } from '@nestjs/common';
import { FilesService } from '../../files/files.service';
import {
  HR_DOC_TOKENS,
  HrDocBranding,
  createHrA4Document,
  drawHrAuthorizationWithQr,
  drawHrFooters,
  drawHrLetterhead,
  drawHrRichTextFlow,
  hrDocEnsureSpace,
  hrDocFrame,
} from '../../../common/pdf/hr-document-kit';

export type LetterPdfInput = {
  branding: Omit<HrDocBranding, 'logo'>;
  /** Managed path of the company logo (read through FilesService). */
  logoUrl?: string | null;
  /** Pre-loaded logo bytes (tests / callers that already have them). */
  logo?: Buffer | null;
  timezone: string;
  referenceNo: string;
  /** Already formatted, e.g. "27 November 2026". */
  dateLabel: string;
  letterTypeLabel: string;
  recipient: {
    name: string;
    employeeNo?: string | null;
    addressLines?: string[];
  };
  salutation: string;
  subject: string;
  body: string;
  closing: string;
  signatoryName: string;
  signatoryTitle: string;
  includeAcknowledgement: boolean;
  /** Set only for issued letters: draws the QR code. */
  verificationUrl?: string | null;
  /** Note shown in place of the QR on drafts / previews. */
  draftNote?: string;
  generatedAt: Date;
};

const BODY_SIZE = 10.5;
const SIGNATURE_LINE = 160;

/**
 * Business-letter PDF on the shared HR document kit: letterhead (reference +
 * date), recipient block, salutation, "RE:" subject, rich-text body, closing,
 * wet-sign authorization block with the verification QR (issued only), an
 * optional employee acknowledgement and the standard footer.
 */
@Injectable()
export class LetterPdfService {
  private static logoCache = new Map<
    string,
    { at: number; data: Buffer | null }
  >();

  constructor(@Optional() private readonly filesService?: FilesService) {}

  async render(input: LetterPdfInput): Promise<Buffer> {
    const C = HR_DOC_TOKENS;
    const issued = !!input.verificationUrl;
    const logo =
      input.logo !== undefined
        ? input.logo
        : input.logoUrl
          ? await this.readLogo(input.logoUrl)
          : null;
    const { doc, finished } = createHrA4Document({
      title: `${input.letterTypeLabel} – ${input.referenceNo}`,
      author: input.branding.companyName,
      subject: input.subject,
    });
    const { left, width } = hrDocFrame(doc);

    drawHrLetterhead(doc, { ...input.branding, logo }, [
      [
        'Reference',
        issued ? input.referenceNo : `${input.referenceNo} (Draft)`,
      ],
      ['Date', input.dateLabel],
    ]);

    // Recipient block.
    doc
      .font('Helvetica-Bold')
      .fontSize(BODY_SIZE)
      .fillColor(C.ink)
      .text(input.recipient.name, left, doc.y, { width: width * 0.6 });
    doc
      .font('Helvetica')
      .fontSize(BODY_SIZE - 0.5)
      .fillColor(C.text);
    if (input.recipient.employeeNo) {
      doc.text(`Employee No: ${input.recipient.employeeNo}`, left, doc.y + 1, {
        width: width * 0.6,
      });
    }
    for (const line of input.recipient.addressLines ?? []) {
      if (line.trim())
        doc.text(line.trim(), left, doc.y + 1, { width: width * 0.6 });
    }
    doc.y += 14;

    if (input.salutation.trim()) {
      doc
        .font('Helvetica')
        .fontSize(BODY_SIZE)
        .fillColor(C.ink)
        .text(input.salutation.trim(), left, doc.y, { width });
      doc.y += 8;
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(BODY_SIZE)
      .fillColor(C.ink)
      .text(`RE: ${input.subject.trim().toUpperCase()}`, left, doc.y, {
        width,
        underline: false,
      });
    doc.y += 10;

    drawHrRichTextFlow(doc, input.body, { fontSize: BODY_SIZE });

    if (input.closing.trim()) {
      hrDocEnsureSpace(doc, 20);
      doc
        .font('Helvetica')
        .fontSize(BODY_SIZE)
        .fillColor(C.ink)
        .text(input.closing.trim(), left, doc.y, { width });
      doc.y += 6;
    }

    const draftNote = input.draftNote ?? 'DRAFT – not valid';
    const measure = () => 104;
    await drawHrAuthorizationWithQr(doc, {
      verificationUrl: input.verificationUrl ?? null,
      measure,
      render: (x, y, w) => {
        // Without a QR the box spans the full width: keep the signature in
        // the left 80% and put the draft note where the QR would be.
        const infoW = issued ? w : w * 0.8 - 12;
        let cy = y + 34; // space for the wet signature
        doc
          .moveTo(x, cy)
          .lineTo(x + SIGNATURE_LINE, cy)
          .lineWidth(0.7)
          .strokeColor(C.ink)
          .stroke();
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(C.muted)
          .text('Signature', x, cy + 2, {
            width: SIGNATURE_LINE,
            lineBreak: false,
          });
        cy += 14;
        doc
          .font('Helvetica-Bold')
          .fontSize(BODY_SIZE)
          .fillColor(C.ink)
          .text(input.signatoryName || '—', x, cy, { width: infoW });
        doc
          .font('Helvetica')
          .fontSize(BODY_SIZE - 0.5)
          .fillColor(C.text)
          .text(input.signatoryTitle || '', x, doc.y + 1, { width: infoW });
        cy = doc.y + 18;
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(C.muted)
          .text('Date:', x, cy - 9, { width: 30, lineBreak: false });
        doc
          .moveTo(x + 30, cy)
          .lineTo(x + SIGNATURE_LINE, cy)
          .lineWidth(0.7)
          .strokeColor(C.ink)
          .stroke();
        if (!issued) {
          const nx = x + w * 0.8;
          const nw = w * 0.2 + 12;
          doc
            .rect(nx, y, nw, 66)
            .lineWidth(0.7)
            .dash(3, { space: 2 })
            .strokeColor(C.border)
            .stroke()
            .undash();
          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .fillColor(C.muted)
            .text(draftNote, nx + 4, y + 22, {
              width: nw - 8,
              align: 'center',
            });
        }
      },
    });

    if (input.includeAcknowledgement) {
      doc.y += 16;
      hrDocEnsureSpace(doc, 120);
      const top = doc.y;
      doc
        .moveTo(left, top)
        .lineTo(left + width, top)
        .lineWidth(0.6)
        .strokeColor(C.border)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(BODY_SIZE)
        .fillColor(C.navy)
        .text('Employee acknowledgement', left, top + 10, { width });
      doc
        .font('Helvetica')
        .fontSize(BODY_SIZE - 0.5)
        .fillColor(C.ink)
        .text(
          `I acknowledge receipt of this letter (reference ${input.referenceNo}) and confirm that I have read and understood its contents.`,
          left,
          doc.y + 4,
          { width },
        );
      const ly = doc.y + 30;
      const colW = (width - 24) / 3;
      ['Name', 'Signature', 'Date'].forEach((label, i) => {
        const x = left + i * (colW + 12);
        doc
          .moveTo(x, ly)
          .lineTo(x + colW, ly)
          .lineWidth(0.7)
          .strokeColor(C.ink)
          .stroke();
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(C.muted)
          .text(label, x, ly + 2, { width: colW, lineBreak: false });
      });
      if (label(input.recipient.name)) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(C.ink)
          .text(input.recipient.name, left, ly - 12, {
            width: colW,
            lineBreak: false,
          });
      }
      doc.x = left;
      doc.y = ly + 14;
    }

    drawHrFooters(doc, {
      companyName: input.branding.companyName,
      referenceLabel: issued
        ? `Letter reference: ${input.referenceNo}`
        : 'Letter reference: Draft',
      generatedLabel: `Generated ${formatGenerated(input.generatedAt, input.timezone)}`,
    });
    doc.end();
    return finished;
  }

  private async readLogo(url: string): Promise<Buffer | null> {
    if (!this.filesService) return null;
    const hit = LetterPdfService.logoCache.get(url);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.data;
    let data: Buffer | null = null;
    try {
      data = await this.filesService.readManagedFile(url);
    } catch {
      data = null;
    }
    if (LetterPdfService.logoCache.size > 200)
      LetterPdfService.logoCache.clear();
    LetterPdfService.logoCache.set(url, { at: Date.now(), data });
    return data;
  }
}

function label(value: string | null | undefined) {
  return !!value && value.trim().length > 0;
}

function formatGenerated(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}
