import { sendWelcomeEmail } from './email.js';
import { getPendingWelcomeRows, getSheetRows, updateBienvenidaStatusByRow } from './sheets.js';

export async function processWelcomeEmails({ dryRun = false } = {}) {
  const rows = await getSheetRows();
  const pendingRows = getPendingWelcomeRows(rows);
  const result = {
    scanned: rows.length,
    pending: pendingRows.length,
    sent: 0,
    dryRun,
    preview: pendingRows.slice(0, 10).map((row) => ({
      rowNumber: row.rowNumber,
      email: row.email,
      nombre: row.nombre,
      codigo: row.codigo,
    })),
    failed: [],
  };

  if (dryRun) {
    return result;
  }

  for (const row of pendingRows) {
    try {
      await sendWelcomeEmail(row);
      await updateBienvenidaStatusByRow(row.rowNumber, 'Si');
      result.sent += 1;
    } catch (error) {
      result.failed.push({
        email: row.email,
        message: error.message,
      });
    }
  }

  return result;
}
