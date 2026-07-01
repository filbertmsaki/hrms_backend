import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

type ApprovalHistoryItem = {
  level: number;
  action: string;
  status: string;
  approver_name: string | null;
  comments: string | null;
  acted_at: Date | null;
  signature_url: string | null;
};

type LeavePdfPayload = {
  company_name: string;
  company_logo_url?: string | null;
  leave_no: string;
  employee_no: string;
  employee_name: string;
  department_name?: string | null;
  position_name?: string | null;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  total_days: string;
  reason: string;
  status: string;
  applied_at?: Date | null;
    approved_at?: Date | null;
    current_balance: {
      fiscal_year: string;
      allocated_days: string;
      opening_balance_days?: string;
      entitlement_days?: string;
      used_days: string;
      pending_days: string;
      carried_forward_days: string;
      expired_days: string;
      adjusted_days?: string;
      attendance_deduction_days?: string;
      available_days: string;
    } | null;
  approval_history: ApprovalHistoryItem[];
};

@Injectable()
export class LeavePdfService {
  private writeLabelValue(
    document: PDFKit.PDFDocument,
    label: string,
    value: string,
  ): void {
    document.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    document.font('Helvetica').text(value);
  }

  async generateLeaveFormPdf(payload: LeavePdfPayload): Promise<Buffer> {
    const document = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
    });

    document.fontSize(18).font('Helvetica-Bold').text(payload.company_name);
    document
      .fontSize(10)
      .font('Helvetica')
      .text('Official Leave Application Form');
    document.moveDown(0.5);

    if (payload.company_logo_url) {
      this.writeLabelValue(document, 'Company Logo', payload.company_logo_url);
    }

    this.writeLabelValue(document, 'Leave Number', payload.leave_no);
    this.writeLabelValue(document, 'Employee Number', payload.employee_no);
    this.writeLabelValue(document, 'Employee Name', payload.employee_name);
    this.writeLabelValue(
      document,
      'Department',
      payload.department_name ?? 'N/A',
    );
    this.writeLabelValue(document, 'Position', payload.position_name ?? 'N/A');
    this.writeLabelValue(document, 'Leave Type', payload.leave_type_name);
    this.writeLabelValue(document, 'Start Date', payload.start_date);
    this.writeLabelValue(document, 'End Date', payload.end_date);
    this.writeLabelValue(document, 'Total Days', payload.total_days);
    this.writeLabelValue(document, 'Status', payload.status);
    this.writeLabelValue(
      document,
      'Applied At',
      payload.applied_at ? payload.applied_at.toISOString() : 'N/A',
    );
    this.writeLabelValue(
      document,
      'Approved At',
      payload.approved_at ? payload.approved_at.toISOString() : 'N/A',
    );

    document.moveDown();
    document.font('Helvetica-Bold').fontSize(12).text('Reason');
    document.font('Helvetica').fontSize(10).text(payload.reason);

    document.moveDown();
    document.font('Helvetica-Bold').fontSize(12).text('Leave Balance Snapshot');
    if (!payload.current_balance) {
      document
        .font('Helvetica')
        .fontSize(10)
        .text('No leave balance record found');
    } else {
      this.writeLabelValue(
        document,
        'Fiscal Year',
        payload.current_balance.fiscal_year,
      );
        this.writeLabelValue(
          document,
          'Opening Balance',
          payload.current_balance.opening_balance_days ??
            payload.current_balance.carried_forward_days,
        );
        this.writeLabelValue(
          document,
          'Yearly Entitlement',
          payload.current_balance.entitlement_days ??
            payload.current_balance.allocated_days,
        );
        this.writeLabelValue(
          document,
          'Allocated Days',
          payload.current_balance.allocated_days,
        );
        this.writeLabelValue(
          document,
          'Adjusted Days',
          payload.current_balance.adjusted_days ?? '0.00',
        );
        this.writeLabelValue(
          document,
          'Used Days',
        payload.current_balance.used_days,
      );
      this.writeLabelValue(
        document,
        'Pending Days',
        payload.current_balance.pending_days,
      );
      this.writeLabelValue(
        document,
        'Carried Forward',
        payload.current_balance.carried_forward_days,
      );
        this.writeLabelValue(
          document,
          'Expired Days',
          payload.current_balance.expired_days,
        );
        this.writeLabelValue(
          document,
          'Attendance Deductions',
          payload.current_balance.attendance_deduction_days ?? '0.00',
        );
        this.writeLabelValue(
          document,
          'Available Days',
        payload.current_balance.available_days,
      );
    }

    document.moveDown();
    document.font('Helvetica-Bold').fontSize(12).text('Approval History');
    if (!payload.approval_history.length) {
      document
        .font('Helvetica')
        .fontSize(10)
        .text('No approval action recorded');
    } else {
      payload.approval_history.forEach((approval, index) => {
        document
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(
            `${index + 1}. Level ${approval.level} | ${approval.action.toUpperCase()} | ${approval.status.toUpperCase()}`,
          );
        document
          .font('Helvetica')
          .fontSize(10)
          .text(`Approver: ${approval.approver_name ?? 'System / Unassigned'}`);
        document
          .font('Helvetica')
          .fontSize(10)
          .text(`Acted At: ${approval.acted_at?.toISOString() ?? 'N/A'}`);
        if (approval.comments) {
          document
            .font('Helvetica')
            .fontSize(10)
            .text(`Comments: ${approval.comments}`);
        }
        if (approval.signature_url) {
          document
            .font('Helvetica')
            .fontSize(10)
            .text(`Signature: ${approval.signature_url}`);
        }
        document.moveDown(0.3);
      });
    }

    const qrValue = JSON.stringify({
      leave_no: payload.leave_no,
      employee_no: payload.employee_no,
      status: payload.status,
      generated_at: new Date().toISOString(),
    });
    const qrDataUrl = await QRCode.toDataURL(qrValue, {
      margin: 0,
      width: 120,
    });
    const qrBase64 = qrDataUrl.split(',')[1];
    const qrBuffer = Buffer.from(qrBase64, 'base64');

    document.moveDown();
    document.font('Helvetica-Bold').fontSize(12).text('Verification QR');
    document.image(qrBuffer, { width: 100, height: 100 });
    document
      .font('Helvetica')
      .fontSize(9)
      .text('Scan this QR code to verify leave form metadata');

    document.end();
    return finished;
  }
}
