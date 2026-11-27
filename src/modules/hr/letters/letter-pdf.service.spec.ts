import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { inflateSync } from 'zlib';
import { DEFAULT_LETTER_TEMPLATES } from './default-letter-templates';
import { LetterTypeEnum, renderPlaceholders } from './letter-catalogue';
import { LetterPdfInput, LetterPdfService } from './letter-pdf.service';
import { LetterPlaceholdersService } from './letter-placeholders.service';

function extractPdfText(pdf: Buffer): { pages: number; text: string } {
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

// pdfkit + QR rendering is slow when the whole suite runs in parallel.
jest.setTimeout(60000);

const imageCount = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Subtype \/Image/g) ?? []).length;

const URL =
  'https://hrms.example.co.tz/verify/letter/Qm9ndXNUb2tlbkZvclRlc3RpbmdPbmx5MTIzNDU2Nzg5MA';
const sample = new LetterPlaceholdersService({} as never).sampleValues();
const values: Record<string, string> = {
  ...sample,
  company_name: 'Alliance Insurance Corporation Limited',
  issue_date: '27 November 2026',
};

function inputFor(
  type: LetterTypeEnum,
  overrides: Partial<LetterPdfInput> = {},
): LetterPdfInput {
  const t = DEFAULT_LETTER_TEMPLATES.find((item) => item.letter_type === type)!;
  return {
    branding: {
      companyName: 'Alliance Insurance Corporation Limited',
      address: 'Plot 12, Ohio Street, Dar es Salaam',
      phone: '+255 22 000 0000',
      email: 'hr@alliance.co.tz',
      website: 'www.alliance.co.tz',
    },
    logo: null,
    timezone: 'Africa/Dar_es_Salaam',
    referenceNo: 'LTR-2026-00042',
    dateLabel: '27 November 2026',
    letterTypeLabel: t.name,
    recipient: {
      name: 'Asha Juma Mwinyi',
      employeeNo: 'EMP-0042',
      addressLines: ['P.O. Box 1234', 'Dar es Salaam'],
    },
    salutation: renderPlaceholders(t.salutation, values),
    subject: renderPlaceholders(t.subject, values),
    body: renderPlaceholders(t.body, values),
    closing: t.closing,
    signatoryName: 'Neema Kileo',
    signatoryTitle: 'Head of Human Resources',
    includeAcknowledgement: t.include_acknowledgement,
    verificationUrl: URL,
    generatedAt: new Date('2026-11-27T09:30:00Z'),
    ...overrides,
  };
}

const LONG_BODY = Array.from({ length: 14 }, (_, i) =>
  i % 4 === 3
    ? '- First point of the matter under discussion\n- Second point with **bold** text and _italic_ text\n- Third point'
    : `Paragraph ${i + 1}. This custom letter sets out in detail the arrangements agreed between the company and the employee, including responsibilities, timelines and the reporting lines that apply during the period. It is written in plain business English and is deliberately long so that the letter flows naturally onto a second page without shrinking the body text.`,
).join('\n\n');

describe('LetterPdfService', () => {
  const service = new LetterPdfService();

  it('renders an issued letter on one A4 page with the QR and reference', async () => {
    const pdf = await service.render(
      inputFor(LetterTypeEnum.OFFER, { includeAcknowledgement: false }),
    );
    const { pages, text } = extractPdfText(pdf);
    expect(pages).toBe(1);
    expect(imageCount(pdf)).toBeGreaterThan(0);
    expect(text).toContain('LTR-2026-00042');
    expect(text).toContain('RE: OFFER OF EMPLOYMENT');
    expect(text).toContain('Neema Kileo');
    expect(text).toContain('Scan to Verify');
    expect(text).toContain('Letter reference: LTR-2026-00042');
    expect(text).toContain('Page 1 of 1');
    expect(text).toContain('Employee No: EMP-0042');
  });

  it('shows no QR and a draft note when not issued', async () => {
    const pdf = await service.render(
      inputFor(LetterTypeEnum.CONFIRMATION, { verificationUrl: null }),
    );
    const { text } = extractPdfText(pdf);
    expect(imageCount(pdf)).toBe(0);
    expect(text).not.toContain('Scan to Verify');
    expect(text).toContain('DRAFT');
    expect(text).toContain('Letter reference: Draft');
  });

  it('prints the employee acknowledgement section when enabled', async () => {
    const pdf = await service.render(inputFor(LetterTypeEnum.TERMINATION));
    const { text } = extractPdfText(pdf);
    expect(text).toContain('Employee acknowledgement');
    expect(text).toContain('I acknowledge receipt of this letter');
  });

  it('flows long letters onto further pages with footers on each', async () => {
    const pdf = await service.render(
      inputFor(LetterTypeEnum.CUSTOM, {
        body: LONG_BODY,
        subject: 'Working arrangements',
      }),
    );
    const { pages, text } = extractPdfText(pdf);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(text).toContain(`Page 2 of ${pages}`);
    expect(imageCount(pdf)).toBeGreaterThan(0);
    // Header is drawn on page 1 only.
    expect(
      text.split('\n').filter((line) => line === 'Reference'),
    ).toHaveLength(1);
  });

  const samplesDir = process.env.LETTER_SAMPLES_DIR;
  (samplesDir ? it : it.skip)(
    'writes sample PDFs for visual inspection',
    async () => {
      mkdirSync(samplesDir!, { recursive: true });
      const offer = await service.render(
        inputFor(LetterTypeEnum.OFFER, {
          recipient: {
            name: 'Baraka Mushi',
            employeeNo: null,
            addressLines: ['P.O. Box 55', 'Arusha'],
          },
        }),
      );
      const termination = await service.render(
        inputFor(LetterTypeEnum.TERMINATION),
      );
      const custom = await service.render(
        inputFor(LetterTypeEnum.CUSTOM, {
          body: LONG_BODY,
          subject: 'Working arrangements',
          referenceNo: 'LTR-2026-00043',
        }),
      );
      writeFileSync(join(samplesDir!, 'offer-letter-issued.pdf'), offer);
      writeFileSync(
        join(samplesDir!, 'termination-letter-issued.pdf'),
        termination,
      );
      writeFileSync(join(samplesDir!, 'custom-letter-two-pages.pdf'), custom);
    },
    30000,
  );
});
