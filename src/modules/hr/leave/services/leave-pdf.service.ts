import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

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
  comments: string | null;
  acted_at: Date | null;
  signature_url: string | null;
};

export type LeavePdfPayload = {
  company_name: string;
  company_logo?: Buffer | null;
  company_address?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  company_website?: string | null;
  /** IANA timezone used to print dates/times. */
  timezone?: string | null;

  leave_no: string;
  employee_no: string;
  employee_name: string;
  department_name?: string | null;
  position_name?: string | null;
  branch_name?: string | null;
  reporting_manager_name?: string | null;

  leave_type_name: string;
  is_paid?: boolean | null;
  start_date: string;
  end_date: string;
  total_days: string;
  duration_type?: string | null;
  half_day_session?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  reason: string;
  status: string;
  current_approval_level?: number | null;
  applied_at?: Date | null;
  approved_at?: Date | null;
  cancelled_at?: Date | null;
  rejection_reason?: string | null;
  returned_at?: Date | null;
  return_reason?: string | null;

  /**
   * Balance figures for the leave type in the request's fiscal year.
   * `available_days` uses the HRMS rule (pending and approved-future days
   * already deducted). `before_days`/`after_days` are supplied only when the
   * request currently holds a reservation against this single balance.
   */
  current_balance: {
    fiscal_year: string;
    entitlement_days?: string | null;
    opening_balance_days?: string | null;
    used_days: string;
    pending_days: string;
    available_days: string;
    before_days?: string | null;
    after_days?: string | null;
  } | null;

  approval_history: LeavePdfApprovalItem[];
  attachments?: { file_name: string; uploaded_at: Date | null }[];
};

// ---------------------------------------------------------------------------
// Design tokens (chosen to stay distinguishable in grayscale print).
// ---------------------------------------------------------------------------
const C = {
  ink: '#111827',
  text: '#374151',
  muted: '#6B7280',
  faint: '#9CA3AF',
  line: '#E5E7EB',
  panel: '#F9FAFB',
  brand: '#1E3A5F',
  brandSoft: '#E8EEF5',
};

type Tone = { fg: string; bg: string; border: string };
const TONES: Record<string, Tone> = {
  approved: { fg: '#065F46', bg: '#ECFDF5', border: '#10B981' },
  rejected: { fg: '#991B1B', bg: '#FEF2F2', border: '#EF4444' },
  cancelled: { fg: '#374151', bg: '#F3F4F6', border: '#6B7280' },
  pending: { fg: '#92400E', bg: '#FFFBEB', border: '#F59E0B' },
  returned: { fg: '#5B21B6', bg: '#F5F3FF', border: '#8B5CF6' },
  draft: { fg: '#374151', bg: '#F3F4F6', border: '#9CA3AF' },
};

const PAGE = { margin: 40, footer: 46 };

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
        Title: `Leave Request ${payload.leave_no}`,
        Author: payload.company_name,
        Subject: 'Employee Leave Request',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const generatedAt = new Date();
    const fmt = this.formatters(payload.timezone);
    const status = this.describeStatus(payload);
    const verification = this.verificationCode(payload);

    this.drawHeader(doc, payload, status, fmt, generatedAt);
    this.drawSummary(doc, payload, status, fmt);
    this.drawOutcomeNotice(doc, payload, fmt);
    this.drawEmployee(doc, payload);
    this.drawLeaveDetails(doc, payload, fmt);
    this.drawApprovals(doc, payload, fmt);
    this.drawAttachments(doc, payload, fmt);
    await this.drawVerification(doc, payload, verification, generatedAt);
    this.drawFooters(doc, payload, fmt, generatedAt);

    doc.end();
    return finished;
  }

  // -------------------------------------------------------------------------
  // Sections
  // -------------------------------------------------------------------------

  private drawHeader(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    status: StatusInfo,
    fmt: Formatters,
    generatedAt: Date,
  ): void {
    const { left, width } = this.frame(doc);
    const top = PAGE.margin;
    doc.rect(0, 0, doc.page.width, 5).fill(C.brand);

    let textX = left;
    if (p.company_logo) {
      try {
        doc.image(p.company_logo, left, top, { fit: [52, 52] });
        textX = left + 62;
      } catch {
        // Unsupported image formats are skipped rather than failing the PDF.
      }
    }

    const leftColWidth = width * 0.55 - (textX - left);
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(C.ink)
      .text(p.company_name, textX, top + 2, { width: leftColWidth });
    const contact = [p.company_address, p.company_phone, p.company_email]
      .filter(Boolean)
      .join('  ·  ');
    if (contact) {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(C.muted)
        .text(contact, textX, doc.y + 2, { width: leftColWidth });
    }
    const leftBottom = Math.max(doc.y, p.company_logo ? top + 52 : doc.y);

    const rightX = left + width * 0.55;
    const rightW = width * 0.45;
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(C.brand)
      .text('EMPLOYEE LEAVE REQUEST', rightX, top + 2, {
        width: rightW,
        align: 'right',
        characterSpacing: 0.6,
      });
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(C.muted)
      .text(`Reference  ${p.leave_no}`, rightX, doc.y + 4, {
        width: rightW,
        align: 'right',
      });
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(C.muted)
      .text(`Generated  ${fmt.dateTime(generatedAt)}`, rightX, doc.y + 1, {
        width: rightW,
        align: 'right',
      });
    const pillY = doc.y + 5;
    const pillW = this.pillWidth(doc, status.label, 9);
    this.pill(doc, left + width - pillW, pillY, status.label, status.tone, 9);
    const rightBottom = pillY + 18;

    const y = Math.max(leftBottom, rightBottom) + 12;
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .lineWidth(0.8)
      .strokeColor(C.line)
      .stroke();
    doc.x = left;
    doc.y = y + 14;
  }

  /** Key facts band: the four things a reader needs within seconds. */
  private drawSummary(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    status: StatusInfo,
    fmt: Formatters,
  ): void {
    const { left, width } = this.frame(doc);
    const y = doc.y;
    const h = 58;
    doc.roundedRect(left, y, width, h, 6).fill(C.brandSoft);

    const period =
      p.start_date === p.end_date
        ? fmt.date(p.start_date)
        : `${fmt.date(p.start_date)} – ${fmt.date(p.end_date)}`;
    const days = Number(p.total_days);
    const daysLabel = `${this.trimNumber(p.total_days)} ${days === 1 ? 'day' : 'days'}`;

    const cells: { label: string; value: string; sub?: string; w: number }[] = [
      {
        label: 'LEAVE TYPE',
        value: p.leave_type_name,
        sub:
          p.is_paid === undefined || p.is_paid === null
            ? undefined
            : p.is_paid
              ? 'Paid leave'
              : 'Unpaid leave',
        w: 0.26,
      },
      {
        label: 'LEAVE PERIOD',
        value: period,
        sub: this.durationLabel(p) ?? undefined,
        w: 0.34,
      },
      { label: 'TOTAL DAYS', value: daysLabel, w: 0.15 },
      { label: 'STATUS', value: status.short, sub: status.detail, w: 0.25 },
    ];

    let x = left;
    cells.forEach((cell, index) => {
      const cw = width * cell.w;
      const pad = 12;
      if (index > 0) {
        doc
          .moveTo(x, y + 12)
          .lineTo(x, y + h - 12)
          .lineWidth(0.6)
          .strokeColor('#C9D5E3')
          .stroke();
      }
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(C.muted)
        .text(cell.label, x + pad, y + 10, {
          width: cw - pad * 2,
          characterSpacing: 0.5,
        });
      // Shrink long values (e.g. long leave-type names) before truncating.
      let size = 11.5;
      doc.font('Helvetica-Bold');
      while (
        size > 8 &&
        doc.fontSize(size).widthOfString(cell.value) > cw - pad * 2
      ) {
        size -= 0.5;
      }
      doc
        .fontSize(size)
        .fillColor(index === 3 ? status.tone.fg : C.ink)
        .text(cell.value, x + pad, y + 22 + (11.5 - size) / 2, {
          width: cw - pad * 2,
          height: 15,
          ellipsis: true,
          lineBreak: false,
        });
      if (cell.sub) {
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(C.muted)
          .text(cell.sub, x + pad, y + 39, {
            width: cw - pad * 2,
            height: 10,
            ellipsis: true,
            lineBreak: false,
          });
      }
      x += cw;
    });

    doc.x = left;
    doc.y = y + h + 14;
  }

  /** Prominent notice for terminal / exceptional outcomes. */
  private drawOutcomeNotice(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): void {
    let tone: Tone | null = null;
    let title = '';
    let body: string | null = null;
    const s = p.status;
    if (s === 'rejected') {
      tone = TONES.rejected;
      title = 'This leave request was rejected';
      body = p.rejection_reason?.trim() || null;
    } else if (s === 'cancelled') {
      tone = TONES.cancelled;
      title = p.cancelled_at
        ? `This leave request was cancelled on ${fmt.dateTime(p.cancelled_at)}`
        : 'This leave request was cancelled';
      body =
        'This document is retained for record purposes only and does not authorise any absence.';
    } else if (s === 'returned_for_correction') {
      tone = TONES.returned;
      title = p.returned_at
        ? `Returned to the employee for correction on ${fmt.dateTime(p.returned_at)}`
        : 'Returned to the employee for correction';
      body = p.return_reason?.trim() || null;
    } else if (s !== 'approved') {
      tone = TONES.pending;
      title = 'Awaiting approval — not yet authorised';
      body =
        'This request has not completed its approval workflow and must not be treated as approved leave.';
    }
    if (!tone) return;

    const { left, width } = this.frame(doc);
    const pad = 12;
    const innerW = width - pad * 2 - 4;
    doc.font('Helvetica-Bold').fontSize(9.5);
    const titleH = doc.heightOfString(title, { width: innerW });
    doc.font('Helvetica').fontSize(8.5);
    const bodyH = body ? doc.heightOfString(body, { width: innerW }) + 3 : 0;
    const h = pad + titleH + bodyH + pad - 2;
    this.ensureSpace(doc, h + 10);
    const y = doc.y;

    doc.rect(left, y, width, h).fill(tone.bg);
    doc.rect(left, y, 4, h).fill(tone.border);
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(tone.fg)
      .text(title, left + pad + 4, y + pad - 1, { width: innerW });
    if (body) {
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(C.text)
        .text(body, left + pad + 4, doc.y + 3, { width: innerW });
    }
    doc.x = left;
    doc.y = y + h + 16;
  }

  private drawEmployee(doc: PDFKit.PDFDocument, p: LeavePdfPayload): void {
    this.sectionTitle(doc, 'Employee Information');
    this.fieldGrid(doc, [
      ['Full name', p.employee_name],
      ['Employee number', p.employee_no],
      ['Department', p.department_name],
      ['Designation', p.position_name],
      ['Branch / location', p.branch_name],
      ['Reporting manager', p.reporting_manager_name],
    ]);
  }

  private drawLeaveDetails(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): void {
    this.sectionTitle(doc, 'Leave Request Details');
    this.fieldGrid(doc, [
      ['Date of application', p.applied_at ? fmt.dateTime(p.applied_at) : null],
      [
        'Final approval',
        p.status === 'approved' && p.approved_at
          ? fmt.dateTime(p.approved_at)
          : null,
      ],
    ]);

    // Reason — full-width block, wraps and paginates naturally.
    const { left, width } = this.frame(doc);
    const reason = p.reason?.trim() || '—';
    doc.font('Helvetica').fontSize(9);
    const textH = doc.heightOfString(reason, { width: width - 24 });
    const fitsOnPage =
      doc.y + 14 + textH + 20 < doc.page.height - doc.page.margins.bottom;
    this.ensureSpace(doc, 14 + Math.min(textH, 120) + 20);
    this.label(doc, 'Reason for leave', left, doc.y);
    const boxY = doc.y + 3;
    if (fitsOnPage) {
      doc.rect(left, boxY, width, textH + 16).fill(C.panel);
      doc.rect(left, boxY, 2, textH + 16).fill(C.line);
    }
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(C.ink)
      .text(reason, left + 12, boxY + 8, { width: width - 24 });
    doc.x = left;
    doc.y += 18;

    this.drawBalance(doc, p);
  }

  private drawBalance(doc: PDFKit.PDFDocument, p: LeavePdfPayload): void {
    const b = p.current_balance;
    if (!b) return;
    const { left, width } = this.frame(doc);

    const cols: { label: string; value: string; strong?: boolean }[] = [];
    const push = (label: string, value?: string | null, strong = false) => {
      if (value === undefined || value === null || value === '') return;
      cols.push({ label, value: this.trimNumber(value), strong });
    };
    push('Entitlement', b.entitlement_days);
    push('Opening', b.opening_balance_days);
    push('Used', b.used_days);
    push('Pending', b.pending_days);
    if (b.before_days && b.after_days) {
      push('Before request', b.before_days);
      push('After request', b.after_days, true);
    } else {
      push('Available now', b.available_days, true);
    }

    this.ensureSpace(doc, 64);
    this.label(
      doc,
      `Leave balance · ${p.leave_type_name} · FY ${b.fiscal_year}`,
      left,
      doc.y,
    );
    const y = doc.y + 4;
    const h = 38;
    doc
      .roundedRect(left, y, width, h, 4)
      .lineWidth(0.7)
      .strokeColor(C.line)
      .stroke();
    const cw = width / cols.length;
    cols.forEach((col, i) => {
      const x = left + i * cw;
      if (col.strong)
        doc.rect(x + 0.5, y + 0.5, cw - 1, h - 1).fill(C.brandSoft);
      if (i > 0) {
        doc
          .moveTo(x, y)
          .lineTo(x, y + h)
          .lineWidth(0.7)
          .strokeColor(C.line)
          .stroke();
      }
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(C.muted)
        .text(col.label.toUpperCase(), x, y + 7, {
          width: cw,
          align: 'center',
          characterSpacing: 0.3,
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(col.strong ? C.brand : C.ink)
        .text(col.value, x, y + 19, { width: cw, align: 'center' });
    });
    doc.x = left;
    doc.y = y + h + 18;
  }

  private drawApprovals(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): void {
    this.sectionTitle(doc, 'Approval Workflow');
    const { left, width } = this.frame(doc);

    if (!p.approval_history.length) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor(C.muted)
        .text(
          p.status === 'draft'
            ? 'The request has not been submitted for approval.'
            : 'No approval steps have been recorded for this request.',
          left,
          doc.y,
        );
      doc.moveDown(1.2);
      return;
    }

    const items = p.approval_history;
    const railX = left + 11;
    const bodyX = left + 32;
    const bodyW = width - 32;
    const chipCol = 96;

    items.forEach((item, index) => {
      const tone = this.approvalTone(item.status);
      const title = item.step_label?.trim()
        ? `Level ${item.level} · ${item.step_label.trim()}`
        : `Level ${item.level}`;
      const actionLabel = this.titleCase(item.action);
      const who = item.approver_name
        ? [item.approver_name, item.approver_designation]
            .filter(Boolean)
            .join(' — ')
        : item.status === 'pending'
          ? 'Awaiting assigned approver'
          : item.status === 'skipped'
            ? 'Not required for this request'
            : 'System';
      const when = item.acted_at ? fmt.dateTime(item.acted_at) : null;
      const comment = item.comments?.trim() || null;

      // Measure the block so it never splits across pages.
      doc.font('Helvetica-Bold').fontSize(9.5);
      let h = doc.heightOfString(title, { width: bodyW - chipCol }) + 2;
      doc.font('Helvetica').fontSize(8.5);
      h += doc.heightOfString(who, { width: bodyW - chipCol }) + 2;
      if (comment) {
        h += doc.heightOfString(`“${comment}”`, { width: bodyW - 16 }) + 14;
      }
      h += 14;
      this.ensureSpace(doc, Math.min(h, 400));
      const y = doc.y;

      // Timeline rail + node (shape varies by status for grayscale print).
      if (index < items.length - 1) {
        doc
          .moveTo(railX, y + 22)
          .lineTo(railX, y + h + 2)
          .lineWidth(1)
          .strokeColor(C.line)
          .stroke();
      }
      this.statusNode(doc, railX, y + 10, item.status, tone, item.level);

      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(C.ink)
        .text(title, bodyX, y + 2, { width: bodyW - chipCol });
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(C.text)
        .text(who, bodyX, doc.y + 2, { width: bodyW - chipCol });

      // Right column: status chip + action + timestamp.
      const chipLabel = this.approvalLabel(item.status);
      const chipW = this.pillWidth(doc, chipLabel, 7.5);
      this.pill(doc, left + width - chipW, y + 1, chipLabel, tone, 7.5);
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(C.muted)
        .text(
          when ? `${actionLabel} · ${when}` : actionLabel,
          left + width - chipCol - 30,
          y + 19,
          { width: chipCol + 30, align: 'right' },
        );

      let cursor = Math.max(doc.y, y + 30);
      if (comment) {
        doc.font('Helvetica-Oblique').fontSize(8.5);
        const ch = doc.heightOfString(`“${comment}”`, { width: bodyW - 16 });
        doc.rect(bodyX, cursor + 4, bodyW, ch + 10).fill(C.panel);
        doc.rect(bodyX, cursor + 4, 2, ch + 10).fill(tone.border);
        doc
          .font('Helvetica-Oblique')
          .fontSize(8.5)
          .fillColor(C.text)
          .text(`“${comment}”`, bodyX + 10, cursor + 9, { width: bodyW - 16 });
        cursor = doc.y + 6;
      }
      doc.x = left;
      doc.y = cursor + 12;
    });
    doc.y += 4;
  }

  private drawAttachments(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    fmt: Formatters,
  ): void {
    const files = p.attachments ?? [];
    if (!files.length) return;
    this.sectionTitle(doc, 'Supporting Documents');
    const { left, width } = this.frame(doc);
    files.forEach((file, i) => {
      this.ensureSpace(doc, 16);
      const y = doc.y;
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(C.ink)
        .text(`${i + 1}.  ${file.file_name}`, left, y, {
          width: width - 140,
          ellipsis: true,
          height: 12,
        });
      if (file.uploaded_at) {
        doc
          .fillColor(C.muted)
          .text(
            `Uploaded ${fmt.dateTime(file.uploaded_at)}`,
            left + width - 140,
            y,
            {
              width: 140,
              align: 'right',
            },
          );
      }
      doc.x = left;
      doc.y = y + 14;
    });
    doc.y += 8;
  }

  private async drawVerification(
    doc: PDFKit.PDFDocument,
    p: LeavePdfPayload,
    code: string,
    generatedAt: Date,
  ): Promise<void> {
    const qrValue = JSON.stringify({
      leave_no: p.leave_no,
      employee_no: p.employee_no,
      status: p.status,
      verification: code,
      generated_at: generatedAt.toISOString(),
    });
    const qrBuffer = await QRCode.toBuffer(qrValue, { margin: 0, width: 160 });

    const { left, width } = this.frame(doc);
    const h = 64;
    this.ensureSpace(doc, h + 8);
    const y = doc.y;
    doc
      .roundedRect(left, y, width, h, 5)
      .lineWidth(0.7)
      .strokeColor(C.line)
      .stroke();
    doc.image(qrBuffer, left + 9, y + 8, { width: 48, height: 48 });

    const tx = left + 70;
    const tw = width - 82;
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(C.ink)
      .text('Document verification', tx, y + 11, { width: tw });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(C.text)
      .text('Verification code  ', tx, doc.y + 3, {
        width: tw,
        continued: true,
      })
      .font('Courier-Bold')
      .fillColor(C.ink)
      .text(code);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text(
        `Scan the QR code or quote reference ${p.leave_no} with this code to HR to confirm authenticity. ` +
          'The status shown reflects the HRMS record at the time of generation; any later change in the system supersedes this copy.',
        tx,
        doc.y + 4,
        { width: tw },
      );
    doc.x = left;
    doc.y = y + h + 6;
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
    const contact = [p.company_phone, p.company_email, p.company_website]
      .filter(Boolean)
      .join('  ·  ');
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Footer sits inside the bottom margin; lift the margin temporarily so
      // pdfkit does not auto-add a page while writing it.
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - PAGE.margin - 18;
      doc
        .moveTo(left, y - 8)
        .lineTo(left + width, y - 8)
        .lineWidth(0.6)
        .strokeColor(C.line)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(C.text)
        .text(p.company_name, left, y, {
          width: width * 0.6,
          lineBreak: false,
          ellipsis: true,
        });
      if (contact) {
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor(C.muted)
          .text(contact, left, y + 10, {
            width: width * 0.6,
            lineBreak: false,
            ellipsis: true,
          });
      }
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(C.muted)
        .text(
          `${p.leave_no}  ·  Generated ${fmt.dateTime(generatedAt)}`,
          left + width * 0.4,
          y,
          { width: width * 0.6, align: 'right', lineBreak: false },
        )
        .text(
          `Page ${i - range.start + 1} of ${range.count}`,
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
      doc.y = doc.page.margins.top;
    }
  }

  private sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
    this.ensureSpace(doc, 48);
    const { left, width } = this.frame(doc);
    const y = doc.y;
    doc.rect(left, y + 1, 3, 10).fill(C.brand);
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(C.brand)
      .text(title.toUpperCase(), left + 10, y + 1.5, {
        width: width - 10,
        characterSpacing: 0.8,
      });
    doc.x = left;
    doc.y = y + 20;
  }

  private label(
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
  ): void {
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text(text, x, y, { characterSpacing: 0.2 });
  }

  /** Two-column label/value grid; rows with empty values are omitted. */
  private fieldGrid(
    doc: PDFKit.PDFDocument,
    fields: [string, string | null | undefined][],
  ): void {
    const present = fields.filter(
      ([, v]) => v !== null && v !== undefined && `${v}`.trim() !== '',
    );
    const { left, width } = this.frame(doc);
    const gap = 20;
    const colW = (width - gap) / 2;
    for (let i = 0; i < present.length; i += 2) {
      const pair = present.slice(i, i + 2);
      doc.font('Helvetica-Bold').fontSize(9.5);
      const rowH =
        Math.max(
          ...pair.map(([, v]) =>
            doc.heightOfString(String(v), { width: colW }),
          ),
        ) + 12;
      this.ensureSpace(doc, rowH + 6);
      const y = doc.y;
      pair.forEach(([label, value], j) => {
        const x = left + j * (colW + gap);
        this.label(doc, label, x, y);
        doc
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .fillColor(C.ink)
          .text(String(value), x, y + 11, { width: colW });
      });
      doc.x = left;
      doc.y = y + rowH + 5;
    }
    doc.y += 6;
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
    const h = size + 8;
    doc.roundedRect(x, y, w, h, h / 2).fillAndStroke(tone.bg, tone.border);
    doc
      .font('Helvetica-Bold')
      .fontSize(size)
      .fillColor(tone.fg)
      .text(text.toUpperCase(), x, y + 4.5, {
        width: w,
        align: 'center',
        characterSpacing: 0.5,
        lineBreak: false,
      });
  }

  /**
   * Timeline node. Shapes differ by outcome so they remain distinguishable
   * without colour: filled = approved, ring = pending, cross = rejected,
   * dashed = skipped, arrow = returned.
   */
  private statusNode(
    doc: PDFKit.PDFDocument,
    cx: number,
    cy: number,
    status: string,
    tone: Tone,
    level: number,
  ): void {
    const r = 9;
    if (status === 'approved') {
      doc.circle(cx, cy, r).fill(tone.border);
      doc
        .moveTo(cx - 4, cy)
        .lineTo(cx - 1, cy + 3.2)
        .lineTo(cx + 4.5, cy - 3.5)
        .lineWidth(1.6)
        .strokeColor('#FFFFFF')
        .stroke();
    } else if (status === 'rejected') {
      doc.circle(cx, cy, r).fill(tone.border);
      doc
        .moveTo(cx - 3.5, cy - 3.5)
        .lineTo(cx + 3.5, cy + 3.5)
        .moveTo(cx + 3.5, cy - 3.5)
        .lineTo(cx - 3.5, cy + 3.5)
        .lineWidth(1.6)
        .strokeColor('#FFFFFF')
        .stroke();
    } else if (status === 'skipped') {
      doc
        .circle(cx, cy, r)
        .dash(2, { space: 2 })
        .lineWidth(1)
        .strokeColor(C.faint)
        .stroke()
        .undash();
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(C.faint)
        .text(String(level), cx - r, cy - 3.5, {
          width: r * 2,
          align: 'center',
          lineBreak: false,
        });
    } else {
      doc.circle(cx, cy, r).fillAndStroke('#FFFFFF', tone.border);
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(tone.fg)
        .text(status === 'returned' ? '↺' : String(level), cx - r, cy - 3.5, {
          width: r * 2,
          align: 'center',
          lineBreak: false,
        });
    }
  }

  // -------------------------------------------------------------------------
  // Data helpers
  // -------------------------------------------------------------------------

  /**
   * Status is derived strictly from the request record; "Approved" is shown
   * only when the request itself is approved (i.e. all required levels done).
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
        return {
          label: 'Approved',
          short: 'Approved',
          tone: TONES.approved,
          detail: 'All approvals complete',
        };
      case 'rejected':
        return { label: 'Rejected', short: 'Rejected', tone: TONES.rejected };
      case 'cancelled':
        return {
          label: 'Cancelled',
          short: 'Cancelled',
          tone: TONES.cancelled,
        };
      case 'returned_for_correction':
        return {
          label: 'Returned',
          short: 'Returned',
          tone: TONES.returned,
          detail: 'Correction requested',
        };
      case 'draft':
        return {
          label: 'Draft',
          short: 'Draft',
          tone: TONES.draft,
          detail: 'Not submitted',
        };
      default: {
        const stage =
          p.status === 'pending_department_manager'
            ? 'Awaiting manager'
            : p.status === 'pending_hr'
              ? 'Awaiting HR'
              : 'In review';
        const partial = approvedSteps > 0 && total > 0;
        return {
          label: partial ? 'Partially approved' : 'Pending',
          short: partial ? 'Partially approved' : 'Pending',
          tone: TONES.pending,
          detail:
            total > 0
              ? `${stage} · ${approvedSteps} of ${total} approved`
              : stage,
        };
      }
    }
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

  private durationLabel(p: LeavePdfPayload): string | null {
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
    if (p.duration_type === 'FULL_DAY') return 'Full day(s)';
    return null;
  }

  private verificationCode(p: LeavePdfPayload): string {
    const digest = createHash('sha256')
      .update(
        [
          p.leave_no,
          p.employee_no,
          p.start_date,
          p.end_date,
          p.total_days,
          p.status,
        ]
          .map((v) => String(v ?? ''))
          .join('|'),
      )
      .digest('hex')
      .toUpperCase();
    return `${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}`;
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
      // Leave dates are calendar dates (YYYY-MM-DD) — format without shifting.
      date: (value: string) => {
        const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
        return Number.isNaN(d.getTime()) ? value : dateFmt.format(d);
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

type StatusInfo = { label: string; short: string; tone: Tone; detail?: string };
type Formatters = {
  date: (value: string) => string;
  dateTime: (value: Date) => string;
};
