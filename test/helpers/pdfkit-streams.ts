/** PDFKit writes a direct byte length in each stream's object dictionary. */
export function pdfKitStreams(pdf: Buffer, structure: string): Buffer[] {
  const result: Buffer[] = [];
  const stream = /\bstream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = stream.exec(structure))) {
    const header = structure.slice(
      structure.lastIndexOf(' obj', match.index),
      match.index,
    );
    const length = /\/Length\s+(\d+)/.exec(header);
    if (!length) throw new Error('Missing PDF stream length');
    const start = stream.lastIndex;
    stream.lastIndex = start + Number(length[1]);
    // A carriage return at the end of compressed data belongs to the payload.
    result.push(pdf.subarray(start, stream.lastIndex));
  }
  return result;
}
