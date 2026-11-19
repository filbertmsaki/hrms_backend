import { inflateSync } from 'zlib';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { LeavePdfPayload, LeavePdfService } from './leave-pdf.service';

/** Decodes the text drawn by pdfkit (standard fonts, hex TJ strings). */
export function extractPdfText(pdf: Buffer): { pages: number; text: string } {
  const raw = pdf.toString('latin1');
  const pages = (raw.match(/\/Type \/Page\b/g) ?? []).length;
  const parts: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\nendstream/g;
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
    verification_url: null,
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
      taken_before_days: '20.00',
      other_deduction_days: '0.00',
      credit_days: '0.00',
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

jest.setTimeout(30000);

describe('LeavePdfService (Leave Application Form)', () => {
  const service = new LeavePdfService();

  it('prints the full declaration without a balance note', async () => {
    const { text, pages } = extractPdfText(
      await service.generateLeaveFormPdf(basePayload()),
    );
    const normalized = text.replace(/\s+/g, ' ').replace(/\u0092/g, '’');
    expect(normalized).toContain(
      'I hereby confirm that the information provided in this leave application is accurate and complete to the best of my knowledge. I understand that this application is subject to the company’s leave policies and approval procedures.',
    );
    expect(normalized).not.toMatch(/balance note/i);
    expect(pages).toBeGreaterThanOrEqual(1);
  });

  it('uses navy and white corporate colours', async () => {
    const raw = (await service.generateLeaveFormPdf(basePayload())).toString(
      'latin1',
    );
    const colours: string[] = [];
    for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\nendstream/g)) {
      try {
        const content = inflateSync(Buffer.from(match[1], 'latin1')).toString(
          'latin1',
        );
        for (const colour of content.matchAll(
          /(?:^|\n)([\d.]+\s+[\d.]+\s+[\d.]+)\s+(?:scn|SCN)(?:\n|$)/g,
        )) {
          colours.push(colour[1]);
        }
      } catch {
        // Non-Flate streams do not contain PDF drawing instructions.
      }
    }
    expect(colours.length).toBeGreaterThan(0);
    expect(colours).toContain(
      '0.11372549019607843 0.2196078431372549 0.37254901960784315',
    );
    expect(colours).toContain('1 1 1');
  });

  it('uses a readable hierarchy of body and heading sizes', async () => {
    const raw = (await service.generateLeaveFormPdf(basePayload())).toString(
      'latin1',
    );
    const sizes = new Set<number>();
    for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\nendstream/g)) {
      try {
        const stream = inflateSync(Buffer.from(match[1], 'latin1')).toString(
          'latin1',
        );
        for (const font of stream.matchAll(/\/F\d+\s+(\d+(?:\.\d+)?)\s+Tf/g))
          sizes.add(Number(font[1]));
      } catch {
        // Images and other non-Flate streams are not text instructions.
      }
    }
    expect(sizes.has(8.5)).toBe(true);
    expect(sizes.has(15)).toBe(true);
  });

  it('uses one portrait A4 page', async () => {
    const pdf = await PDFDocument.load(
      await service.generateLeaveFormPdf(basePayload()),
    );
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89, 1);
  });

  it('keeps medical leave and multiple workflow stages on one page', async () => {
    const pdf = await service.generateLeaveFormPdf(
      basePayload({
        medical: {
          sickness_nature: 'Illness',
          doctor_name: null,
          doctor_phone: null,
          hospital_name: 'Medical centre',
          treatment_start_date: '2026-12-01',
          treatment_end_date: '2026-12-03',
          certificate_status: 'Not recorded',
        },
        approval_history: Array.from({ length: 8 }, (_, i) => ({
          ...basePayload().approval_history[0],
          level: i + 1,
          step_label: `Stage ${i + 1}`,
          comments: 'Review '.repeat(80),
        })),
      }),
    );
    const { text, pages } = extractPdfText(pdf);
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(text).toContain('E. MEDICAL LEAVE INFORMATION');
    expect(text).toContain('H. FINAL AUTHORIZATION');
    expect(text).toContain('Stage 8');
    // Approval comments stay in HRMS; the form shows the decisions only.
    expect(text).not.toContain('Review Review');
  });

  it('prints the corrected balance summary without pending leave', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          current_balance: {
            ...basePayload().current_balance!,
            other_deduction_days: '2.00',
          },
        }),
      ),
    );
    expect(text).toMatch(/Leave already taken\s*20/);
    expect(text).toMatch(/Leave days requested\s*5/);
    expect(text).toMatch(/Other leave deductions\s*2/);
    expect(text).toMatch(/Balance after this request\s*6/);
    expect(text).not.toContain('Pending leave');
    expect(text).not.toContain('Other adjustments');
  });

  it('does not imply a final decision from an earlier recommendation', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(basePayload()),
    );
    expect(text).toMatch(/Final decision\s*PENDING/);
    expect(text).toMatch(/Approving authority\s*Pending/);
  });

  it('does not attribute final approval to an earlier stage when the last stage is pending', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(basePayload({ status: 'approved' })),
    );
    expect(text).toMatch(/Final decision\s*APPROVED/);
    expect(text).toMatch(/Approving authority\s*Not recorded/);
  });

  it('uses the recorded HR designation when a workflow stage has no HR label', async () => {
    const stage = {
      ...basePayload().approval_history[0],
      step_label: 'Level 2',
      approver_designation: 'HR Manager',
    };
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({ approval_history: [stage] }),
      ),
    );
    expect(text).toContain('G. FOR HR / PERSONNEL DEPARTMENT USE');
    expect(text).toContain('HR Manager');
  });

  it('renders the Leave Application Form title, sections and data', async () => {
    const pdf = await service.generateLeaveFormPdf(
      basePayload({ verification_url: URL }),
    );
    const { text, pages } = extractPdfText(pdf);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages).toBeGreaterThanOrEqual(1);
    for (const expected of [
      'LEAVE APPLICATION FORM',
      'ALLIANCE INSURANCE CORPORATION LIMITED',
      'A. EMPLOYEE INFORMATION',
      'B. LEAVE APPLICATION DETAILS',
      'C. LEAVE BALANCE SUMMARY',
      'D. EMPLOYEE DECLARATION',
      'F. DEPARTMENT RECOMMENDATION',
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
    ]) {
      expect(text.replace(/\s+/g, ' ')).toContain(expected);
    }
    expect(text).not.toMatch(/Electronically submitted through\s+HRMS/);
    expect(text).not.toContain('EMPLOYEE LEAVE REQUEST');
    expect(text).toContain('PENDING HR APPROVAL');
    expect(text).not.toContain('PARTIALLY APPROVED');
    expect(text).toContain('Leave Application Reference:');
  });

  it('does not list supporting documents in the form and prints the reporting manager', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          attachments: [
            { file_name: 'medical-certificate.pdf', uploaded_at: new Date() },
          ],
        }),
      ),
    );
    expect(text).not.toMatch(/supporting documents/i);
    expect(text).not.toContain('medical-certificate.pdf');
    expect(text).toContain('Reporting manager');
  });

  it('does not describe an earlier recommender as the final authorizer while pending', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          approval_history: [basePayload().approval_history[0]],
          status: 'pending_hr',
        }),
      ),
    );
    expect(text).not.toContain('Authorized by');
    expect(text).not.toContain('G. HR / PERSONNEL REVIEW');
  });

  it('shows system-recorded HR decisions (not their comments) when HR is in the workflow', async () => {
    const hrStage = {
      ...basePayload().approval_history[1],
      status: 'approved',
      approver_name: 'HR Officer',
      acted_at: new Date('2026-11-12T08:00:00Z'),
      comments: 'Balance verified.',
    };
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          approval_history: [basePayload().approval_history[0], hrStage],
        }),
      ),
    );
    expect(text).toContain('G. FOR HR / PERSONNEL DEPARTMENT USE');
    expect(text).toContain('HR Officer');
    expect(text).not.toContain('Balance verified.');
    expect(text).toContain('Recommended');
    expect(text).not.toContain('HR remarks:');
    expect(text).not.toContain('________');
  });

  it('does not classify a non-HR verification stage as HR', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          approval_history: [
            {
              ...basePayload().approval_history[0],
              action: 'verify',
              step_label: 'Finance Review',
            },
          ],
        }),
      ),
    );
    expect(text).toContain('Finance Review');
    expect(text).toContain('Verification');
    // G is mandatory: without an HR stage it is printed for manual HR use,
    // and the Finance stage stays in section F.
    const g = text.indexOf('G. FOR HR / PERSONNEL DEPARTMENT USE');
    expect(g).toBeGreaterThan(text.indexOf('Finance Review'));
    expect(text.slice(g)).toContain('Not in this workflow');
    // Page 2 lists every stage again; section G itself must not.
    expect(text.slice(g)).not.toContain('Finance Review');
  });

  it('never prints verification metadata as text', async () => {
    const pdf = await service.generateLeaveFormPdf(
      basePayload({ verification_url: URL }),
    );
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
    await service.generateLeaveFormPdf(basePayload({ verification_url: URL }));
    expect(spy).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ errorCorrectionLevel: 'M' }),
    );
    spy.mockRestore();
  });

  it('omits the medical section for non-medical leave', async () => {
    const plain = extractPdfText(
      await service.generateLeaveFormPdf(basePayload()),
    ).text;
    expect(plain).not.toContain('MEDICAL LEAVE INFORMATION');
  });

  it('shows the medical section for medical leave', async () => {
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
    expect(sick).toContain('E. MEDICAL LEAVE INFORMATION');
    // The diagnosis is never printed; the doctor completes the section.
    expect(sick).not.toContain('Malaria');
    expect(sick).toContain("Doctor's signature");
    expect(sick).toContain('Aga Khan Hospital');
  });

  it.each([
    ['approved', 'APPROVED', null],
    ['rejected', 'REJECTED', null],
    ['cancelled', 'CANCELLED', null],
    ['draft', 'DRAFT', null],
    ['pending_department_manager', 'PENDING', null],
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
  });

  it('shows a controlled state when the balance is unavailable', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({ current_balance: null }),
      ),
    );
    expect(text).toContain('Unavailable');
  });

  it('keeps long content on one page and identifies supplementary details', async () => {
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
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(text).not.toContain('Extended family matters requiring travel');
    expect(text).not.toContain('Reviewed and approved in line with policy');
    for (let i = 1; i <= 6; i++) expect(text).toContain(`Stage ${i}`);
    // Non-medical leave is shrunk to fit a single page.
    expect(pages).toBe(1);
  });

  it('does not shrink medical leave onto one page', async () => {
    const approval_history = Array.from({ length: 6 }, (_, i) => ({
      ...basePayload().approval_history[0],
      level: i + 1,
      step_label: `Stage ${i + 1}`,
    }));
    const medical = {
      sickness_nature: 'Illness',
      doctor_name: null,
      doctor_phone: null,
      hospital_name: 'Medical centre',
      treatment_start_date: '2026-12-01',
      treatment_end_date: '2026-12-03',
      certificate_status: 'Not recorded',
    };
    const { pages } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({ medical, approval_history }),
      ),
    );
    expect(pages).toBeGreaterThan(1);
  });

  it('omits continuation titles and keeps the verification QR in final authorization', async () => {
    const result = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          verification_url: URL,
          acting_employee: {
            name: 'Neema Joseph',
            employee_no: 'EMP-0012',
            department_name: 'Finance',
            position_name: 'Accountant',
            start_date: '2026-12-01',
            end_date: '2026-12-05',
            status: 'PENDING',
            responsibilities: 'Covers payments and reconciliations. '.repeat(
              60,
            ),
            appointed_by_name: 'Juma Hassan',
          },
        }),
      ),
    );
    expect(result.pages).toBeGreaterThan(1);
    expect(result.text).not.toContain('- LEAVE APPLICATION');
    expect(result.text.indexOf('Scan to Verify')).toBeGreaterThan(
      result.text.indexOf('H. FINAL AUTHORIZATION'),
    );
    expect(result.text).toContain('Page 1 of');
    expect(result.text).toContain('Page 2 of');
  });

  it('never prints the leave reason (it stays in HRMS)', async () => {
    const reason =
      'Family matters requiring travel and arrangements in another region. '
        .repeat(2)
        .trim();
    const { text, pages } = extractPdfText(
      await service.generateLeaveFormPdf(basePayload({ reason })),
    );
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(text).not.toContain('Family matters requiring travel');
    expect(text).not.toMatch(/Reason for leave/i);
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
    expect(text).toContain('0.5');
  });
});

describe('Leave Application Form — mandatory sections and signatures', () => {
  const service = new LeavePdfService();
  const medical = {
    sickness_nature: 'Malaria',
    doctor_name: 'Dr A',
    doctor_phone: null,
    hospital_name: 'Aga Khan Hospital',
    treatment_start_date: '2026-11-02',
    treatment_end_date: '2026-11-04',
    certificate_status: 'Received',
  };
  const hrApproved = {
    ...basePayload().approval_history[1],
    status: 'approved',
    approver_name: 'Neema Mushi',
    approver_designation: 'HR Manager',
    comments: 'Balance verified.',
    acted_at: new Date('2026-11-12T09:00:00Z'),
  };

  it.each(['Sick Leave', 'Maternity Leave', 'Annual Leave', 'Paternity Leave'])(
    'keeps section G (decision, no remarks) for %s with medical details',
    async (leaveType) => {
      const pdf = await service.generateLeaveFormPdf(
        basePayload({
          leave_type_name: leaveType,
          medical,
          status: 'approved',
          verification_url: 'http://x/verify/leave/abc',
          approval_history: [basePayload().approval_history[0], hrApproved],
        }),
      );
      const { pages, text } = extractPdfText(pdf);
      expect(pages).toBeGreaterThanOrEqual(1);
      expect(text).toContain('E. MEDICAL LEAVE INFORMATION');
      expect(text).toContain('G. FOR HR / PERSONNEL DEPARTMENT USE');
      expect(text).toContain('Neema Mushi');
      expect(text).not.toContain('Balance verified.');
      expect(text).toContain('H. FINAL AUTHORIZATION');
      expect(text).toContain('Scan to Verify');
    },
  );

  it('leaves e-signatures off the printed form', async () => {
    const sig = {
      signer_name: 'Asha Mwinyi',
      signed_at: new Date('2026-11-10T07:20:00Z'),
      reference: 'LSG-1A2B3C4D5E',
      valid: true,
    };
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          status: 'approved',
          employee_signature: sig,
          approval_history: [
            {
              ...basePayload().approval_history[0],
              signature: { ...sig, reference: 'LSG-9F8E7D6C5B' },
            },
            {
              ...hrApproved,
              signature: { ...sig, reference: 'LSG-0011223344' },
            },
          ],
        }),
      ),
    );
    expect(text).not.toMatch(/Electronically signed/);
    expect(text).not.toContain('LSG-1A2B3C4D5E');
    expect(text).not.toContain('LSG-9F8E7D6C5B');
    expect(text).not.toContain('LSG-0011223344');
    expect(text).not.toContain('Final signature');
    expect(text).not.toContain('Not verified');
  });

  it('prints no signature status for legacy approvals or outdated signatures', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          status: 'approved',
          employee_signature: {
            signer_name: 'Asha Mwinyi',
            signed_at: new Date('2026-11-10T07:20:00Z'),
            reference: 'LSG-OLD0000000',
            valid: false,
          },
          approval_history: [basePayload().approval_history[0], hrApproved],
        }),
      ),
    );
    expect(text).not.toContain('Signature Not Available');
    expect(text).not.toMatch(/Employee Signature/);
    expect(text).not.toContain('Electronically signed by');
  });

  it('summarises a long workflow without hiding which levels are omitted', async () => {
    const approval_history = Array.from({ length: 7 }, (_, i) => ({
      level: i + 1,
      step_label: `Stage ${i + 1}`,
      action: 'approve',
      status: i < 4 ? 'approved' : 'pending',
      approver_name: i < 4 ? `Approver ${i + 1}` : null,
      approver_designation: null,
      comments: null,
      acted_at: i < 4 ? new Date('2026-11-11T08:00:00Z') : null,
      signature_url: null,
    }));
    const { pages, text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({ medical, status: 'in_review', approval_history }),
      ),
    );
    expect(pages).toBeGreaterThanOrEqual(1);
    for (let i = 1; i <= 7; i++) expect(text).toContain(`Stage ${i}`);
    expect(text).toMatch(/Final decision\s*PENDING/);
    expect(text).not.toMatch(/Final decision\s*APPROVED/);
    expect(text).toContain('G. FOR HR / PERSONNEL DEPARTMENT USE');
  });

  it('shows "Not assigned" in section A when no acting employee exists', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({ acting_employee: null }),
      ),
    );
    const a = text.indexOf('A. EMPLOYEE INFORMATION');
    const b = text.indexOf('B. LEAVE APPLICATION DETAILS');
    expect(text.slice(a, b)).toMatch(/Acting employee\s*Not assigned/);
  });

  it('prints the acting employee, delegation period and responsibilities in section A', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          acting_employee: {
            name: 'Neema Joseph',
            employee_no: 'EMP-0012',
            department_name: 'Finance',
            position_name: 'Accountant',
            start_date: '2026-12-01',
            end_date: '2026-12-05',
            status: 'ACTIVE',
            responsibilities: 'Approve petty cash requests.',
            appointed_by_name: 'Juma Hassan, Finance Manager',
          },
        }),
      ),
    );
    const a = text.indexOf('A. EMPLOYEE INFORMATION');
    const b = text.indexOf('B. LEAVE APPLICATION DETAILS');
    const section = text.slice(a, b).replace(/\s+/g, ' ');
    for (const expected of [
      'Neema Joseph',
      'EMP-0012',
      'Finance',
      'Accountant',
      'Approve petty cash requests.',
      'Juma Hassan, Finance Manager',
    ])
      expect(section).toContain(expected);
    // The text extractor drops the en dash between the dates.
    expect(section).toMatch(/01 Dec 2026 .{0,3}05 Dec 2026 \(Active\)/);
  });

  it('prints facts but not free-text reasons in final authorization', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          status: 'rejected',
          rejection_reason: 'SECRET rejection reason',
          returned_at: new Date('2026-11-09T08:00:00Z'),
          return_reason: 'SECRET return note',
          notice_override_reason: 'SECRET notice reason',
          extra_remarks: [
            {
              label: 'Ended early (originally to 2026-12-05)',
              text: 'SECRET end-early reason',
            },
          ],
        }),
      ),
    );
    expect(text).not.toContain('SECRET');
    expect(text).toContain('Returned for correction');
    expect(text).toContain('Ended early (originally to 2026-12-05)');
    expect(text).toContain('Minimum notice requirement overridden');
    expect(text).toMatch(/Final decision\s*REJECTED/);
  });

  it('counts appended supporting-document pages in the footer without listing them', async () => {
    const { text } = extractPdfText(
      await service.generateLeaveFormPdf(
        basePayload({
          appended_page_count: 3,
          attachments: [
            {
              file_name: 'certificate.pdf',
              uploaded_at: null,
              disposition: 'appended',
              page_from: 3,
              page_to: 4,
            },
            {
              file_name: 'scan.docx',
              uploaded_at: null,
              disposition: 'not_convertible',
            },
          ],
        }),
      ),
    );
    expect(text).toMatch(/Page 1 of [45]/);
    expect(text).not.toContain('certificate.pdf');
    expect(text).not.toContain('scan.docx');
  });
});
