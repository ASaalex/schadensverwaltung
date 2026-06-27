import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { OrderDetail } from '@/hooks/useOrderDetail';

const ORDER_STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf', versendet: 'Versendet', angenommen: 'Angenommen',
  bearbeitung: 'In Bearbeitung', fertiggemeldet: 'Fertiggemeldet',
  abgeschlossen: 'Abgeschlossen', storniert: 'Storniert',
};
const POSITION_STATUS_LABEL: Record<string, string> = {
  offen: 'Offen', bearbeitung: 'In Arbeit', erledigt: 'Erledigt', uebersprungen: 'Übersprungen',
};

/** Erzeugt ein kompaktes Auftrags-PDF und liefert es als Base64 (ohne data:-Präfix). */
export function buildOrderPdfBase64(order: OrderDetail): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 16;
  let y = M;

  doc.setFontSize(10); doc.setTextColor(100);
  doc.text('Arbeitsauftrag', M, y); y += 7;
  doc.setFontSize(20); doc.setTextColor(15);
  doc.text(order.code, M, y); y += 9;
  doc.setFontSize(14);
  doc.text(order.title, M, y); y += 8;

  if (order.description) {
    doc.setFontSize(10); doc.setTextColor(60);
    const lines = doc.splitTextToSize(order.description, 180);
    doc.text(lines, M, y); y += lines.length * 5 + 2;
  }

  const period = order.planned_start_date
    ? new Date(order.planned_start_date).toLocaleDateString('de-DE') +
      (order.planned_end_date && order.planned_end_date !== order.planned_start_date
        ? ' – ' + new Date(order.planned_end_date).toLocaleDateString('de-DE') : '')
    : '—';
  doc.setFontSize(10); doc.setTextColor(90);
  doc.text(`Firma: ${order.assigned_company_name ?? '—'}`, M, y); y += 5;
  doc.text(`Status: ${ORDER_STATUS_LABEL[order.status] ?? order.status}`, M, y); y += 5;
  doc.text(`Zeitraum: ${period}`, M, y); y += 6;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Schaden', 'Kategorie', 'Adresse', 'Termin', 'Status']],
    body: order.positions.map((p) => [
      String(p.sort_order),
      p.damage_code ?? '—',
      p.damage_category ?? '—',
      p.damage_address || '—',
      p.planned_date ? new Date(p.planned_date).toLocaleDateString('de-DE') : '—',
      POSITION_STATUS_LABEL[p.status] ?? p.status,
    ]),
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: M, right: M },
  });

  // jsPDF liefert base64 inkl. "data:application/pdf;filename=...;base64," → nur den Teil danach
  const dataUri = doc.output('datauristring');
  return dataUri.substring(dataUri.indexOf('base64,') + 'base64,'.length);
}
