/** Builds a minimal, valid one-page PDF (correct xref offsets) containing the given lines of text. */
const escapePdf = (s) => String(s).replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');

const buildSamplePdf = (lines) => {
    const content = ['BT', '/F1 16 Tf', '72 720 Td', '20 TL',
        ...lines.map((l) => `(${escapePdf(l)}) Tj T*`), 'ET'].join('\n');

    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((body, i) => {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefAt = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((o) => { pdf += `${String(o).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
};

module.exports = { buildSamplePdf };
