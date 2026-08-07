// Dependency-free Excel export: an Office-HTML document Excel opens natively
// (served/saved as .xls). Returned base64-encoded.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function buildDriveXls({ drive, attendees, reportNo }) {
  const rows = attendees
    .map(
      (a, i) =>
        `<tr><td>${i + 1}</td><td>${esc(a.name)}</td><td>${esc(a.email)}</td><td>${esc(a.rsvpAt)}</td></tr>`
    )
    .join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Drive Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>td,th{border:1px solid #ccc;padding:4px 8px;font-family:Arial}th{background:#eef1ee}</style>
</head>
<body>
  <table>
    <tr><td colspan="4"><b>Collection Drive Report — ${esc(reportNo)}</b></td></tr>
    <tr><td><b>Title</b></td><td colspan="3">${esc(drive.title)}</td></tr>
    <tr><td><b>Host</b></td><td colspan="3">${esc(drive.hostName || '')}</td></tr>
    <tr><td><b>Date</b></td><td colspan="3">${esc(drive.scheduledDate)} ${esc(drive.timeWindow || '')}</td></tr>
    <tr><td><b>Location</b></td><td colspan="3">${esc(drive.address)}</td></tr>
    <tr><td><b>Accepted</b></td><td colspan="3">${esc((drive.acceptedCategories || []).join(', '))}</td></tr>
    <tr><td><b>Total attendees</b></td><td colspan="3">${attendees.length}</td></tr>
    <tr><td colspan="4"></td></tr>
    <tr><th>#</th><th>Name</th><th>Email</th><th>RSVP at</th></tr>
    ${rows || '<tr><td colspan="4">No attendees</td></tr>'}
  </table>
</body></html>`;

  return Buffer.from(html, 'utf8').toString('base64');
}

module.exports = { buildDriveXls };
