import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/**
 * Leave Application Form renderer.
 *
 * Layout only: every figure on the form is computed by the leave services
 * (LeaveService.getLeaveRequestPdf builds the view model) and is printed as
 * given. This class never queries the database, recalculates durations or
 * balances, or modifies a leave request.
 */

export type LeavePdfApprovalItem = {
  level: number;
  /** Workflow step label, e.g. role/position name ("Department Manager"). */
  step_label?: string | null;
  /** recommend | verify | approve */
  action: string;
  /** pending | approved | rejected | skipped | returned */
  status: string;
  approver_name: string | null;
  approver_designation?: string | null;
  /** Approver this person acted for under an out-of-office delegation. */
  delegated_for_name?: string | null;
  comments: string | null;
  acted_at: Date | null;
  signature_url: string | null;
  /** Authenticated e-signature recorded for this stage, if any. */
  signature?: LeavePdfSignature | null;
};

/** HRMS-recorded electronic signature (not a certificate-based PDF signature). */
export type LeavePdfSignature = {
  signer_name: string;
  signed_at: Date;
  reference: string;
  /** false when the application or decision changed after signing. */
  valid: boolean;
  /** TYPED / DRAWN signature mark; null for older confirmation-only ones. */
  kind?: 'TYPED' | 'DRAWN' | null;
  typed_text?: string | null;
  /** Drawn signature image (PNG). */
  image?: Buffer | null;
};

export type LeavePdfMedicalInfo = {
  sickness_nature: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  hospital_name: string | null;
  treatment_start_date: string | null;
  treatment_end_date: string | null;
  /** Human-readable certificate state, e.g. "Attached". */
  certificate_status: string;
};

export type LeavePdfBalance = {
  fiscal_year: string;
  leave_year_start_date?: string | null;
  leave_year_end_date?: string | null;
  entitlement_days?: string | null;
  opening_balance_days?: string | null;
  accrued_days?: string | null;
  used_days: string;
  pending_days: string;
  approved_future_days?: string | null;
  /** adjusted − expired − attendance deductions + retained (net, signed). */
  other_adjustments_days?: string | null;
  available_days: string;
  /**
   * How this request relates to the balance:
   * - reserved: the request currently holds days (pending/approved), so
   *   "before" adds them back and "after" is the ledger's available figure.
   * - projected: draft / returned — not yet reserved; "after" is a projection.
   * - released: rejected / cancelled — nothing is deducted.
   * - split: the request spans two leave years; per-year figures live in HRMS.
   */
  mode: 'reserved' | 'projected' | 'released' | 'split';
  before_days?: string | null;
  after_days?: string | null;
};

export type LeavePdfPayload = {
  /** Public verification link encoded (only) in the QR code. */
  verification_url?: string | null;
  company_name: string;
  company_logo?: Buffer | null;
  company_address?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  company_website?: string | null;
  /** IANA timezone used to print dates/times. */
  timezone?: string | null;
  /** Fixed clock for reproducible output (tests); defaults to now. */
  generated_at?: Date | null;

  leave_no: string;
  employee_no: string;
  employee_name: string;
  department_name?: string | null;
  position_name?: string | null;
  branch_name?: string | null;
  reporting_manager_name?: string | null;
  employment_type?: string | null;
  hire_date?: string | null;

  leave_type_name: string;
  is_paid?: boolean | null;
  start_date: string;
  end_date: string;
  total_days: string;
  duration_type?: string | null;
  half_day_session?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  /** Next working day after the leave (from the leave calendar), if known. */
  resumption_date?: string | null;
  reason: string;
  status: string;
  current_approval_level?: number | null;
  applied_at?: Date | null;
  approved_at?: Date | null;
  cancelled_at?: Date | null;
  rejection_reason?: string | null;
  returned_at?: Date | null;
  return_reason?: string | null;
  /** Reason recorded when the minimum-notice rule was overridden. */
  notice_override_reason?: string | null;
  evidence_required?: boolean | null;
  evidence_received_at?: Date | null;

  /** Present only for medical-related leave; omitted section otherwise. */
  medical?: LeavePdfMedicalInfo | null;

  /** null → the balance section shows a controlled "unavailable" state. */
  current_balance: LeavePdfBalance | null;

  approval_history: LeavePdfApprovalItem[];
  /** The applicant's authenticated e-signature; null/undefined → Pending. */
  employee_signature?: LeavePdfSignature | null;
  attachments?: LeavePdfAttachment[];
  /**
   * Recorded amendments (end early, evidence deadline extensions). Only the
   * label (the fact) is printed; the free-text reason stays in HRMS.
   */
  extra_remarks?: { label: string; text: string }[];
  /** Acting employee appointed for this leave; null → "Not assigned". */
  acting_employee?: LeavePdfActingEmployee | null;
  /**
   * Pages of supporting documents appended after the form, so the footer
   * counts the whole combined file ("Page 1 of 4").
   */
  appended_page_count?: number;
};

export type LeavePdfAttachment = {
  file_name: string;
  uploaded_at: Date | null;
  /** appended: merged after the form; withheld: restricted for this viewer; not_convertible: kept in HRMS only. */
  disposition?:
    | 'appended'
    | 'withheld'
    | 'not_convertible'
    | 'self'
    | 'duplicate'
    | null;
  /** First page of this document in the combined file. */
  page_from?: number | null;
  page_to?: number | null;
};

export type LeavePdfActingEmployee = {
  name: string;
  employee_no: string;
  department_name: string | null;
  position_name: string | null;
  start_date: string;
  end_date: string;
  /** PENDING | ACTIVE | COMPLETED */
  status: string;
  responsibilities: string | null;
  appointed_by_name: string | null;
};

// ---------------------------------------------------------------------------
// Monochrome design tokens for office printing.
// ---------------------------------------------------------------------------
const C = {
  ink: '#111111',
  text: '#333333',
  muted: '#666666',
  navy: '#1d385f',
  navySoft: '#e8eef5',
  labelBg: '#f0f3f7',
  border: '#c1cddd',
  white: '#FFFFFF',
};

type Tone = { fg: string; bg: string; border: string };
const TONES: Record<string, Tone> = {
  approved: { fg: '#111111', bg: '#FFFFFF', border: '#111111' },
  rejected: { fg: '#111111', bg: '#FFFFFF', border: '#111111' },
  cancelled: { fg: '#111111', bg: '#FFFFFF', border: '#111111' },
  pending: { fg: '#111111', bg: '#FFFFFF', border: '#111111' },
  returned: { fg: '#111111', bg: '#FFFFFF', border: '#111111' },
  draft: { fg: '#111111', bg: '#FFFFFF', border: '#111111' },
};

const A4_FORM_MARGINS = {
  top: (2 * 72) / 2.54,
  bottom: (2 * 72) / 2.54,
  right: (2 * 72) / 2.54,
  left: (2.5 * 72) / 2.54,
};
const NOT_RECORDED = 'Not recorded';
/** Shrink steps tried to keep a non-medical form on one page (80% floor keeps values ≥ 6.8 pt). */
const ONE_PAGE_SCALES = [0.92, 0.86, 0.8];

// One column system for every table (fractions of the content width).
/** Four-column grids: label 20% | value 30% | label 20% | value 30%. */
const GRID_LABEL = 0.2;
/** Two-column rows: label 25% | value 75%. */
const KV_LABEL = 0.25;
/** Balance table: each half is description | days (days = 10% of width). */
const BALANCE_DAYS = 0.1;
/** Final authorization: facts 80% | QR 20%. */
const FINAL_INFO = 0.8;

const LABEL_SIZE = 7.5;
const VALUE_SIZE = 8.5;
const CELL_PAD = 5;
const ROW_MIN = 18;
const HEADING_H = 16;
const SECTION_GAP = 8;
/** Longest piece of one value before it continues as another row. */
const CHUNK = 180;
const SIGNATURE_STRIP = 55;
const QR_MIN = 66; // ≈ 2.3 cm printed — still reliable for phone cameras.
const QR_PAD = 6;
const QR_CAPTION = 14;
/** Footer band, measured from the bottom margin edge downwards. */
const FOOTER_OFFSET = 10;

type Cell = {
  label: string;
  value: string;
  strong?: boolean;
  minHeight?: number;
};
type Row = Cell[]; // one cell = full width, two cells = split row

@Injectable()
export class LeavePdfService {
  /**
   * Non-medical leave forms are kept on one page: when the normal layout
   * spills over, the form is re-rendered slightly smaller. Medical leave
   * (section E) and genuinely long content keep the normal multi-page layout.
   */
  async generateLeaveFormPdf(payload: LeavePdfPayload): Promise<Buffer> {
    const normal = await this.renderForm(payload, 1);
    if (payload.medical || normal.pages <= 1) return normal.pdf;
    for (const scale of ONE_PAGE_SCALES) {
      const compact = await this.renderForm(payload, scale);
      if (compact.pages <= 1) return compact.pdf;
    }
    return normal.pdf;
  }

  /**
   * Renders the form with every page drawn at `scale`. Layout works in
   * scaled user space: margins are converted so the physical A4 margins
   * (and footer position) are unchanged, only content gets smaller.
   */
  private async renderForm(
    payload: LeavePdfPayload,
    scale: number,
  ): Promise<{ pdf: Buffer; pages: number }> {
    const W = 595.28;
    const H = 841.89;
    const m = A4_FORM_MARGINS;
    const margins =
      scale === 1
        ? m
        : {
            top: m.top / scale,
            left: m.left / scale,
            right: W - (W - m.right) / scale,
            bottom: H - (H - m.bottom) / scale,
          };
    const doc = new PDFDocument({
      size: 'A4',
      margins,
      bufferPages: true,
      info: {
        Title: `Leave Application Form ${payload.leave_no}`,
        Author: payload.company_name,
        Subject: 'Leave Application Form',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    if (scale !== 1) {
      doc.scale(scale);
      doc.on('pageAdded', () => doc.scale(scale));
    }

    const fmt = this.formatters(payload.timezone);
    await this.drawCorporateForm(doc, payload, fmt);
    const pages = doc.bufferedPageRange().count;
    this.drawFooters(doc, payload, fmt, payload.generated_at ?? new Date());

    doc.end();
    return { pdf: await finished, pages };
  }

  /**
   * Content-driven layout: sections follow one another and break only where
   * the next row (or approval stage) does not fit. Headings stay with their
   * first row; rows are never split. Free-text reasons, comments and remarks
   * are not printed (they stay in HRMS); decisions, people and dates are.
   */
  private async drawCorporateForm(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): Promise<void> {
    this.drawHeader(doc, p, this.describeStatus(p), fmt);
    const { left, width } = this.frame(doc);
    const end = () => {
      doc.y += SECTION_GAP;
    };

    // A. Employee information (+ acting employee) -------------------------
    this.drawEmployee(doc, p, fmt);

    // B. Leave details ------------------------------------------------------
    this.drawLeaveDetails(doc, p, fmt);

    // C. Balance --------------------------------------------------------------
    this.drawBalance(doc, p, fmt, p.generated_at ?? new Date());

    // D. Declaration ----------------------------------------------------------
    const declaration =
      'I hereby confirm that the information provided in this leave application is accurate and complete to the best of my knowledge. I understand that this application is subject to the company’s leave policies and approval procedures.';
    const declarationRow: Row[] = [
      [{ label: 'Declaration', value: declaration }],
    ];
    this.sectionHeading(
      doc,
      'D. Employee Declaration',
      this.measureGrid(doc, declarationRow, width),
    );
    this.grid(doc, declarationRow, { gap: false });
    this.grid(
      doc,
      [
        [
          { label: 'Employee name', value: p.employee_name },
          { label: 'Submission reference', value: p.leave_no },
        ],
        [
          {
            label: 'Submitted',
            value: p.applied_at
              ? fmt.dateTime(p.applied_at)
              : 'Not yet submitted',
          },
        ],
      ],
      { gap: false },
    );
    end();

    // E. Medical (sick / medical leave only) --------------------------------
    if (p.medical) {
      const m = p.medical;
      const rest = [m.treatment_start_date, m.treatment_end_date]
        .filter((date): date is string => !!date)
        .map((date) => fmt.date(date))
        .join(' - ');
      const rows: Row[] = [
        [
          {
            label: 'Medical facility / hospital',
            value: this.orNot(m.hospital_name),
          },
          {
            label: "Attending doctor's name",
            value: this.orNot(m.doctor_name),
          },
        ],
        [
          {
            label: 'Doctor / facility telephone',
            value: this.orNot(m.doctor_phone),
          },
          { label: 'Certificate status', value: m.certificate_status },
        ],
        [
          { label: 'Recommended rest', value: rest },
          { label: 'Date of medical examination', value: '' },
        ],
        [
          { label: 'Medical certificate ref. no. (if any)', value: '' },
          { label: 'Date of certification', value: '' },
        ],
        [{ label: 'Medical assessment (doctor)', value: '', minHeight: 40 }],
        [
          { label: "Doctor's signature", value: '', minHeight: 32 },
          { label: 'Hospital / clinic stamp', value: '', minHeight: 32 },
        ],
      ];
      this.sectionHeading(
        doc,
        'E. Medical Leave Information',
        this.measureGrid(doc, rows.slice(0, 2), width),
      );
      this.grid(doc, rows);
    }

    // F / G. Approval stages ------------------------------------------------
    const stages = p.approval_history.filter((a) => a.status !== 'skipped');
    const stageRows = (a: LeavePdfApprovalItem): Row[] => {
      return [
        [
          {
            label: 'Action',
            value:
              a.action === 'verify'
                ? 'Verification'
                : this.titleCase(a.action || 'review'),
          },
          {
            label: `Level ${a.level}`,
            value: `${a.step_label?.trim() || `Level ${a.level}`} - ${a.action === 'recommend' && a.status === 'approved' ? 'Recommended' : this.approvalLabel(a.status)}`,
          },
        ],
        [
          {
            label: 'Approver',
            value: [
              a.approver_name || 'Awaiting officer',
              a.approver_designation,
              a.delegated_for_name
                ? `Acting for ${a.delegated_for_name}`
                : null,
            ]
              .filter(Boolean)
              .join(', '),
          },
          {
            label: 'Decision date',
            value: a.acted_at ? fmt.dateTime(a.acted_at) : 'Pending',
          },
        ],
      ];
    };
    const stageHeight = (a: LeavePdfApprovalItem) =>
      this.measureGrid(doc, stageRows(a), width);
    const showStages = (title: string, items: LeavePdfApprovalItem[]) => {
      // Heading travels with the first stage; each stage stays in one piece
      // when it fits a page.
      const none: Row[] = [
        [
          { label: 'HR verification', value: 'Not in this workflow' },
          { label: 'Verified by', value: '________________________' },
        ],
      ];
      this.sectionHeading(
        doc,
        title,
        items.length
          ? stageHeight(items[0])
          : this.measureGrid(doc, none, width),
      );
      if (!items.length) this.grid(doc, none, { gap: false });
      items.forEach((a, i) => {
        if (i > 0) {
          this.ensureSpace(
            doc,
            Math.min(stageHeight(a) + 3, this.usableHeight(doc)),
          );
          // A divider at the top of a fresh page would only be noise.
          if (doc.y > doc.page.margins.top + 1) this.stageDivider(doc);
        }
        this.grid(doc, stageRows(a), { gap: false });
      });
      end();
    };
    showStages(
      'F. Department Recommendation',
      stages.filter((a) => !this.isHrStage(a)),
    );
    showStages(
      'G. For HR / Personnel Department Use',
      stages.filter((a) => this.isHrStage(a)),
    );

    // H. Final authorization (80% facts | 20% QR) -----------------------------
    const final =
      p.status === 'approved' &&
      stages[stages.length - 1]?.status === 'approved'
        ? stages[stages.length - 1]
        : p.status === 'rejected'
          ? [...stages].reverse().find((a) => a.status === 'rejected')
          : undefined;
    const finalRows: Array<[string, string]> = [
      [
        'Final decision',
        p.status === 'approved'
          ? 'APPROVED'
          : p.status === 'rejected'
            ? 'REJECTED'
            : p.status === 'cancelled'
              ? 'CANCELLED'
              : 'PENDING',
      ],
      [
        'Approving authority',
        final?.approver_name
          ? [final.approver_name, final.approver_designation]
              .filter(Boolean)
              .join(', ')
          : p.status === 'approved' || p.status === 'rejected'
            ? NOT_RECORDED
            : 'Pending',
      ],
      [
        'Date',
        final?.acted_at
          ? fmt.dateTime(final.acted_at)
          : p.status === 'approved' && p.approved_at
            ? fmt.dateTime(p.approved_at)
            : p.status === 'cancelled' && p.cancelled_at
              ? fmt.dateTime(p.cancelled_at)
              : 'Pending',
      ],
    ];
    // Facts only; the recorded reasons stay in HRMS.
    if (p.returned_at)
      finalRows.push(['Returned for correction', fmt.dateTime(p.returned_at)]);
    if (p.cancelled_at && p.status !== 'cancelled')
      finalRows.push(['Cancelled at', fmt.dateTime(p.cancelled_at)]);
    for (const extra of p.extra_remarks ?? [])
      finalRows.push(['Amendment', extra.label]);

    const hasQr = !!p.verification_url;
    const infoWidth = hasQr ? width * FINAL_INFO : width;
    const qrWidth = width - infoWidth;
    const heights = finalRows.map(([l, v]) =>
      this.kvHeight(doc, l, v, infoWidth),
    );
    const rowsHeight = heights.reduce((s, h) => s + h, 0);
    // QR fills its 20% column (with padding) but never sets the section
    // height beyond the rows by more than its caption needs.
    const qrSize = hasQr
      ? Math.max(
          QR_MIN,
          Math.min(qrWidth - 2 * QR_PAD, rowsHeight - QR_CAPTION - QR_PAD),
        )
      : 0;
    const qrBlock = hasQr ? qrSize + QR_CAPTION + QR_PAD : 0;
    const sectionHeight = Math.max(rowsHeight, qrBlock);
    if (sectionHeight <= this.usableHeight(doc) - HEADING_H)
      this.ensureSpace(doc, HEADING_H + sectionHeight);
    this.sectionHeading(doc, 'H. Final Authorization', sectionHeight);
    const top = doc.y;
    if (hasQr) {
      const qr = await QRCode.toBuffer(p.verification_url!, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 360,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      const qx = left + infoWidth;
      // Very long facts may continue on the next page; the QR stays beside
      // the first rows, inside this page.
      const panelHeight = Math.min(
        sectionHeight,
        doc.page.height - doc.page.margins.bottom - top,
      );
      this.box(doc, qx, top, qrWidth, panelHeight);
      doc.image(qr, qx + (qrWidth - qrSize) / 2, top + QR_PAD, {
        width: qrSize,
        height: qrSize,
      });
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(C.navy)
        .text('Scan to Verify', qx, top + QR_PAD + qrSize + 3, {
          width: qrWidth,
          align: 'center',
          lineBreak: false,
        });
      doc.x = left;
      doc.y = top;
    }
    // Any height the QR needs beyond the rows goes to the last row (no
    // empty filler box beneath the facts).
    const extra = Math.max(0, qrBlock - rowsHeight);
    finalRows.forEach(([label, value], i) =>
      this.kv(doc, label, value, {
        width: infoWidth,
        minHeight: i === finalRows.length - 1 ? heights[i] + extra : undefined,
      }),
    );
  }

  private usableHeight(doc: PDFKit.PDFDocument): number {
    return doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  }

  private stageDivider(doc: PDFKit.PDFDocument): void {
    const { left, width } = this.frame(doc);
    doc.rect(left, doc.y, width, 3).fill(C.navySoft);
    doc.y += 3;
  }

  private signatureStrip(doc: PDFKit.PDFDocument, image: Buffer): void {
    const { left, width } = this.frame(doc);
    this.ensureSpace(doc, SIGNATURE_STRIP);
    this.drawSignatureImage(
      doc,
      image,
      left + width * GRID_LABEL + CELL_PAD,
      doc.y + 3,
      180,
      48,
    );
    doc.y += SIGNATURE_STRIP;
  }

  /** Wraps a value into pieces of at most CHUNK points so a very long value can continue on the next page between pieces. */
  private chunks(
    doc: PDFKit.PDFDocument,
    value: string,
    valueWidth: number,
  ): string[] {
    if (value === '') return [''];
    const words = value.replace(/[ \t]+/g, ' ').split(' ');
    const out: string[] = [];
    let part = '';
    doc.font('Helvetica').fontSize(VALUE_SIZE);
    for (const word of words) {
      const candidate = part ? `${part} ${word}` : word;
      if (
        part &&
        doc.heightOfString(candidate, { width: valueWidth }) > CHUNK
      ) {
        out.push(part);
        part = word;
      } else part = candidate;
    }
    out.push(part);
    return out;
  }

  /** Height of a two-column (25% label | value) row, all pieces. */
  private kvHeight(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    rowWidth: number,
    minHeight = ROW_MIN,
  ): number {
    const { width } = this.frame(doc);
    const labelW = width * KV_LABEL;
    const valueW = rowWidth - labelW - 2 * CELL_PAD;
    const text = value === '' ? '' : value || NOT_RECORDED;
    return this.chunks(doc, text, valueW).reduce((sum, piece) => {
      doc.font('Helvetica').fontSize(VALUE_SIZE);
      const vh = doc.heightOfString(piece || ' ', { width: valueW });
      doc.font('Helvetica-Bold').fontSize(LABEL_SIZE);
      const lh = doc.heightOfString(label, { width: labelW - 2 * CELL_PAD });
      return sum + Math.max(minHeight, vh + 2 * CELL_PAD, lh + 2 * CELL_PAD);
    }, 0);
  }

  /**
   * Two-column row: label 25% of the content width, value the rest of
   * `width` (the final-authorization rows are 80% wide but keep the same
   * label column). Never split; very long values continue as extra rows.
   */
  private kv(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    opts: { width?: number; minHeight?: number } = {},
  ): void {
    const { left, width } = this.frame(doc);
    const rowWidth = opts.width ?? width;
    const labelW = width * KV_LABEL;
    const valueW = rowWidth - labelW - 2 * CELL_PAD;
    const text = value === '' ? '' : value || NOT_RECORDED;
    const muted = text === NOT_RECORDED;
    for (const piece of this.chunks(doc, text, valueW)) {
      doc.font('Helvetica').fontSize(VALUE_SIZE);
      const vh = doc.heightOfString(piece || ' ', { width: valueW });
      doc.font('Helvetica-Bold').fontSize(LABEL_SIZE);
      const lh = doc.heightOfString(label, { width: labelW - 2 * CELL_PAD });
      const h = Math.max(
        opts.minHeight ?? ROW_MIN,
        vh + 2 * CELL_PAD,
        lh + 2 * CELL_PAD,
      );
      this.ensureSpace(doc, h);
      const y = doc.y;
      doc.rect(left, y, labelW, h).fill(C.labelBg);
      doc
        .font('Helvetica-Bold')
        .fontSize(LABEL_SIZE)
        .fillColor(C.text)
        .text(label, left + CELL_PAD, y + CELL_PAD, {
          width: labelW - 2 * CELL_PAD,
        });
      doc
        .font(muted ? 'Helvetica-Oblique' : 'Helvetica')
        .fontSize(VALUE_SIZE)
        .fillColor(muted ? C.muted : C.ink)
        .text(piece, left + labelW + CELL_PAD, y + CELL_PAD, { width: valueW });
      this.box(doc, left, y, rowWidth, h);
      this.vline(doc, left + labelW, y, h);
      doc.x = left;
      doc.y = y + h;
    }
  }

  private vline(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    h: number,
  ): void {
    doc
      .moveTo(x, y)
      .lineTo(x, y + h)
      .lineWidth(0.5)
      .strokeColor(C.border)
      .stroke();
  }
  private drawSignatureImage(
    doc: PDFKit.PDFDocument,
    image: Buffer,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    try {
      doc.image(image, x, y, { fit: [w, h], align: 'right', valign: 'center' });
    } catch {
      // A damaged image must never break the form.
    }
  }

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  private drawHeader(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    status: StatusInfo,
    fmt: Formatters,
  ): void {
    const { left, width } = this.frame(doc);
    // The letterhead sits above the 2 cm content margin on page 1 only.
    const top = 30;
    // Oversized so it still bleeds edge to edge when the form is scaled.
    doc.rect(0, 0, doc.page.width * 2, 6).fill(C.navy);

    let textX = left;
    let logoBottom = top;
    if (p.company_logo) {
      try {
        doc.image(p.company_logo, left, top, { fit: [48, 48] });
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
      .text(p.company_name.toUpperCase(), textX, top + 2, {
        width: nameW,
        characterSpacing: 0.3,
      });
    const location = [p.branch_name, p.company_address]
      .filter((v) => v && v.trim())
      .join('  ·  ');
    if (location) {
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(C.text)
        .text(location, textX, doc.y + 2, { width: nameW });
    }
    const contact = [p.company_phone, p.company_email]
      .filter(Boolean)
      .join('  ·  ');
    if (contact) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(C.muted)
        .text(contact, textX, doc.y + 1, { width: nameW });
    }
    const leftBottom = Math.max(doc.y, logoBottom);

    // Right: reference / submitted / status.
    const mx = left + width - metaW;
    const rows: [string, string][] = [
      ['Reference', p.leave_no],
      [
        'Submitted',
        p.applied_at ? fmt.dateTime(p.applied_at) : 'Not yet submitted',
      ],
    ];
    let my = top + 1;
    rows.forEach(([label, value]) => {
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
    });
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text('Status', mx, my + 3, { width: 58, lineBreak: false });
    const pillW = this.pillWidth(doc, status.label, 7.5);
    this.pill(doc, left + width - pillW, my, status.label, status.tone, 7.5);
    const rightBottom = my + 18;

    // Centred title with a double rule, echoing the paper form.
    const ty = Math.max(leftBottom, rightBottom) + 10;
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(C.navy)
      .text('LEAVE APPLICATION FORM', left, ty, {
        width,
        align: 'center',
        characterSpacing: 1.6,
      });
    const ry = doc.y + 4;
    doc
      .moveTo(left, ry)
      .lineTo(left + width, ry)
      .lineWidth(1.2)
      .strokeColor(C.navy)
      .stroke();
    doc
      .moveTo(left, ry + 2.5)
      .lineTo(left + width, ry + 2.5)
      .lineWidth(0.5)
      .strokeColor(C.navy)
      .stroke();
    doc.x = left;
    doc.y = ry + 10;
  }

  // -------------------------------------------------------------------------
  // Sections
  // -------------------------------------------------------------------------

  private drawEmployee(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): void {
    const rows: Row[] = [
      [
        { label: 'Employee full name', value: p.employee_name, strong: true },
        { label: 'Employee number', value: p.employee_no, strong: true },
      ],
      [
        { label: 'Branch / office', value: this.orNot(p.branch_name) },
        { label: 'Department', value: this.orNot(p.department_name) },
      ],
      [
        { label: 'Position / designation', value: this.orNot(p.position_name) },
        {
          label: 'Employment type',
          value: p.employment_type
            ? this.titleCase(p.employment_type)
            : NOT_RECORDED,
        },
      ],
      [
        {
          label: 'Date of joining',
          value: p.hire_date ? fmt.date(p.hire_date) : NOT_RECORDED,
        },
        {
          label: 'Reporting manager',
          value: this.orNot(p.reporting_manager_name),
        },
      ],
    ];
    const a = p.acting_employee;
    if (!a) {
      rows.push([{ label: 'Acting employee', value: 'Not assigned' }]);
    } else {
      const status =
        a.status === 'ACTIVE'
          ? 'Active'
          : a.status === 'COMPLETED'
            ? 'Completed'
            : 'Scheduled';
      rows.push(
        [
          { label: 'Acting employee', value: a.name, strong: true },
          { label: 'Acting employee number', value: a.employee_no },
        ],
        [
          { label: 'Acting: department', value: this.orNot(a.department_name) },
          {
            label: 'Acting: position / designation',
            value: this.orNot(a.position_name),
          },
        ],
        [
          {
            label: 'Delegation period',
            value: `${fmt.date(a.start_date)} – ${fmt.date(a.end_date)} (${status})`,
          },
          { label: 'Appointed by', value: this.orNot(a.appointed_by_name) },
        ],
      );
      if (a.responsibilities?.trim())
        rows.push([
          {
            label: 'Delegated responsibilities',
            value: a.responsibilities.trim(),
          },
        ]);
    }
    this.section(doc, 'A. Employee Information', rows);
  }

  private drawLeaveDetails(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): void {
    const days = this.trimNumber(p.total_days);
    const unit = Number(p.total_days) === 1 ? 'day' : 'days';
    const partial =
      p.duration_type === 'HALF_DAY' || p.duration_type === 'SHORT_LEAVE';
    const resumption = p.resumption_date
      ? fmt.date(p.resumption_date)
      : partial
        ? 'Same day, after the leave period'
        : NOT_RECORDED;

    const rows: Row[] = [
      [
        { label: 'Leave type', value: p.leave_type_name, strong: true },
        {
          label: 'Leave category',
          value:
            p.is_paid === undefined || p.is_paid === null
              ? NOT_RECORDED
              : p.is_paid
                ? 'Paid leave'
                : 'Unpaid leave',
        },
      ],
      [
        {
          label: 'Leave start date',
          value: fmt.date(p.start_date),
          strong: true,
        },
        { label: 'Leave end date', value: fmt.date(p.end_date), strong: true },
      ],
      [
        {
          label: 'Total days requested',
          value: `${days} ${unit}`,
          strong: true,
        },
        { label: 'Duration', value: this.durationLabel(p) },
      ],
      [
        { label: 'Expected resumption', value: resumption },
        {
          label: 'Date of application',
          value: p.applied_at
            ? fmt.dateTime(p.applied_at)
            : 'Not yet submitted',
        },
      ],
    ];
    // The reason for leave is not printed (kept in HRMS for authorised users).
    const prior = this.priorApprovalText(p);
    if (prior) rows.push([{ label: 'Prior sanction', value: prior }]);
    // Supporting documents are appended as pages after the form, not listed here.
    if (p.evidence_required != null || p.evidence_received_at)
      rows.push([
        {
          label: 'Evidence required',
          value:
            p.evidence_required == null
              ? NOT_RECORDED
              : p.evidence_required
                ? 'Yes'
                : 'No',
        },
        {
          label: 'Evidence received',
          value: p.evidence_received_at
            ? fmt.dateTime(p.evidence_received_at)
            : p.evidence_required
              ? 'Not yet received'
              : 'Not applicable',
        },
      ]);

    this.section(doc, 'B. Leave Application Details', rows);
  }

  private drawBalance(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
    generatedAt: Date,
  ): void {
    const title = 'C. Leave Balance Summary';
    const b = p.current_balance;
    if (!b) {
      this.section(doc, title, [
        [
          {
            label: 'Balance',
            value: `Unavailable — no ${p.leave_type_name} balance record was found for this leave year. Confirm the balance in HRMS before relying on this form.`,
          },
        ],
      ]);
      return;
    }

    const n = (v?: string | null) =>
      v == null ? 'Unavailable' : this.trimNumber(v);
    const nonZero = (v?: string | null) => !!v && Number(v) !== 0;
    const lines: { label: string; value: string; strong?: boolean }[] = [
      {
        label: 'Annual entitlement (full leave year)',
        value: n(b.entitlement_days),
      },
    ];
    // Whenever less than the full entitlement has been earned (accrual,
    // probation), say so: the entitlement is not what is available.
    if (
      b.accrued_days != null &&
      Number(b.accrued_days) !== Number(b.entitlement_days)
    ) {
      lines.push({ label: 'Accrued to date', value: n(b.accrued_days) });
    }
    lines.push(
      {
        label: 'Opening / carried forward balance',
        value: n(b.opening_balance_days),
      },
      { label: 'Leave already taken', value: n(b.used_days) },
      { label: 'Pending leave (awaiting approval)', value: n(b.pending_days) },
    );
    if (nonZero(b.approved_future_days)) {
      lines.push({
        label: 'Approved leave not yet taken',
        value: n(b.approved_future_days),
      });
    }
    if (nonZero(b.other_adjustments_days)) {
      lines.push({
        label: 'Other adjustments (net)',
        value: n(b.other_adjustments_days),
      });
    }

    let note: string;
    const requested = this.trimNumber(p.total_days);
    switch (b.mode) {
      case 'reserved':
        lines.push(
          {
            label: 'Available balance before this request',
            value: n(b.before_days ?? b.available_days),
          },
          { label: 'Days requested (this application)', value: requested },
          {
            label: 'Balance after this request',
            value: n(b.after_days ?? b.available_days),
            strong: true,
          },
        );
        note =
          'Pending / approved figures above already include this application; it is deducted once.';
        break;
      case 'projected':
        lines.push(
          {
            label: 'Available balance before request',
            value: n(b.before_days ?? b.available_days),
          },
          { label: 'Days requested (this application)', value: requested },
          {
            label: 'Projected balance if approved',
            value: n(b.after_days ?? b.available_days),
            strong: true,
          },
        );
        note =
          'This application has not been submitted for approval yet, so no days are reserved.';
        break;
      case 'released':
        lines.push(
          { label: 'Days requested (this application)', value: requested },
          {
            label: 'Available balance (nothing deducted)',
            value: n(b.available_days),
            strong: true,
          },
        );
        note = `No days are deducted for a ${p.status} application.`;
        break;
      default:
        lines.push({
          label: 'Available balance (this leave year)',
          value: n(b.available_days),
          strong: true,
        });
        note =
          'This application spans two leave years; per-year deductions are shown in HRMS.';
    }
    if ((lines.find((l) => l.strong)?.value ?? '').startsWith('-')) {
      note +=
        ' A negative figure means days requested exceed the balance; it is shown exactly as held in the leave ledger.';
    }
    const year =
      b.leave_year_start_date && b.leave_year_end_date
        ? `${fmt.date(b.leave_year_start_date)} – ${fmt.date(b.leave_year_end_date)}`
        : `FY ${b.fiscal_year}`;
    note = `${p.leave_type_name}, leave year ${year}. Working days, as at ${fmt.dateTime(generatedAt)}. ${note}`;

    // Two Description | Days columns side by side; the closing (strong)
    // figure spans the full width.
    const strong = lines.filter((l) => l.strong);
    const body = lines.filter((l) => !l.strong);
    const half = Math.ceil(body.length / 2);
    const columns = [body.slice(0, half), body.slice(half)];
    const rowH = 16;
    const bodyRows = half;
    // Heading stays with the column header and the first two rows; the
    // rest continues on the next page at row boundaries if needed.
    this.sectionHeading(doc, title, rowH * 3);
    const { left, width } = this.frame(doc);
    const colW = width / 2;
    const valueW = width * BALANCE_DAYS;
    let y = doc.y;
    const cell = (
      x: number,
      cy: number,
      w: number,
      label: string,
      value: string,
      opts: { header?: boolean; strong?: boolean } = {},
    ) => {
      if (opts.header) doc.rect(x, cy, w, rowH).fill(C.navySoft);
      else if (opts.strong) doc.rect(x, cy, w, rowH).fill(C.labelBg);
      doc
        .font(opts.header || opts.strong ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(opts.header ? 7 : 8.3)
        .fillColor(opts.header ? C.navy : C.ink)
        .text(label, x + CELL_PAD, cy + (opts.header ? 5.5 : 4.6), {
          width: w - valueW - 2 * CELL_PAD,
          lineBreak: false,
          ellipsis: true,
        })
        .text(value, x + w - valueW, cy + (opts.header ? 5.5 : 4.6), {
          width: valueW - CELL_PAD,
          align: 'right',
          lineBreak: false,
        });
      this.box(doc, x, cy, w, rowH);
      doc
        .moveTo(x + w - valueW, cy)
        .lineTo(x + w - valueW, cy + rowH)
        .lineWidth(0.5)
        .strokeColor(C.border)
        .stroke();
    };
    cell(left, y, colW, 'DESCRIPTION', 'DAYS', { header: true });
    cell(left + colW, y, colW, 'DESCRIPTION', 'DAYS', { header: true });
    y += rowH;
    // Moves to a new page when the next row does not fit; returns its top.
    const rowTop = () => {
      doc.y = y;
      this.ensureSpace(doc, rowH);
      return doc.y;
    };
    for (let r = 0; r < bodyRows; r++) {
      y = rowTop();
      columns.forEach((col, c) => {
        const line = col[r];
        if (line) cell(left + c * colW, y, colW, line.label, line.value);
        else this.box(doc, left + c * colW, y, colW, rowH);
      });
      y += rowH;
    }
    strong.forEach((line) => {
      y = rowTop();
      cell(left, y, width, line.label, line.value, { strong: true });
      y += rowH;
    });
    doc.y = y + 2;
    this.note(doc, note);
  }

  /**
   * Compact footer on every form page, aligned to the content margins and
   * drawn below the bottom margin (content never reaches it). The page count
   * includes appended supporting documents.
   */
  private drawFooters(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
    generatedAt: Date,
  ): void {
    const range = doc.bufferedPageRange();
    const total = range.count + Math.max(0, p.appended_page_count ?? 0);
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const { left, width } = this.frame(doc);
      // Lift the bottom margin while writing so pdfkit never adds a page.
      const savedBottom = doc.page.margins.bottom;
      const y = doc.page.height - savedBottom + FOOTER_OFFSET;
      // Negative so a scaled form (footer y beyond nominal height) still fits.
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
        .text(p.company_name, left, y, {
          width: width * 0.6,
          lineBreak: false,
          ellipsis: true,
        });
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(C.muted)
        .text(`Leave Application Reference: ${p.leave_no}`, left, y + 10, {
          width: width * 0.6,
          lineBreak: false,
        })
        .text(
          `Generated: ${fmt.dateTime(generatedAt)} (${fmt.tz})`,
          left + width * 0.4,
          y,
          { width: width * 0.6, align: 'right', lineBreak: false },
        )
        .text(
          `Page ${i - range.start + 1} of ${total}`,
          left + width * 0.4,
          y + 10,
          { width: width * 0.6, align: 'right', lineBreak: false },
        );
      doc.page.margins.bottom = savedBottom;
    }
  }

  // -------------------------------------------------------------------------
  // Building blocks
  // -------------------------------------------------------------------------

  private frame(doc: PDFKit.PDFDocument) {
    const left = doc.page.margins.left;
    return { left, width: doc.page.width - left - doc.page.margins.right };
  }

  private ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  }

  /**
   * Section heading, moved to the next page only when it and `keepWith`
   * points (its first row or stage) do not fit here.
   */
  private sectionHeading(
    doc: PDFKit.PDFDocument,
    title: string,
    keepWith: number,
  ): void {
    this.ensureSpace(
      doc,
      HEADING_H + Math.min(keepWith, this.usableHeight(doc) - HEADING_H),
    );
    const { left, width } = this.frame(doc);
    const y = doc.y;
    doc.rect(left, y, width, HEADING_H).fill(C.navy);
    doc
      .font('Helvetica-Bold')
      .fontSize(VALUE_SIZE)
      .fillColor(C.white)
      .text(title.toUpperCase(), left + 7, y + 4.5, {
        width: width - 14,
        characterSpacing: 0.6,
        lineBreak: false,
      });
    doc.x = left;
    doc.y = y + HEADING_H;
  }

  private section(
    doc: PDFKit.PDFDocument,
    title: string,
    rows: Row[],
    note?: string,
  ): void {
    const { width } = this.frame(doc);
    this.sectionHeading(
      doc,
      title,
      rows.length ? this.rowHeight(doc, rows[0], width) : 0,
    );
    this.grid(doc, rows);
    if (note) {
      doc.y -= 5;
      this.note(doc, note);
    }
  }

  private note(doc: PDFKit.PDFDocument, text: string): void {
    const { left, width } = this.frame(doc);
    doc.font('Helvetica-Oblique').fontSize(7);
    this.ensureSpace(doc, doc.heightOfString(text, { width }) + 4);
    doc.fillColor(C.muted).text(text, left, doc.y, { width });
    doc.x = left;
    doc.y += SECTION_GAP;
  }

  /** Four-column grid geometry: 20% label | 30% value per half. */
  private gridLayout(width: number) {
    return { labelW: width * GRID_LABEL, half: width / 2 };
  }

  private rowHeight(doc: PDFKit.PDFDocument, row: Row, width: number): number {
    const { labelW, half } = this.gridLayout(width);
    const cellW = row.length === 1 ? width : half;
    return Math.max(
      ROW_MIN,
      ...row.map((cell) => {
        doc.font('Helvetica-Bold').fontSize(LABEL_SIZE);
        const lh = doc.heightOfString(cell.label, {
          width: labelW - 2 * CELL_PAD,
        });
        doc
          .font(cell.strong ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(cell.strong ? 9 : VALUE_SIZE);
        const vh = doc.heightOfString(cell.value || ' ', {
          width: cellW - labelW - 2 * CELL_PAD,
        });
        return Math.max(cell.minHeight ?? 0, Math.max(lh, vh) + 2 * CELL_PAD);
      }),
    );
  }

  private measureGrid(doc: PDFKit.PDFDocument, rows: Row[], width: number) {
    return rows.reduce((s, r) => s + this.rowHeight(doc, r, width), 0);
  }

  /**
   * Bordered label/value grid. Two cells per row use the 20/30/20/30
   * columns; a single cell spans the row with the same 20% label column so
   * labels stay aligned. Rows never split across pages.
   */
  private grid(
    doc: PDFKit.PDFDocument,
    rows: Row[],
    opts: { gap?: boolean } = {},
  ): void {
    const { left, width } = this.frame(doc);
    const { labelW, half } = this.gridLayout(width);
    rows.forEach((row) => {
      const h = this.rowHeight(doc, row, width);
      this.ensureSpace(doc, h);
      const y = doc.y;
      const cellW = row.length === 1 ? width : half;
      row.forEach((cell, i) => {
        const x = left + i * half;
        doc.rect(x, y, labelW, h).fill(C.labelBg);
        doc
          .font('Helvetica-Bold')
          .fontSize(LABEL_SIZE)
          .fillColor(C.text)
          .text(cell.label, x + CELL_PAD, y + CELL_PAD, {
            width: labelW - 2 * CELL_PAD,
          });
        const muted = cell.value === NOT_RECORDED;
        doc
          .font(
            cell.strong
              ? 'Helvetica-Bold'
              : muted
                ? 'Helvetica-Oblique'
                : 'Helvetica',
          )
          .fontSize(cell.strong ? 9 : VALUE_SIZE)
          .fillColor(muted ? C.muted : C.ink)
          .text(cell.value, x + labelW + CELL_PAD, y + CELL_PAD, {
            width: cellW - labelW - 2 * CELL_PAD,
          });
        this.box(doc, x, y, cellW, h);
        this.vline(doc, x + labelW, y, h);
      });
      doc.x = left;
      doc.y = y + h;
    });
    if (opts.gap !== false) doc.y += SECTION_GAP;
  }

  private box(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(C.border).stroke();
  }

  private pillWidth(
    doc: PDFKit.PDFDocument,
    text: string,
    size: number,
  ): number {
    doc.font('Helvetica-Bold').fontSize(size);
    return (
      doc.widthOfString(text.toUpperCase(), { characterSpacing: 0.5 }) +
      size * 2
    );
  }

  private pill(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    text: string,
    tone: Tone,
    size: number,
  ): void {
    const w = this.pillWidth(doc, text, size);
    const h = size + 7;
    doc.roundedRect(x, y, w, h, h / 2).fillAndStroke(tone.bg, tone.border);
    doc
      .font('Helvetica-Bold')
      .fontSize(size)
      .fillColor(tone.fg)
      .text(text.toUpperCase(), x, y + 4, {
        width: w,
        align: 'center',
        characterSpacing: 0.5,
        lineBreak: false,
      });
  }

  // -------------------------------------------------------------------------
  // Data helpers (presentation only)
  // -------------------------------------------------------------------------

  /**
   * Status is derived strictly from the request record; "Approved" is shown
   * only when the request itself is approved (all required levels done).
   */
  private describeStatus(p: LeavePdfPayload): StatusInfo {
    const approvedSteps = p.approval_history.filter(
      (a) => a.status === 'approved',
    ).length;
    const total = p.approval_history.filter(
      (a) => a.status !== 'skipped',
    ).length;
    switch (p.status) {
      case 'approved':
        return { label: 'Approved', tone: TONES.approved };
      case 'rejected':
        return { label: 'Rejected', tone: TONES.rejected };
      case 'cancelled':
        return { label: 'Cancelled', tone: TONES.cancelled };
      case 'returned_for_correction':
        return { label: 'Returned', tone: TONES.returned };
      case 'draft':
        return { label: 'Draft', tone: TONES.draft };
      default: {
        const stage =
          p.status === 'pending_department_manager'
            ? 'Awaiting Head of Department'
            : p.status === 'pending_hr'
              ? 'Awaiting HR'
              : 'In review';
        const partial = approvedSteps > 0 && total > 0;
        return {
          label:
            p.status === 'pending_hr'
              ? 'Pending HR approval'
              : p.status === 'pending_department_manager'
                ? 'Pending department approval'
                : partial
                  ? 'Pending further approval'
                  : 'Pending approval',
          tone: TONES.pending,
          detail:
            total > 0
              ? `${stage} · ${approvedSteps} of ${total} approvals complete`
              : stage,
        };
      }
    }
  }

  private isHrStage(a: LeavePdfApprovalItem): boolean {
    return /\b(hr|human resources?|personnel)\b/i.test(
      `${a.step_label ?? ''} ${a.approver_designation ?? ''}`,
    );
  }

  private priorApprovalText(p: LeavePdfPayload): string | null {
    if (p.notice_override_reason?.trim()) {
      // The recorded reason stays in HRMS; the form states the fact only.
      return 'Minimum notice requirement overridden by an authorised approver (reason recorded in HRMS).';
    }
    const applied = p.applied_at
      ? p.applied_at.toISOString().slice(0, 10)
      : null;
    if (applied && applied > p.start_date.slice(0, 10)) {
      return 'Applied after the leave had started (retrospective); no separate reason was recorded.';
    }
    return null;
  }

  private approvalTone(status: string): Tone {
    if (status === 'approved') return TONES.approved;
    if (status === 'rejected') return TONES.rejected;
    if (status === 'returned') return TONES.returned;
    if (status === 'skipped') return TONES.draft;
    return TONES.pending;
  }

  private approvalLabel(status: string): string {
    return (
      {
        approved: 'Approved',
        rejected: 'Rejected',
        returned: 'Returned',
        skipped: 'Skipped',
      }[status] ?? 'Pending'
    );
  }

  private durationLabel(p: LeavePdfPayload): string {
    if (p.duration_type === 'HALF_DAY') {
      return p.half_day_session
        ? `Half day (${this.titleCase(p.half_day_session)})`
        : 'Half day';
    }
    if (p.duration_type === 'SHORT_LEAVE') {
      const times =
        p.start_time && p.end_time
          ? ` ${p.start_time.slice(0, 5)}–${p.end_time.slice(0, 5)}`
          : '';
      return `Short leave${times}`;
    }
    return 'Full day(s)';
  }

  private orNot(value?: string | null): string {
    return value && value.trim() ? value.trim() : NOT_RECORDED;
  }

  private trimNumber(value: string): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
  }

  private titleCase(value: string): string {
    return value
      .toLowerCase()
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');
  }

  private formatters(timezone?: string | null): Formatters {
    const tz = this.safeTimezone(timezone);
    const dateFmt = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const dtFmt = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    });
    return {
      tz,
      // Leave dates are calendar dates (YYYY-MM-DD) — format without shifting.
      date: (value: string) => {
        const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
        return Number.isNaN(d.getTime()) ? String(value) : dateFmt.format(d);
      },
      dateTime: (value: Date) => dtFmt.format(value).replace(',', ''),
    };
  }

  private safeTimezone(timezone?: string | null): string {
    const tz = timezone || 'Africa/Dar_es_Salaam';
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: tz });
      return tz;
    } catch {
      return 'UTC';
    }
  }
}

type StatusInfo = { label: string; tone: Tone; detail?: string };
type Formatters = {
  tz: string;
  date: (value: string) => string;
  dateTime: (value: Date) => string;
};
