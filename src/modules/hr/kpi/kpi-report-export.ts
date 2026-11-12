import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { KpiReportDocument } from './kpi-report.service';

/** Excel treats leading operator characters as formulas even in a text field. */
export function safeSpreadsheetText(value: unknown): string {
  const text =
    value == null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value as string | number | boolean);
  return /^\s*[=+@-]/.test(text) ? `'${text}` : text;
}

export async function reportXlsx(report: KpiReportDocument): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HRMS KPI Management';
  const sheet = workbook.addWorksheet('KPI report', {
    views: [{ state: 'frozen', ySplit: 5 }],
  });
  sheet.columns = Array.from(
    {
      length: Math.max(
        2,
        ...report.sections.map((section) => section.columns.length),
      ),
    },
    () => ({ width: 25 }),
  );
  const heading = (value: string) => {
    const row = sheet.addRow([safeSpreadsheetText(value)]);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF245A75' },
    };
  };
  heading(report.title);
  sheet.addRow(['Company', safeSpreadsheetText(report.company)]);
  sheet.addRow(['Period', safeSpreadsheetText(report.period)]);
  sheet.addRow(['Generated', report.generatedAt]);
  sheet.addRow(['Page', report.page]);
  sheet.addRow([
    'Filters',
    safeSpreadsheetText(JSON.stringify(report.filters)),
  ]);
  sheet.addRow([]);
  for (const sentence of report.summary)
    sheet.addRow([safeSpreadsheetText(sentence)]);
  sheet.addRow([]);
  for (const section of report.sections) {
    heading(section.title);
    const headers = sheet.addRow(section.columns);
    headers.font = { bold: true };
    for (const record of section.rows)
      sheet.addRow(
        section.columns.map((column) => {
          const value = record[column];
          return typeof value === 'number' ? value : safeSpreadsheetText(value);
        }),
      );
    if (section.note) sheet.addRow([safeSpreadsheetText(section.note)]);
    sheet.addRow([]);
  }
  if (report.limitations.length) {
    heading('Notes and limitations');
    for (const note of report.limitations)
      sheet.addRow([safeSpreadsheetText(note)]);
  }
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}

export async function reportPdf(report: KpiReportDocument): Promise<Buffer> {
  const pdf = new PDFDocument({ size: 'A4', margin: 44, bufferPages: true });
  const chunks: Buffer[] = [];
  pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  const heading = (text: string) => {
    if (pdf.y > 740) pdf.addPage();
    pdf
      .moveDown(0.7)
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#245A75')
      .text(text);
    pdf.moveDown(0.3).font('Helvetica').fontSize(9).fillColor('#1f2937');
  };
  pdf
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#245A75')
    .text(report.title);
  pdf
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#475569')
    .text(`${report.company}  |  ${report.period}`)
    .text(`Generated ${report.generatedAt}  |  Page ${report.page}`)
    .text(`Filters: ${JSON.stringify(report.filters)}`);
  heading('Management summary');
  for (const sentence of report.summary)
    pdf.text(`• ${sentence}`, { width: 505 });
  for (const section of report.sections) {
    heading(section.title);
    if (!section.rows.length)
      pdf
        .fillColor('#64748b')
        .text('No authorized records for these filters.')
        .fillColor('#1f2937');
    else {
      for (const record of section.rows) {
        if (pdf.y > 740) pdf.addPage();
        pdf
          .font('Helvetica-Bold')
          .text(String(record[section.columns[0]] ?? 'Record'), {
            continued: false,
          });
        pdf.font('Helvetica').fontSize(8);
        for (const column of section.columns.slice(1))
          pdf.text(`${column}: ${record[column] ?? '—'}`, { width: 505 });
        pdf.moveDown(0.35);
      }
      pdf.fontSize(9);
    }
    if (section.note)
      pdf.fillColor('#64748b').text(section.note).fillColor('#1f2937');
  }
  heading('Notes and limitations');
  for (const note of report.limitations) pdf.text(`• ${note}`, { width: 505 });
  const count = pdf.bufferedPageRange().count;
  for (let page = 0; page < count; page++) {
    pdf.switchToPage(page);
    pdf
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text(`HRMS KPI Management  •  ${page + 1} / ${count}`, 44, 805, {
        width: 507,
        align: 'right',
      });
  }
  pdf.end();
  return done;
}
