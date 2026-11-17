import { inflateSync } from 'zlib';
import QRCode from 'qrcode';
import { LeavePdfPayload, LeavePdfService } from './leave-pdf.service';

/** Decodes the text drawn by pdfkit (standard fonts, hex TJ strings). */
export function extractPdfText(pdf: Buffer): { pages: number; text: string } {
  const raw = pdf.toString('latin1');
  const pages = (raw.match(/\/Type \/Page\b/g) ?? []).length;
  const parts: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw))) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    const tj = /\[([^\]]*)\]\s*TJ/g;
    let t: RegExpExecArray | null;
    while ((t = tj.exec(content))) {
      const hex = t[1].match(/<([0-9a-fA-F]*)>/g) ?? [];
      parts.push(
        hex
          .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1'))
          .join(''),
      );
    }
  }
  return { pages, text: parts.join('\n') };
}

const TOKEN = 'Qm9ndXNUb2tlbkZvclRlc3RpbmdPbmx5MTIzNDU2Nzg5MA';
const URL = `http://192.168.1.30:9990/verify/leave/${TOKEN}`;

export function basePayload(
  overrides: Partial<LeavePdfPayload> = {},
): LeavePdfPayload {
  return {
    verification_url: URL,
    company_name: 'Alliance Insurance Corporation Limited',
    company_address: 'Dar es Salaam, Tanzania',
    company_phone: '+255 22 000 0000',
    timezone: 'Africa/Dar_es_Salaam',
    generated_at: new Date('2026-11-17T09:30:00Z'),
    leave_no: 'LV-2026-000002',
    employee_no: 'AIC-0042',
    employee_name: 'Asha Mwinyi',
    department_name: 'Finance',
    position_name: 'Senior Accountant',
    branch_name: 'Head Office',
    reporting_manager_name: 'Juma Said',
    employment_type: 'PERMANENT',
    hire_date: '2019-03-01',
    leave_type_name: 'Annual Leave',
    is_paid: true,
    start_date: '2026-12-01',
    end_date: '2026-12-05',
    total_days: '5.00',
    duration_type: 'FULL_DAY',
    resumption_date: '2026-12-08',
    reason: 'Family travel',
    status: 'pending_hr',
    applied_at: new Date('2026-11-10T07:15:00Z'),
    current_balance: {
      fiscal_year: '2026',
      entitlement_days: '28.00',
      opening_balance_days: '3.00',
      used_days: '20.00',
      pending_days: '5.00',
      approved_future_days: '0.00',
      other_adjustments_days: '0.00',
      available_days: '6.00',
      mode: 'reserved',
      before_days: '11.00',
      after_days: '6.00',
    },
    approval_history: [
      {
        level: 1,
        step_label: 'Head of Department',
        action: 'recommend',
        status: 'approved',
        approver_name: 'Juma Said',
        approver_designation: 'Finance Manager',
        comments: 'Recommended.',
        acted_at: new Date('2026-11-11T08:00:00Z'),
        signature_url: null,
      },
      {
        level: 2,
        step_label: 'HR Department',
        action: 'approve',
        status: 'pending',
        approver_name: null,
        comments: null,
        acted_at: null,
        signature_url: null,
      },
    ],
    attachments: [],
    ...overrides,
  };
}

describe('LeavePdfService (Leave Application Form)', () => {
  const service = new LeavePdfService();

  it('renders the Leave Application Form title, sections and data', async () => {
    const pdf = await service.generateLeaveFormPdf(basePayload());
    const { text, pages } = extractPdfText(pdf);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages).toBe(1);
    for (const expected of [
      'LEAVE APPLICATION FORM',
      'ALLIANCE INSURANCE CORPORATION LIMITED',
      'A. EMPLOYEE INFORMATION',
      'B. LEAVE APPLICATION DETAILS',
      'D. LEAVE BALANCE SUMMARY',
      'E. EMPLOYEE DECLARATION',
      'F. DEPARTMENTAL RECOMMENDATION & APPROVAL',
      'G. FOR HR / PERSONNEL DEPARTMENT USE',
      'Asha Mwinyi',
      'AIC-0042',
      'Senior Accountant',
      'Permanent',
      '01 Mar 2019',
      '01 Dec 2026',
      '05 Dec 2026',
      '08 Dec 2026',
      'Scan to Verify',
      'Electronically submitted through HRMS',
      'Leave Application Reference: LV-2026-000002',
      'Page 1 of 1',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('EMPLOYEE LEAVE REQUEST');
    expect(text).toContain('PARTIALLY APPROVED');
  });

  it('never prints verification metadata as text', async () => {
    const pdf = await service.generateLeaveFormPdf(basePayload());
    const { text } = extractPdfText(pdf);
    const raw = pdf.toString('latin1');
    expect(text).not.toMatch(/Document verification/i);
    expect(text).not.toMatch(/Verification code/i);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('192.168');
    expect(text).not.toContain('/verify/leave');
    expect(text).not.toMatch(/online (check|status)/i);
    // Not even as a clickable link annotation.
    expect(raw).not.toContain('/URI');
  });

  it('encodes the existing verification URL in the QR code', async () => {
    const spy = jest.spyOn(QRCode, 'toBuffer');
    await service.generateLeaveFormPdf(basePayload());
    expect(spy).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ errorCorrectionLevel: 'M' }),
    );
    spy.mockRestore();
  });

  it('shows the medical section only for medical leave', async () => {
    const plain = extractPdfText(
      await service.generateLeaveFormPdf(basePayload()),
    ).text;
    expect(plain).not.toContain('MEDICAL LEAVE INFORMATION');

    const sick = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          leave_type_name: 'Sick Leave',
          medical: {
            sickness_nature: 'Malaria',
            doctor_name: 'Dr. Neema Kweka',
            doctor_phone: '+255 700 000 111',
            hospital_name: 'Aga Khan Hospital',
            treatment_start_date: '2026-12-01',
            treatment_end_date: '2026-12-04',
            certificate_status: 'Attached',
          },
        }),
      ),
    ).text;
    expect(sick).toContain('C. MEDICAL LEAVE INFORMATION');
    expect(sick).toContain('Malaria');
    expect(sick).toContain('Aga Khan Hospital');
  });

  it.each([
    ['approved', 'APPROVED', null],
    ['rejected', 'REJECTED', 'does not authorise'],
    ['cancelled', 'CANCELLED', 'does not authorise'],
    ['draft', 'DRAFT', 'not been submitted'],
    ['pending_department_manager', 'PENDING', 'Not authorised leave'],
  ])(
    'labels %s requests without implying approval',
    async (status, pill, notice) => {
      const history =
        status === 'pending_department_manager'
          ? basePayload().approval_history.map((a) => ({
              ...a,
              status: 'pending',
              acted_at: null,
            }))
          : basePayload().approval_history;
      const { text } = extractPdfText(
        await service.generateLeaveFormPdf(
          basePayload({
            status,
            approval_history: history,
            approved_at:
              status === 'approved' ? new Date('2026-11-12T10:00:00Z') : null,
          }),
        ),
      );
      expect(text).toContain(pill);
      if (notice) expect(text).toContain(notice);
      if (status !== 'approved') {
        expect(text).not.toMatch(/^APPROVED$/m);
      }
    },
  );

  it('prints negative balances as held in the ledger', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          current_balance: {
            ...basePayload().current_balance!,
            available_days: '-3.00',
            before_days: '2.00',
            after_days: '-3.00',
          },
        }),
      ),
    );
    expect(text).toContain('-3');
    expect(text).toContain('shown exactly as held in the leave ledger');
  });

  it('shows a controlled state when the balance is unavailable', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({ current_balance: null }),
      ),
    );
    expect(text).toContain('Unavailable');
  });

  it('flows long content onto extra pages with page numbers', async () => {
    const reason =
      'Extended family matters requiring travel upcountry. '.repeat(40);
    const approval_history = Array.from({ length: 6 }, (_, i) => ({
      level: i + 1,
      step_label: `Stage ${i + 1}`,
      action: 'approve',
      status: 'approved',
      approver_name: `Approver ${i + 1}`,
      approver_designation: 'Manager',
      comments: 'Reviewed and approved in line with policy. '.repeat(4),
      acted_at: new Date('2026-11-11T08:00:00Z'),
      signature_url: null,
    }));
    const { text, pages } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({ reason, approval_history, status: 'approved' }),
      ),
    );
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain(`Page ${pages} of ${pages}`);
    expect(text).toContain('LEAVE APPLICATION FORM (continued)');
    expect(text).toContain('Approver 6');
  });

  it('handles missing optional employee data and half-day leave', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          department_name: null,
          position_name: null,
          hire_date: null,
          employment_type: null,
          duration_type: 'HALF_DAY',
          half_day_session: 'MORNING',
          total_days: '0.50',
          start_date: '2026-12-01',
          end_date: '2026-12-01',
          resumption_date: null,
        }),
      ),
    );
    expect(text).toContain('Not recorded');
    expect(text).toContain('Half day (Morning)');
    expect(text).toContain('0.5 days');
  });
});
