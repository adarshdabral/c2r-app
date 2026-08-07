const PDFDocument = require('pdfkit');
const driveModel = require('../models/collectionDriveModel');
const reportModel = require('../models/collectionDriveReportModel');
const { buildDriveXls } = require('../utils/driveReportExcel');
const logger = require('../utils/logger');

const GREEN = '#7c3aed';
const INK = '#14181a';
const MUTED = '#6c7278';
const LINE = '#e4e8e4';

async function buildDrivePdf({ drive, attendees, reportNo }) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res, rej) => {
    doc.on('end', () => res(Buffer.concat(chunks)));
    doc.on('error', rej);
  });

  const W = doc.page.width;
  const M = 50;
  const CW = W - M * 2;

  doc.rect(0, 0, W, 84).fill(GREEN);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text('CTR — Collection Drive Report', M, 30);
  doc.fillColor('#efe6ff').font('Helvetica').fontSize(9.5).text('Connect To Recycle', M, 54);

  let y = 110;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(drive.title, M, y, { width: CW });
  y += 26;
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(`Report ID: ${reportNo}`, M, y);
  y += 22;
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(LINE).lineWidth(1).stroke();
  y += 14;

  const row = (label, value) => {
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5).text(label.toUpperCase(), M, y, { width: 140 });
    doc.fillColor(INK).font('Helvetica').fontSize(11).text(value || '—', M + 145, y - 2, { width: CW - 145 });
    y += 22;
  };
  row('Host', drive.hostName);
  row('Date', `${drive.scheduledDate}${drive.timeWindow ? ` · ${drive.timeWindow}` : ''}`);
  row('Location', drive.address);
  row('Accepted categories', (drive.acceptedCategories || []).join(', '));
  row('Status', drive.status);
  row('Total attendees', String(attendees.length));

  y += 10;
  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(12).text('Attendees', M, y);
  y += 20;
  // table header
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9);
  doc.text('#', M, y, { width: 24 });
  doc.text('NAME', M + 26, y, { width: 200 });
  doc.text('EMAIL', M + 230, y, { width: CW - 230 });
  y += 14;
  doc.moveTo(M, y).lineTo(W - M, y).strokeColor(LINE).stroke();
  y += 6;

  doc.font('Helvetica').fontSize(10).fillColor(INK);
  if (attendees.length === 0) {
    doc.fillColor(MUTED).text('No attendees RSVP’d.', M, y);
  } else {
    attendees.forEach((a, i) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 50;
      }
      doc.fillColor(INK).text(String(i + 1), M, y, { width: 24 });
      doc.text(a.name || '—', M + 26, y, { width: 200 });
      doc.fillColor(MUTED).text(a.email || '—', M + 230, y, { width: CW - 230 });
      y += 18;
    });
  }

  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(
    'Generated via CTR — Connect To Recycle.',
    M, doc.page.height - 34, { width: CW, align: 'center' }
  );

  doc.end();
  const buf = await done;
  return buf.toString('base64');
}

/** Generate (or regenerate) a drive's report. Returns metadata, or null. */
async function generate(driveId, generatedBy) {
  const drive = await driveModel.getById(driveId);
  if (!drive) return null;
  const attendees = await driveModel.listAttendees(driveId);
  const reportNo = `CTR-DRV-${new Date().getFullYear()}-${String(driveId).padStart(5, '0')}`;
  const [pdf, xls] = [await buildDrivePdf({ drive, attendees, reportNo }), buildDriveXls({ drive, attendees, reportNo })];
  await reportModel.upsert({
    driveId,
    reportNo,
    generatedBy,
    attendeeCount: attendees.length,
    pdfData: pdf,
    xlsData: xls,
  });
  return reportModel.getByDrive(driveId);
}

/** Best-effort generation on drive completion — never throws. */
function generateSafe(driveId, generatedBy) {
  generate(driveId, generatedBy).catch((err) =>
    logger.error('drive report generation failed (ignored)', { driveId, error: err.message })
  );
}

module.exports = { generate, generateSafe };
