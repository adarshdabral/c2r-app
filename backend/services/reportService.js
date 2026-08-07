const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const F = require('../config/reportFactors');
const reportModel = require('../models/reportModel');
const { findUserById } = require('../models/userModel');
const logger = require('../utils/logger');

const round = (n) => Math.round(Number(n) * 100) / 100;

// Environmental metrics derived from kg recycled (rule-based, config-driven).
function metricsForKg(kg) {
  const q = Math.max(0, Number(kg) || 0);
  const co2 = q * F.co2KgPerKg;
  return {
    quantityKg: round(q),
    co2AvoidedKg: round(co2),
    treesEquivalent: round(co2 * F.treesPerCo2Kg),
    energySavedKwh: round(q * F.energyKwhPerKg),
    waterSavedLiters: round(q * F.waterLitersPerKg),
    landfillDivertedKg: round(q * F.landfillKgPerKg),
  };
}

// Rule-based insights (no external AI) — plain, specific statements.
function buildInsights(m, count) {
  const out = [];
  if (count != null) out.push(`Completed ${count} recycling ${count === 1 ? 'transaction' : 'transactions'}.`);
  out.push(`Recycled ${m.quantityKg} kg of e-waste, avoiding about ${m.co2AvoidedKg} kg of CO₂ emissions.`);
  out.push(`That's roughly equivalent to ${m.treesEquivalent} tree-years of carbon absorption.`);
  out.push(`Saved an estimated ${m.energySavedKwh} kWh of energy and ${m.waterSavedLiters} L of water.`);
  out.push(`Diverted ${m.landfillDivertedKg} kg of material from landfill.`);
  return out;
}

async function buildReportPdf({ reportNo, title, subtitle, userName, metrics, insights }) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res, rej) => {
    doc.on('end', () => res(Buffer.concat(chunks)));
    doc.on('error', rej);
  });

  const GREEN = '#0f9e6a';
  const INK = '#14181a';
  const MUTED = '#6c7278';
  const W = doc.page.width;
  const M = 50;
  const CW = W - M * 2;

  doc.rect(0, 0, W, 84).fill(GREEN);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text('CTR — Environmental Impact Report', M, 30);
  doc.fillColor('#daf6ea').font('Helvetica').fontSize(9.5).text('Connect To Recycle', M, 54);

  let y = 108;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(title, M, y, { width: CW });
  y += 24;
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(
    `${subtitle} · ${userName || ''} · Report ID: ${reportNo}`,
    M, y, { width: CW }
  );
  y += 26;

  // Metric cards (2 cols x 3 rows).
  const cells = [
    ['E-waste recycled', `${metrics.quantityKg} kg`],
    ['CO₂ avoided', `${metrics.co2AvoidedKg} kg`],
    ['Trees equivalent', `${metrics.treesEquivalent}`],
    ['Energy saved', `${metrics.energySavedKwh} kWh`],
    ['Water saved', `${metrics.waterSavedLiters} L`],
    ['Landfill diverted', `${metrics.landfillDivertedKg} kg`],
  ];
  const colW = (CW - 12) / 2;
  cells.forEach((c, i) => {
    const cx = M + (i % 2) * (colW + 12);
    const cy = y + Math.floor(i / 2) * 62;
    doc.roundedRect(cx, cy, colW, 54, 10).fill('#f4f6f4');
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5).text(c[0].toUpperCase(), cx + 14, cy + 12);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(c[1], cx + 14, cy + 26);
  });
  y += 62 * 3 + 8;

  doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(12).text('Insights', M, y);
  y += 20;
  doc.font('Helvetica').fontSize(10.5).fillColor(INK);
  insights.forEach((line) => {
    doc.text(`•  ${line}`, M, y, { width: CW });
    y += doc.heightOfString(`•  ${line}`, { width: CW, size: 10.5 }) + 6;
  });

  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(
    'Environmental figures are estimates from configured conversion factors. Generated via CTR.',
    M, doc.page.height - 40, { width: CW, align: 'center' }
  );

  doc.end();
  const buf = await done;
  return buf.toString('base64');
}

const uniqueNo = (prefix) =>
  `CTR-RPT-${prefix}-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/**
 * Auto-generate a transaction report when a bulk producer's pickup completes.
 * `request` is a mapped pickup (userId, id, actualQuantityKg, wasteQuantity,
 * userName). No-op for non-bulk-producers or if already generated.
 */
async function generateTransactionReport(request) {
  const user = await findUserById(request.userId);
  if (!user || user.user_type !== 'bulk_producer') return null;
  if (await reportModel.existsForPickup(request.id)) return null;

  const kg = request.actualQuantityKg != null ? request.actualQuantityKg : request.wasteQuantity;
  const metrics = metricsForKg(kg);
  const insights = buildInsights(metrics, 1);
  const reportNo = `CTR-RPT-P-${new Date().getFullYear()}-${String(request.id).padStart(5, '0')}`;
  const title = `Transaction Report — Pickup #${request.id}`;
  const pdfData = await buildReportPdf({
    reportNo,
    title,
    subtitle: 'Single collection',
    userName: request.userName || user.name,
    metrics,
    insights,
  });
  const id = await reportModel.create({
    userId: request.userId,
    reportType: 'transaction',
    reportNo,
    pickupId: request.id,
    title,
    totalQuantityKg: metrics.quantityKg,
    totalPickups: 1,
    metrics,
    insights,
    pdfData,
  });
  logger.info('transaction report generated', { reportId: id, pickupId: request.id });
  return reportModel.getById(id);
}

function generateTransactionReportSafe(request) {
  generateTransactionReport(request).catch((err) =>
    logger.error('transaction report failed (ignored)', { pickupId: request?.id, error: err.message })
  );
}

const pad2 = (n) => String(n).padStart(2, '0');
const fmt = (d, end) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${end ? '23:59:59' : '00:00:00'}`;

function rangeFor(type, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (type === 'monthly') return [new Date(y, m, 1), new Date(y, m + 1, 0)];
  if (type === 'quarterly') {
    const q = Math.floor(m / 3) * 3;
    return [new Date(y, q, 1), new Date(y, q + 3, 0)];
  }
  return [new Date(y, 0, 1), new Date(y, 11, 31)]; // annual
}

/** On-demand period summary for a bulk producer. */
async function generateSummary(userId, type) {
  if (!['monthly', 'quarterly', 'annual'].includes(type)) {
    const e = new Error('Invalid report type');
    e.statusCode = 400;
    throw e;
  }
  const user = await findUserById(userId);
  const [start, end] = rangeFor(type);
  const { totalKg, count } = await reportModel.aggregateCompleted(userId, fmt(start), fmt(end, true));
  const metrics = metricsForKg(totalKg);
  const insights = buildInsights(metrics, count);
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const reportNo = uniqueNo(type.slice(0, 3).toUpperCase());
  const title = `${label} Impact Summary`;
  const pdfData = await buildReportPdf({
    reportNo,
    title,
    subtitle: `${fmt(start).slice(0, 10)} to ${fmt(end).slice(0, 10)}`,
    userName: user?.name,
    metrics,
    insights,
  });
  const id = await reportModel.create({
    userId,
    reportType: type,
    reportNo,
    pickupId: null,
    periodStart: fmt(start).slice(0, 10),
    periodEnd: fmt(end).slice(0, 10),
    title,
    totalQuantityKg: metrics.quantityKg,
    totalPickups: count,
    metrics,
    insights,
    pdfData,
  });
  return reportModel.getById(id);
}

module.exports = { generateTransactionReport, generateTransactionReportSafe, generateSummary, metricsForKg };
