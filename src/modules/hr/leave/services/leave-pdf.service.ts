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
  attachments?: { file_name: string; uploaded_at: Date | null }[];
};

// ---------------------------------------------------------------------------
// Monochrome design tokens for office printing.
// ---------------------------------------------------------------------------
const C = {
  ink: '#111111',
  text: '#333333',
  muted: '#666666',
  navy: '#111111',
  navySoft: '#EEEEEE',
  labelBg: '#F4F4F4',
  border: '#AAAAAA',
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

const PAGE = { margin: 36, footer: 30 };
const NOT_RECORDED = 'Not recorded';
/** Row height of the compact one-page form. */
const ROW = 16;
const QR_SIZE = 92; // ≈ 3.2 cm printed — reliable for phone cameras.

type Cell = { label: string; value: string; strong?: boolean };
type Row = Cell[]; // one cell = full width, two cells = split row

@Injectable()
export class LeavePdfService {
  async generateLeaveFormPdf(payload: LeavePdfPayload): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: PAGE.margin,
        left: PAGE.margin,
        right: PAGE.margin,
        bottom: PAGE.margin + PAGE.footer,
      },
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

    await this.drawCompactForm(doc, payload);

    doc.end();
    return finished;
  }

  private async drawCompactForm(doc: PDFKit.PDFDocument, p: LeavePdfPayload) {
    // Fixed, measured blocks leave space for a printable QR and never add pages.
    doc.page.margins.bottom = 0;
    const fmt = this.formatters(p.timezone);
    const left = 34;
    const width = doc.page.width - left * 2;
    const half = width / 2;
    const right = left + width;
    const qrSize = 72;
    const qrY = doc.page.height - 120;
    const contentLimit = qrY - 12;
    let y = 32;
    let supplementary = false;
    let inSection = false;
    let framedRows = true;
    const clean = (value?: string | null) =>
      value?.replace(/\s+/g, ' ').trim() || NOT_RECORDED;
    const line = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      weight = 0.4,
    ) => {
      doc
        .save()
        .strokeColor('#000000')
        .lineWidth(weight)
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke()
        .restore();
    };
    const put = (
      value: string,
      x: number,
      top: number,
      w: number,
      opts?: {
        bold?: boolean;
        size?: number;
        align?: 'left' | 'right' | 'center';
      },
    ) => {
      const size = opts?.size ?? 10;
      const font = opts?.bold ? 'Helvetica-Bold' : 'Helvetica';
      doc.font(font).fontSize(size).fillColor('#000000');
      let display = clean(value);
      if (doc.widthOfString(display) > w) {
        supplementary = true;
        display = 'See HRMS';
      }
      doc.text(display, x, top, {
        width: w,
        height: size + 4,
        lineBreak: false,
        align: opts?.align ?? 'left',
      });
    };
    const section = (title: string) => {
      const heading = title.toUpperCase();
      if (inSection) y += 5;
      put(heading, left + 5, y, width - 10, {
        bold: true,
        size: 12,
        align: 'center',
      });
      y += 21;
      inSection = true;
    };
    const rowFrame = (top: number, height: number, columns: 1 | 2) => {
      if (!inSection || !framedRows) return;
      doc
        .save()
        .rect(left, top - 2, width, height)
        .lineWidth(0.45)
        .strokeColor('#000000')
        .stroke()
        .restore();
      if (columns === 2)
        line(left + half, top - 2, left + half, top - 2 + height, 0.45);
    };
    const field = (
      label: string,
      value: string,
      x: number,
      top: number,
      w: number,
    ) => {
      doc.font('Helvetica').fontSize(10);
      const labelText = `${label}:`;
      const labelW = Math.min(doc.widthOfString(labelText) + 7, w * 0.53);
      put(labelText, x, top, labelW);
      put(value, x + labelW, top, w - labelW - 4, { bold: true });
    };
    const two = (a: [string, string], b: [string, string]) => {
      rowFrame(y, ROW, 2);
      const pad = inSection ? 5 : 0;
      field(a[0], a[1], left + pad, y, half - 8 - pad);
      field(b[0], b[1], left + half + pad, y, half - 8 - pad);
      y += ROW;
    };
    const one = (label: string, value: string) => {
      rowFrame(y, ROW, 1);
      const pad = inSection ? 5 : 0;
      field(label, value, left + pad, y, width - pad * 2);
      y += ROW;
    };
    const number = (value?: string | null) =>
      value == null ? 'Unavailable' : this.trimNumber(value);
    const balance = p.current_balance;
    const before =
      balance && balance.mode !== 'split'
        ? number(balance.before_days ?? balance.available_days)
        : 'See HRMS';
    const after =
      balance && balance.mode !== 'split'
        ? number(balance.after_days ?? balance.available_days)
        : 'See HRMS';
    const requestStatus = this.describeStatus(p).label.toUpperCase();

    // Header: a clear corporate identity and small metadata strip.
    put(p.company_name.toUpperCase(), left, y, width, {
      size: 12,
      bold: true,
      align: 'center',
    });
    y += 18;
    put('LEAVE APPLICATION FORM', left, y, width, {
      size: 12,
      bold: true,
      align: 'center',
    });
    y += 19;
    line(left, y, right, y, 1);
    y += 7;
    two(
      ['Reference', p.leave_no],
      [
        'Application date',
        p.applied_at ? fmt.dateTime(p.applied_at) : 'Not submitted',
      ],
    );
    two(['Branch / office', clean(p.branch_name)], ['Status', requestStatus]);
    y += 4;

    section('A. Employee Information');
    two(
      ['Employee full name', p.employee_name],
      ['Employee number', p.employee_no],
    );
    two(
      ['Department', clean(p.department_name)],
      ['Position', clean(p.position_name)],
    );
    two(
      [
        'Employment type',
        p.employment_type ? this.titleCase(p.employment_type) : NOT_RECORDED,
      ],
      ['Date of joining', p.hire_date ? fmt.date(p.hire_date) : NOT_RECORDED],
    );
    y += 3;

    section('B. Leave Application Details');
    two(
      ['Leave type', p.leave_type_name],
      [
        'Category',
        p.is_paid == null
          ? NOT_RECORDED
          : p.is_paid
            ? 'Paid leave'
            : 'Unpaid leave',
      ],
    );
    two(
      ['Leave period', `${fmt.date(p.start_date)} - ${fmt.date(p.end_date)}`],
      ['Requested days', this.trimNumber(p.total_days)],
    );
    two(
      ['Duration', this.durationLabel(p)],
      [
        'Expected resumption',
        p.resumption_date
          ? fmt.date(p.resumption_date)
          : p.duration_type === 'HALF_DAY' || p.duration_type === 'SHORT_LEAVE'
            ? 'Same day, after leave'
            : NOT_RECORDED,
      ],
    );
    const reason = clean(p.reason);
    doc.font('Helvetica').fontSize(10);
    const reasonLabel = 'Reason for leave:';
    const reasonLabelWidth = doc.widthOfString(reasonLabel) + 7;
    const reasonWidth = width - reasonLabelWidth - 14;
    doc.font('Helvetica-Bold').fontSize(10);
    const reasonHeight = doc.heightOfString(reason, {
      width: reasonWidth,
      lineGap: 2,
    });
    if (reasonHeight > 28) {
      supplementary = true;
      one('Reason for leave', 'See HRMS');
    } else {
      const rowHeight = Math.max(17, reasonHeight + 3);
      rowFrame(y, rowHeight, 1);
      put(reasonLabel, left + 5, y, reasonLabelWidth);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#000000')
        .text(reason, left + 5 + reasonLabelWidth, y, {
          width: reasonWidth,
          height: 28,
          lineGap: 2,
        });
      y += rowHeight;
    }
    if (p.notice_override_reason || p.rejection_reason || p.return_reason)
      supplementary = true;
    y += 3;

    if (p.medical) {
      section('C. Medical Leave Information');
      two(
        ['Nature of sickness', clean(p.medical.sickness_nature)],
        ['Medical facility', clean(p.medical.hospital_name)],
      );
      two(
        [
          'Treatment from',
          p.medical.treatment_start_date
            ? fmt.date(p.medical.treatment_start_date)
            : NOT_RECORDED,
        ],
        [
          'Treatment to',
          p.medical.treatment_end_date
            ? fmt.date(p.medical.treatment_end_date)
            : NOT_RECORDED,
        ],
      );
      if (p.medical.doctor_name || p.medical.doctor_phone) supplementary = true;
      y += 3;
    }

    section('D. Leave Balance Summary');
    if (!balance) {
      one('Balance', 'Unavailable');
    } else {
      two(
        ['Applicable entitlement', number(balance.entitlement_days)],
        ['Opening / carried forward', number(balance.opening_balance_days)],
      );
      two(
        ['Leave taken', number(balance.used_days)],
        ['Pending leave', number(balance.pending_days)],
      );
      two(
        ['Available before request', before],
        ['Requested days', this.trimNumber(p.total_days)],
      );
      two(
        [
          balance.mode === 'projected'
            ? 'Remaining if approved'
            : balance.mode === 'released'
              ? 'Available balance'
              : 'Remaining balance',
          after,
        ],
        ['Leave year', balance.fiscal_year],
      );
      if (
        balance.other_adjustments_days &&
        Number(balance.other_adjustments_days) !== 0
      )
        one('Adjustments (net)', number(balance.other_adjustments_days));
      if (
        balance.mode === 'split' ||
        (balance.approved_future_days &&
          Number(balance.approved_future_days) !== 0)
      )
        supplementary = true;
    }
    y += 3;

    section('E. Employee Declaration');
    const declarationTop = y - 2;
    framedRows = false;
    put(
      'I confirm that the information in this application is accurate.',
      left + 5,
      y,
      width - 10,
    );
    y += ROW;
    const empSig = p.employee_signature;
    if (empSig?.valid) {
      one('Electronically signed by', empSig.signer_name);
      two(
        ['Date', fmt.dateTime(empSig.signed_at)],
        ['Signature reference', empSig.reference],
      );
    } else {
      two(
        ['Employee name', p.employee_name],
        ['Employee Signature', empSig ? 'Not valid - re-sign' : 'Pending'],
      );
      if (empSig) supplementary = true;
    }
    doc
      .save()
      .rect(left, declarationTop, width, y - declarationTop - 2)
      .lineWidth(0.45)
      .strokeColor('#000000')
      .stroke()
      .restore();
    framedRows = true;
    y += 3;

    // F and G are mandatory. G is sized first so it can never be squeezed
    // out; F shows every stage when they fit, otherwise an accurate summary
    // line plus the most recent stages. H sits in the band beside the QR.
    const stages = p.approval_history.filter(
      (stage) => stage.status !== 'skipped',
    );
    const otherStages = stages.filter((stage) => !this.isHrStage(stage));
    const hrStages = stages.filter((stage) => this.isHrStage(stage));
    const HEADING = 26;
    const STAGE = ROW * 3;
    const signatureText = (stage: LeavePdfApprovalItem) => {
      if (stage.status === 'pending') return 'Pending decision';
      if (stage.signature?.valid)
        return `Electronically signed ${fmt.dateTime(stage.signature.signed_at)} - Ref ${stage.signature.reference}`;
      if (stage.signature)
        return `Signature no longer valid (Ref ${stage.signature.reference}) - see HRMS`;
      return 'Approval Recorded — Signature Not Available';
    };
    const renderStage = (stage: LeavePdfApprovalItem) => {
      const stageName = stage.step_label?.trim() || `Level ${stage.level}`;
      const action =
        stage.action === 'recommend' && stage.status === 'approved'
          ? 'Recommended'
          : this.approvalLabel(stage.status);
      const person = stage.approver_name || 'Awaiting officer';
      const designation = stage.approver_designation?.trim();
      const actionKind =
        stage.action === 'recommend'
          ? 'Recommendation'
          : stage.action === 'verify'
            ? 'Verification'
            : stage.action === 'approve'
              ? 'Approval'
              : 'Review';
      two(
        [`Level ${stage.level}`, `${stageName} - ${action}`],
        [actionKind, designation ? `${person}, ${designation}` : person],
      );
      two(
        ['Date', stage.acted_at ? fmt.dateTime(stage.acted_at) : 'Pending'],
        ['Remarks', stage.comments?.trim() || 'None recorded'],
      );
      one('Signature', signatureText(stage));
      if (stage.delegated_for_name) supplementary = true;
    };
    const summaryOf = (items: LeavePdfApprovalItem[]) => {
      const count = (s: string) => items.filter((i) => i.status === s).length;
      const parts = [
        `${count('approved')} approved`,
        count('rejected') ? `${count('rejected')} rejected` : null,
        count('returned') ? `${count('returned')} returned` : null,
        `${count('pending')} pending`,
      ].filter(Boolean);
      return `${items.length} stages: ${parts.join(', ')}`;
    };
    const current = stages.find((stage) => stage.status === 'pending');
    const gNeed = HEADING + STAGE;

    section('F. Department Recommendation');
    if (!otherStages.length) {
      one(
        'Recommendation',
        stages.length
          ? 'No departmental stage in this workflow'
          : 'No approval stages recorded',
      );
    } else {
      const room = contentLimit - y - gNeed - 3;
      if (otherStages.length * STAGE <= room) {
        otherStages.forEach(renderStage);
      } else {
        supplementary = true;
        one(
          'Workflow',
          `${summaryOf(stages)}${current ? `; now at level ${current.level}` : ''}`,
        );
        const fit = Math.max(0, Math.floor((room - ROW) / STAGE));
        if (fit > 0)
          otherStages.slice(otherStages.length - fit).forEach(renderStage);
      }
    }
    y += 3;

    section('G. For HR / Personnel Department Use');
    if (hrStages.length) {
      const fit = Math.max(1, Math.floor((contentLimit - y) / STAGE));
      if (hrStages.length > fit) supplementary = true;
      hrStages.slice(Math.max(0, hrStages.length - fit)).forEach(renderStage);
    } else {
      // No HR stage in this workflow: keep the block for manual HR use.
      two(
        ['HR verification', 'Not in this workflow'],
        ['Verified by', '________________'],
      );
      two(['Date', '____________'], ['Signature', '________________']);
      one('Remarks', '________________________________________');
    }

    // H. Final authorization, in the band beside the QR code.
    const hWidth = width - qrSize - 18;
    const hHalf = hWidth / 2;
    y = Math.max(y + 4, qrY - 8);
    put('H. FINAL AUTHORIZATION', left, y, hWidth, {
      bold: true,
      size: 12,
      align: 'center',
    });
    y += 20;
    const isFinal = p.status === 'approved' || p.status === 'rejected';
    const finalStage = stages[stages.length - 1];
    const last =
      p.status === 'approved'
        ? finalStage?.status === 'approved'
          ? finalStage
          : undefined
        : p.status === 'rejected'
          ? [...stages].reverse().find((stage) => stage.status === 'rejected')
          : undefined;
    const finalDecision =
      p.status === 'approved'
        ? 'APPROVED'
        : p.status === 'rejected'
          ? 'REJECTED'
          : p.status === 'cancelled'
            ? 'CANCELLED'
            : 'PENDING';
    const hRow = (a: [string, string], b: [string, string]) => {
      doc
        .save()
        .rect(left, y - 2, hWidth, ROW)
        .lineWidth(0.45)
        .strokeColor('#000000')
        .stroke()
        .restore();
      line(left + hHalf, y - 2, left + hHalf, y - 2 + ROW, 0.45);
      field(a[0], a[1], left + 5, y, hHalf - 13);
      field(b[0], b[1], left + hHalf + 5, y, hHalf - 13);
      y += ROW;
    };
    hRow(
      ['Final decision', finalDecision],
      [
        'Approving authority',
        isFinal ? last?.approver_name || NOT_RECORDED : 'Pending',
      ],
    );
    hRow(
      [
        'Date',
        isFinal
          ? last?.acted_at
            ? fmt.dateTime(last.acted_at)
            : NOT_RECORDED
          : 'Pending',
      ],
      [
        'Signature',
        !isFinal || !last
          ? 'Pending'
          : last.signature?.valid
            ? `E-signed, ${last.signature.reference}`
            : 'Not available',
      ],
    );
    if (p.verification_url) {
      const qr = await QRCode.toBuffer(p.verification_url, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 360,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      doc.image(qr, right - qrSize, qrY, { width: qrSize, height: qrSize });
      put('Scan to Verify', right - qrSize - 8, qrY + qrSize + 2, qrSize + 16, {
        bold: true,
        align: 'center',
      });
    }
    if (supplementary)
      put(
        'Additional details and approval history are available in HRMS.',
        left,
        y + 4,
        hWidth,
        { size: 9 },
      );
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
    const top = PAGE.margin - 6;
    doc.rect(0, 0, doc.page.width, 6).fill(C.navy);

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

  private drawContinuationHeader(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
  ): void {
    const { left, width } = this.frame(doc);
    doc.rect(0, 0, doc.page.width, 6).fill(C.navy);
    const y = PAGE.margin - 8;
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(C.navy)
      .text(
        `${p.company_name.toUpperCase()}  —  LEAVE APPLICATION FORM (continued)`,
        left,
        y,
        { width: width - 150, lineBreak: false, ellipsis: true },
      );
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(C.muted)
      .text(`Reference ${p.leave_no}`, left + width - 150, y, {
        width: 150,
        align: 'right',
        lineBreak: false,
      });
    doc
      .moveTo(left, y + 13)
      .lineTo(left + width, y + 13)
      .lineWidth(0.6)
      .strokeColor(C.border)
      .stroke();
    doc.x = left;
    doc.y = y + 22;
  }

  /** One slim line for anything that is not a completed approval. */
  private drawStatusNotice(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    status: StatusInfo,
    fmt: Formatters,
  ): void {
    let text: string | null = null;
    switch (p.status) {
      case 'approved':
        return;
      case 'rejected':
        text = `REJECTED — this application was not approved and does not authorise any absence.${
          p.rejection_reason?.trim()
            ? ` Reason: ${p.rejection_reason.trim()}`
            : ''
        }`;
        break;
      case 'cancelled':
        text = `CANCELLED${
          p.cancelled_at ? ` on ${fmt.dateTime(p.cancelled_at)}` : ''
        } — retained for record purposes only; it does not authorise any absence.`;
        break;
      case 'returned_for_correction':
        text = `RETURNED FOR CORRECTION${
          p.returned_at ? ` on ${fmt.dateTime(p.returned_at)}` : ''
        } — not approved.${
          p.return_reason?.trim() ? ` Note: ${p.return_reason.trim()}` : ''
        }`;
        break;
      case 'draft':
        text =
          'DRAFT — this application has not been submitted and is not approved.';
        break;
      default:
        text = `${status.label.toUpperCase()}${
          status.detail ? ` — ${status.detail}` : ''
        }. Not authorised leave until final approval is recorded.`;
    }
    const { left, width } = this.frame(doc);
    doc.font('Helvetica-Bold').fontSize(8);
    const h = doc.heightOfString(text, { width: width - 20 }) + 9;
    const y = doc.y;
    doc.rect(left, y, width, h).fill(status.tone.bg);
    doc.rect(left, y, 3, h).fill(status.tone.border);
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(status.tone.fg)
      .text(text, left + 10, y + 5, { width: width - 20 });
    doc.x = left;
    doc.y = y + h + 8;
  }

  // -------------------------------------------------------------------------
  // Sections
  // -------------------------------------------------------------------------

  private drawEmployee(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): void {
    this.section(doc, 'A. Employee Information', [
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
      ],
    ]);
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
      [{ label: 'Reason for leave', value: p.reason?.trim() || NOT_RECORDED }],
    ];

    const prior = this.priorApprovalText(p);
    if (prior) rows.push([{ label: 'Prior sanction', value: prior }]);

    this.section(doc, 'B. Leave Application Details', rows);
  }

  private drawMedical(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): void {
    const m = p.medical;
    if (!m) return;
    const d = (v: string | null) => (v ? fmt.date(v) : NOT_RECORDED);
    this.section(
      doc,
      'C. Medical Leave Information',
      [
        [{ label: 'Nature of sickness', value: this.orNot(m.sickness_nature) }],
        [
          { label: 'Attending doctor', value: this.orNot(m.doctor_name) },
          {
            label: 'Doctor / facility tel.',
            value: this.orNot(m.doctor_phone),
          },
        ],
        [
          {
            label: 'Hospital / medical facility',
            value: this.orNot(m.hospital_name),
          },
        ],
        [
          { label: 'Treatment from', value: d(m.treatment_start_date) },
          { label: 'Treatment to', value: d(m.treatment_end_date) },
        ],
      ],
      'Confidential medical information.',
    );
  }

  private drawBalance(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
    generatedAt: Date,
  ): void {
    const title = 'D. Leave Balance Summary';
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

    const n = (v?: string | null) => this.trimNumber(v ?? '0');
    const nonZero = (v?: string | null) => !!v && Number(v) !== 0;
    const lines: { label: string; value: string; strong?: boolean }[] = [
      {
        label: 'Annual / applicable leave entitlement',
        value: n(b.entitlement_days),
      },
    ];
    if (
      nonZero(b.accrued_days) &&
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
            value: n(b.before_days),
          },
          { label: 'Days requested (this application)', value: requested },
          {
            label: 'Balance after this request',
            value: n(b.after_days),
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
            value: n(b.before_days),
          },
          { label: 'Days requested (this application)', value: requested },
          {
            label: 'Projected balance if approved',
            value: n(b.after_days),
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
    const rowH = 14;
    const bodyRows = half;
    this.sectionHeading(doc, title, rowH * (bodyRows + 1 + strong.length) + 20);
    const { left, width } = this.frame(doc);
    const colW = width / 2;
    const valueW = 52;
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
        .text(label, x + 6, cy + (opts.header ? 4.5 : 3.6), {
          width: w - valueW - 12,
          lineBreak: false,
          ellipsis: true,
        })
        .text(value, x + w - valueW, cy + (opts.header ? 4.5 : 3.6), {
          width: valueW - 7,
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
    for (let r = 0; r < bodyRows; r++) {
      columns.forEach((col, c) => {
        const line = col[r];
        if (line) cell(left + c * colW, y, colW, line.label, line.value);
        else this.box(doc, left + c * colW, y, colW, rowH);
      });
      y += rowH;
    }
    strong.forEach((line) => {
      cell(left, y, width, line.label, line.value, { strong: true });
      y += rowH;
    });
    doc.y = y + 2;
    this.note(doc, note);
  }

  private drawDeclaration(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): void {
    const statement =
      'I hereby confirm that the information provided in this leave application is accurate and complete to the best of my knowledge. I understand that this application is subject to the company’s leave policies and approval procedures.';
    const { width } = this.frame(doc);
    doc.font('Helvetica-Oblique').fontSize(8.5);
    const sh = doc.heightOfString(statement, { width: width - 12 });
    this.sectionHeading(doc, 'E. Employee Declaration', sh + 60);
    const { left } = this.frame(doc);
    doc
      .font('Helvetica-Oblique')
      .fontSize(8.5)
      .fillColor(C.text)
      .text(statement, left + 6, doc.y + 1, { width: width - 12 });
    doc.y += 5;
    doc.x = left;
    this.grid(doc, [
      [
        { label: 'Applicant name', value: p.employee_name },
        {
          label: 'Application date',
          value: p.applied_at
            ? fmt.dateTime(p.applied_at)
            : 'Not yet submitted',
        },
      ],
      [
        {
          label: 'Employee signature',
          value: 'PENDING EMPLOYEE SIGNATURE',
        },
        { label: 'Submission reference', value: p.leave_no },
      ],
    ]);
  }

  private drawApprovals(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): void {
    const title = 'F. Departmental Recommendation & Approval';
    const items = p.approval_history;
    if (!items.length) {
      this.section(doc, title, [
        [
          {
            label: 'Workflow',
            value:
              p.status === 'draft'
                ? 'Not yet submitted for approval.'
                : 'No approval stages have been recorded for this application.',
          },
        ],
      ]);
      return;
    }

    const { left, width } = this.frame(doc);
    const cols = [
      { key: 'level', title: 'LEVEL', w: 34 },
      { key: 'stage', title: 'STAGE', w: 96 },
      { key: 'who', title: 'APPROVER', w: 122 },
      { key: 'decision', title: 'DECISION', w: 62 },
      { key: 'when', title: 'DATE & TIME', w: 68 },
      { key: 'remarks', title: 'COMMENTS / RECOMMENDATION', w: 0 },
    ];
    cols[cols.length - 1].w =
      width - cols.slice(0, -1).reduce((s, c) => s + c.w, 0);
    const pad = 5;

    const rows = items.map((item) => {
      const who = item.approver_name
        ? [
            item.approver_name,
            item.approver_designation,
            item.delegated_for_name
              ? `Acting for ${item.delegated_for_name}`
              : null,
          ]
            .filter(Boolean)
            .join('\n')
        : item.status === 'pending'
          ? 'Awaiting assigned approver'
          : item.status === 'skipped'
            ? 'Not required'
            : 'System';
      return {
        tone: this.approvalTone(item.status),
        cells: {
          level: String(item.level),
          stage: [
            item.step_label?.trim() || `Level ${item.level}`,
            this.titleCase(item.action || 'review'),
          ].join('\n'),
          who,
          decision: this.approvalLabel(item.status),
          when: item.acted_at ? fmt.dateTime(item.acted_at) : '—',
          remarks: item.comments?.trim() || '—',
        } as Record<string, string>,
      };
    });

    const headerH = 15;
    const measure = (cells: Record<string, string>) => {
      doc.font('Helvetica').fontSize(8);
      return (
        Math.max(
          ...cols.map((c) =>
            doc.heightOfString(cells[c.key], { width: c.w - pad * 2 }),
          ),
        ) +
        pad * 2
      );
    };
    const drawHeaderRow = () => {
      const y = doc.y;
      doc.rect(left, y, width, headerH).fill(C.navySoft);
      let x = left;
      cols.forEach((c) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(6.8)
          .fillColor(C.navy)
          .text(c.title, x + pad, y + 4.5, {
            width: c.w - pad * 2,
            lineBreak: false,
          });
        x += c.w;
      });
      this.box(doc, left, y, width, headerH);
      doc.y = y + headerH;
    };

    this.sectionHeading(doc, title, headerH + measure(rows[0].cells) + 4);
    drawHeaderRow();
    rows.forEach((row) => {
      const h = measure(row.cells);
      if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        drawHeaderRow();
      }
      const y = doc.y;
      let x = left;
      cols.forEach((c) => {
        const isDecision = c.key === 'decision';
        doc
          .font(
            isDecision || c.key === 'level' ? 'Helvetica-Bold' : 'Helvetica',
          )
          .fontSize(8)
          .fillColor(isDecision ? row.tone.fg : C.ink)
          .text(row.cells[c.key], x + pad, y + pad, { width: c.w - pad * 2 });
        x += c.w;
        if (x < left + width) {
          doc
            .moveTo(x, y)
            .lineTo(x, y + h)
            .lineWidth(0.5)
            .strokeColor(C.border)
            .stroke();
        }
      });
      this.box(doc, left, y, width, h);
      doc.x = left;
      doc.y = y + h;
    });
    doc.y += 8;
  }

  /** Section G (left) with the verification QR code beside it (right). */
  private async drawHrUseAndQr(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): Promise<void> {
    const items = p.approval_history.filter((a) => a.status !== 'skipped');
    const hrStage = items.find((a) => this.isHrStage(a));
    const finalStage = items.length ? items[items.length - 1] : null;
    const b = p.current_balance;

    const hrStatus = hrStage
      ? `${this.approvalLabel(hrStage.status)}${
          hrStage.acted_at ? ` · ${fmt.dateTime(hrStage.acted_at)}` : ''
        }`
      : 'No HR stage in this workflow';
    const hrOfficer = hrStage
      ? (hrStage.approver_name ?? 'Awaiting assigned officer')
      : '—';
    const finalAuthority = finalStage
      ? [
          finalStage.step_label?.trim() || `Level ${finalStage.level}`,
          finalStage.approver_name,
        ]
          .filter(Boolean)
          .join(' — ')
      : '—';
    const decisionDate =
      p.status === 'approved' && p.approved_at
        ? fmt.dateTime(p.approved_at)
        : p.status === 'cancelled' && p.cancelled_at
          ? `${fmt.dateTime(p.cancelled_at)} (cancelled)`
          : p.status === 'rejected'
            ? (() => {
                const r = items.find((a) => a.status === 'rejected');
                return r?.acted_at
                  ? `${fmt.dateTime(r.acted_at)} (rejected)`
                  : 'Rejected';
              })()
            : 'Pending final decision';
    const balanceCheck = b
      ? b.mode === 'reserved' || b.mode === 'projected'
        ? `${this.trimNumber(b.before_days ?? b.available_days)} available − ${this.trimNumber(p.total_days)} requested = ${this.trimNumber(b.after_days ?? b.available_days)} days`
        : `${this.trimNumber(b.available_days)} days available (see section D)`
      : 'Unavailable — see section D';

    const rows: Row[] = [
      [
        {
          label: 'Date of joining',
          value: p.hire_date ? fmt.date(p.hire_date) : NOT_RECORDED,
        },
        {
          label: 'Leave year',
          value: b ? `FY ${b.fiscal_year}` : NOT_RECORDED,
        },
      ],
      [{ label: 'Balance check', value: balanceCheck }],
      [
        { label: 'HR verification', value: hrStatus },
        { label: 'HR officer / reviewer', value: hrOfficer },
      ],
      [
        { label: 'Final approval authority', value: finalAuthority },
        { label: 'Final decision date', value: decisionDate },
      ],
    ];

    const { left, width } = this.frame(doc);
    const qrBlockW = QR_SIZE + 24;
    const gridW = width - qrBlockW - 10;
    const gridH = this.measureGrid(doc, rows, gridW);
    const qrBlockH = QR_SIZE + 34;
    this.sectionHeading(
      doc,
      'G. For HR / Personnel Department Use',
      Math.max(gridH, qrBlockH) + 4,
    );
    const top = doc.y;
    this.grid(doc, rows, { x: left, width: gridW });
    const gridBottom = doc.y;

    // QR code — the verification link lives only inside the code.
    const qx = left + width - qrBlockW;
    if (p.verification_url) {
      const qr = await QRCode.toBuffer(p.verification_url, {
        errorCorrectionLevel: 'M',
        margin: 2, // quiet zone (modules), plus the white padding below
        width: 360,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      doc.rect(qx, top, qrBlockW, qrBlockH).fill(C.white);
      this.box(doc, qx, top, qrBlockW, qrBlockH);
      doc.image(qr, qx + 12, top + 6, { width: QR_SIZE, height: QR_SIZE });
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(C.navy)
        .text('Scan to Verify', qx, top + QR_SIZE + 9, {
          width: qrBlockW,
          align: 'center',
          lineBreak: false,
        });
      doc
        .font('Helvetica')
        .fontSize(6.3)
        .fillColor(C.muted)
        .text('Official HRMS Leave Application', qx, top + QR_SIZE + 21, {
          width: qrBlockW,
          align: 'center',
          lineBreak: false,
        });
    }
    doc.x = left;
    doc.y = Math.max(gridBottom, top + qrBlockH) + 6;
  }

  private drawFooters(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
    generatedAt: Date,
  ): void {
    const range = doc.bufferedPageRange();
    const left = PAGE.margin;
    const width = doc.page.width - PAGE.margin * 2;
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Footer sits inside the bottom margin; lift the margin temporarily so
      // pdfkit does not auto-add a page while writing it.
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - PAGE.margin - 14;
      doc
        .moveTo(left, y - 7)
        .lineTo(left + width, y - 7)
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
          `Page ${i - range.start + 1} of ${range.count}`,
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

  /** Heading kept together with at least `keepWith` points of content. */
  private sectionHeading(
    doc: PDFKit.PDFDocument,
    title: string,
    keepWith: number,
  ): void {
    const h = 16;
    this.ensureSpace(doc, h + Math.min(keepWith, 300));
    const { left, width } = this.frame(doc);
    const y = doc.y;
    doc.rect(left, y, width, h).fill(C.navy);
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(C.white)
      .text(title.toUpperCase(), left + 7, y + 4.5, {
        width: width - 14,
        characterSpacing: 0.6,
        lineBreak: false,
      });
    doc.x = left;
    doc.y = y + h;
  }

  private section(
    doc: PDFKit.PDFDocument,
    title: string,
    rows: Row[],
    note?: string,
  ): void {
    const { width } = this.frame(doc);
    const first = rows.length
      ? this.measureGrid(doc, rows.slice(0, 2), width)
      : 0;
    this.sectionHeading(doc, title, first);
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
    doc.y += 8;
  }

  private gridLayout(width: number) {
    const labelW = 100;
    const half = width / 2;
    return { labelW, half };
  }

  private rowHeight(doc: PDFKit.PDFDocument, row: Row, width: number): number {
    const { labelW, half } = this.gridLayout(width);
    const cellW = row.length === 1 ? width : half;
    return (
      Math.max(
        ...row.map((cell) => {
          doc.font('Helvetica-Bold').fontSize(7.3);
          const lh = doc.heightOfString(cell.label, { width: labelW - 10 });
          doc
            .font(cell.strong ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(cell.strong ? 9 : 8.5);
          const vh = doc.heightOfString(cell.value, {
            width: cellW - labelW - 12,
          });
          return Math.max(lh, vh);
        }),
      ) + 9
    );
  }

  private measureGrid(doc: PDFKit.PDFDocument, rows: Row[], width: number) {
    return rows.reduce((s, r) => s + this.rowHeight(doc, r, width), 0);
  }

  /** Bordered label/value form grid; rows never split across pages. */
  private grid(
    doc: PDFKit.PDFDocument,
    rows: Row[],
    opts?: { x: number; width: number },
  ): void {
    const frame = this.frame(doc);
    const left = opts?.x ?? frame.left;
    const width = opts?.width ?? frame.width;
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
          .fontSize(7.3)
          .fillColor(C.text)
          .text(cell.label, x + 5, y + 5, { width: labelW - 10 });
        const muted = cell.value === NOT_RECORDED;
        doc
          .font(
            cell.strong
              ? 'Helvetica-Bold'
              : muted
                ? 'Helvetica-Oblique'
                : 'Helvetica',
          )
          .fontSize(cell.strong ? 9 : 8.5)
          .fillColor(muted ? C.muted : C.ink)
          .text(cell.value, x + labelW + 6, y + 4.5, {
            width: cellW - labelW - 12,
          });
        this.box(doc, x, y, cellW, h);
        doc
          .moveTo(x + labelW, y)
          .lineTo(x + labelW, y + h)
          .lineWidth(0.5)
          .strokeColor(C.border)
          .stroke();
      });
      doc.x = left;
      doc.y = y + h;
    });
    doc.y += 8;
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
      return `Notice period overridden — ${p.notice_override_reason.trim()}`;
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
