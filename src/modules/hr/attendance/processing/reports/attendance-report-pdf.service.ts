import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import {
  formatAttendanceDate,
  formatAttendanceTime,
} from './attendance-report.utils';
import {
  AttendanceReportContext,
  AttendanceReportRow,
} from './attendance-report.types';

type AttendanceReportBatchReader = (
  writer: (rows: AttendanceReportRow[]) => Promise<void>,
) => Promise<void>;

type PdfColumn = {
  label: string;
  width: number;
};

@Injectable()
export class AttendanceReportPdfService {
  private readonly columns: PdfColumn[] = [
    { label: 'Employee Name', width: 0.18 },
    { label: 'Employee Number', width: 0.12 },
    { label: 'Attendance Date', width: 0.11 },
    { label: 'Shift', width: 0.13 },
    { label: 'Timetable', width: 0.14 },
    { label: 'Attendance Status', width: 0.12 },
    { label: 'Check-In Time', width: 0.1 },
    { label: 'Check-Out Time', width: 0.1 },
  ];

  async export(
    response: Response,
    context: AttendanceReportContext,
    readRows: AttendanceReportBatchReader,
  ): Promise<void> {
    response.status(200);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${context.filename}"`,
    );
    response.setHeader('Cache-Control', 'no-store');

    const document = new PDFDocument({
      margin: 32,
      size: 'A4',
      layout: 'landscape',
      bufferPages: true,
    });
    const finished = new Promise<void>((resolve, reject) => {
      response.on('finish', () => resolve());
      response.on('error', reject);
    });

    document.pipe(response);

    let cursorY = this.drawPageHeader(document, context, true);
    let rowIndex = 0;

    await readRows(async (rows) => {
      for (const row of rows) {
        const cellValues = [
          row.employeeName,
          row.employeeNumber,
          formatAttendanceDate(row.attendanceDate),
          row.shiftName,
          row.timetableName,
          row.attendanceStatus,
          formatAttendanceTime(row.checkInAt, row.timezone),
          formatAttendanceTime(row.checkOutAt, row.timezone),
        ];

        const rowHeight = this.calculateRowHeight(document, cellValues);
        if (cursorY + rowHeight > this.maxContentY(document)) {
          document.addPage({ margin: 32, size: 'A4', layout: 'landscape' });
          cursorY = this.drawPageHeader(document, context, false);
        }

        this.drawRow(document, cursorY, rowHeight, cellValues, rowIndex);
        cursorY += rowHeight;
        rowIndex += 1;
      }
    });

    if (rowIndex === 0) {
      const rowHeight = 28;
      this.drawRow(
        document,
        cursorY,
        rowHeight,
        [
          'No attendance records found for the selected filters.',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ],
        0,
      );
    }

    this.addPageNumbers(document);
    document.end();

    await finished;
  }

  private drawPageHeader(
    document: PDFKit.PDFDocument,
    context: AttendanceReportContext,
    isFirstPage: boolean,
  ): number {
    const left = document.page.margins.left;
    let cursorY = document.page.margins.top;

    document.font('Helvetica-Bold').fontSize(isFirstPage ? 18 : 14);
    document.text(context.companyName, left, cursorY, {
      width: this.contentWidth(document),
      align: 'left',
    });
    cursorY = document.y + 4;

    document.font('Helvetica-Bold').fontSize(isFirstPage ? 13 : 11);
    document.text('Attendance Report', left, cursorY);
    cursorY = document.y + 2;

    document.font('Helvetica').fontSize(9);
    document.text(`Reporting Period: ${context.reportingPeriodLabel}`, left, cursorY);
    cursorY = document.y + 2;
    document.text(`Generated At: ${context.generatedAt.toISOString()}`, left, cursorY);
    cursorY = document.y + 12;

    return this.drawTableHeader(document, cursorY);
  }

  private drawTableHeader(
    document: PDFKit.PDFDocument,
    y: number,
  ): number {
    const left = document.page.margins.left;
    const widths = this.resolveColumnWidths(document);
    const headerHeight = 24;

    document.save();
    document.rect(left, y, this.contentWidth(document), headerHeight).fill('#e2e8f0');
    document.restore();

    let x = left;
    document.font('Helvetica-Bold').fontSize(8);
    this.columns.forEach((column, index) => {
      document
        .fillColor('#0f172a')
        .text(column.label, x + 4, y + 7, {
          width: widths[index] - 8,
          align: 'left',
        });
      x += widths[index];
    });

    return y + headerHeight;
  }

  private drawRow(
    document: PDFKit.PDFDocument,
    y: number,
    rowHeight: number,
    values: string[],
    rowIndex: number,
  ): void {
    const left = document.page.margins.left;
    const widths = this.resolveColumnWidths(document);

    document.save();
    document
      .rect(left, y, this.contentWidth(document), rowHeight)
      .fill(rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc');
    document.restore();

    let x = left;
    document.font('Helvetica').fontSize(8).fillColor('#1e293b');

    values.forEach((value, index) => {
      document.rect(x, y, widths[index], rowHeight).stroke('#cbd5e1');
      document.text(value || '', x + 4, y + 6, {
        width: widths[index] - 8,
        height: rowHeight - 8,
        align: 'left',
      });
      x += widths[index];
    });
  }

  private calculateRowHeight(
    document: PDFKit.PDFDocument,
    values: string[],
  ): number {
    const widths = this.resolveColumnWidths(document);
    const height = values.reduce((max, value, index) => {
      const cellHeight = document.heightOfString(value || '', {
        width: widths[index] - 8,
        align: 'left',
      });
      return Math.max(max, cellHeight + 12);
    }, 22);

    return Math.max(height, 22);
  }

  private addPageNumbers(document: PDFKit.PDFDocument): void {
    const range = document.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      document.switchToPage(index);
      document.font('Helvetica').fontSize(8).fillColor('#475569');
      document.text(
        `Page ${index + 1} of ${range.count}`,
        document.page.margins.left,
        document.page.height - document.page.margins.bottom + 8,
        {
          width: this.contentWidth(document),
          align: 'right',
        },
      );
    }
  }

  private resolveColumnWidths(document: PDFKit.PDFDocument): number[] {
    const contentWidth = this.contentWidth(document);
    return this.columns.map((column) => contentWidth * column.width);
  }

  private contentWidth(document: PDFKit.PDFDocument): number {
    return (
      document.page.width -
      document.page.margins.left -
      document.page.margins.right
    );
  }

  private maxContentY(document: PDFKit.PDFDocument): number {
    return document.page.height - document.page.margins.bottom - 24;
  }
}
