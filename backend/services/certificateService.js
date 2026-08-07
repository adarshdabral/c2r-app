const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const GREEN = '#0f9e6a';
const DEEP = '#0b6b3f';
const INK = '#14181a';
const MUTED = '#6c7278';
const LINE = '#e4e8e4';

/**
 * Render a professional A4 Data Sanitization Certificate and return it as a
 * base64 string (stored in the DB). The recycler is the issuing authority.
 *
 * @param {object} d certificate data (see certificateController)
 * @returns {Promise<string>} base64-encoded PDF
 */
async function buildCertificatePdf(d) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const W = doc.page.width;
  const H = doc.page.height;
  const M = 50;
  const CW = W - M * 2;

  // ── Header band + logo ────────────────────────────────────────────────────
  doc.rect(0, 0, W, 96).fill(GREEN);
  doc.circle(M + 20, 48, 20).fill('#ffffff');
  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(15).text('CTR', M + 6, 40);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('Connect To Recycle', M + 54, 32);
  doc.fillColor('#daf6ea').font('Helvetica').fontSize(9.5).text('Certified E-Waste Recycling Platform', M + 54, 56);

  // ── Title ────────────────────────────────────────────────────────────────
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(22)
    .text('Data Sanitization Certificate', M, 128, { width: CW, align: 'center' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(10)
    .text(`Certificate ID: ${d.certificateNo}`, M, 158, { width: CW, align: 'center' });
  doc.moveTo(M, 182).lineTo(W - M, 182).strokeColor(LINE).lineWidth(1).stroke();

  // ── Field helper ──────────────────────────────────────────────────────────
  let y = 200;
  const row = (label, value) => {
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5)
      .text(label.toUpperCase(), M, y, { width: 150 });
    doc.fillColor(INK).font('Helvetica').fontSize(11)
      .text(value || '—', M + 155, y - 2, { width: CW - 155 });
    const used = doc.heightOfString(value || '—', { width: CW - 155, font: 'Helvetica', size: 11 });
    y += Math.max(22, used + 8);
  };

  row('Booking Reference', d.bookingRef);
  row('Customer', d.userName);
  row('Recycler', d.recyclerName);
  if (d.recyclerAddress) row('Recycler Address', d.recyclerAddress);

  // ── Device details ────────────────────────────────────────────────────────
  doc.fillColor(DEEP).font('Helvetica-Bold').fontSize(11).text('Device Details', M, y + 4);
  y += 24;
  const details =
    Array.isArray(d.deviceDetails) && d.deviceDetails.length
      ? d.deviceDetails
      : (d.fallbackCategories || []).map((c) => ({ categoryName: c, items: [] }));
  if (details.length === 0) {
    doc.fillColor(INK).font('Helvetica').fontSize(10).text('As per booking record.', M, y);
    y += 18;
  } else {
    for (const cat of details) {
      const items = (cat.items || []).map((i) => i.name).join(', ');
      const label = items ? `${cat.categoryName}: ${items}` : cat.categoryName;
      doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(`•  ${label}`, M + 4, y, { width: CW - 8 });
      y += doc.heightOfString(`•  ${label}`, { width: CW - 8, size: 10.5 }) + 5;
    }
  }
  if (d.quantity != null) {
    row('Declared Quantity', `${d.quantity} kg`);
  }

  // ── Sanitization details ──────────────────────────────────────────────────
  y += 6;
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(LINE).lineWidth(1).stroke();
  y += 14;
  row('Sanitization Method', d.method);
  row('Date of Sanitization', d.sanitizedOn);
  row('Authorized Representative', d.authorisedPerson + (d.designation ? `  (${d.designation})` : ''));

  // ── Attestation ───────────────────────────────────────────────────────────
  y += 8;
  doc.fillColor(INK).font('Helvetica').fontSize(10).text(
    `This is to certify that the data-bearing devices listed above were securely sanitized using the stated method, rendering the stored data irrecoverable, in accordance with responsible e-waste handling practices.`,
    M, y, { width: CW, align: 'left', lineGap: 2 }
  );
  y += 50;

  // ── Issued-by (recycler is the issuing authority) ─────────────────────────
  doc.fillColor(DEEP).font('Helvetica-Bold').fontSize(12).text(`Issued by ${d.recyclerName}`, M, y);
  y += 26;

  // ── QR + verification (left) and signature block (right) ──────────────────
  const blockY = Math.max(y, H - 150);
  try {
    const qr = await QRCode.toBuffer(d.verifyUrl, { width: 96, margin: 1, color: { dark: INK, light: '#ffffff' } });
    doc.image(qr, M, blockY, { width: 88 });
  } catch {
    /* QR is optional — skip on failure */
  }
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Verify: ${d.verificationId}`, M, blockY + 92, { width: 130 });

  doc.moveTo(W - M - 180, blockY + 60).lineTo(W - M, blockY + 60).strokeColor(INK).lineWidth(1).stroke();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text('Authorized Signatory', W - M - 180, blockY + 66, { width: 180, align: 'center' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(d.authorisedPerson, W - M - 180, blockY + 80, { width: 180, align: 'center' });

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(
    'Generated via CTR — Connect To Recycle. This certificate is permanently linked to the booking above.',
    M, H - 34, { width: CW, align: 'center' }
  );

  doc.end();
  const buf = await done;
  return buf.toString('base64');
}

module.exports = { buildCertificatePdf };
