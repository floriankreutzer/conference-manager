import { t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';
import { downloadCsvText } from '../shared/csv-download.js';
import { closeDetachedPrintWindow, openDetachedPrintWindow } from '../shared/detached-print-window.js';
import { cateringOrderDocumentCsv, createCateringOrderDocument,
  requireCurrentCateringDocumentSource } from './catering-order-document.js';
import { presentCateringPrintDocument } from './catering-document-print.js';

export function createCateringDocumentActions({ root, view, adapter, isCurrent, isAvailable, setBusy, onFailure, onStatus }) {
  const csv = button(t('cateringDocuments.csv'), { dataset: { orderWrite: 'document' } });
  const pdf = button(t('cateringDocuments.pdf'), { dataset: { orderWrite: 'document' } });
  root.append(el('h4', { text: t('cateringDocuments.title') }), el('p', { text: t('cateringDocuments.notice') }),
    el('div', { className: 'button-row' }, [csv,pdf]));
  const orderId = view.order.orderId;
  async function currentSource() {
    const loaded = await adapter.loadOrder(orderId);
    return isCurrent() ? requireCurrentCateringDocumentSource(view, loaded, orderId) : null;
  }
  async function validateForPrint() {
    if (!isCurrent() || !isAvailable()) return false;
    setBusy(true);
    try { return !!await currentSource(); }
    finally { if (isCurrent()) setBusy(false); }
  }
  async function prepare(kind) {
    if (!isCurrent() || !isAvailable()) return;
    const restoreFocus = kind === 'csv' && document.activeElement === csv;
    const printWindow = kind === 'pdf' ? openDetachedPrintWindow() : null;
    if (kind === 'pdf' && !printWindow) { onStatus(t('cateringDocuments.popupBlocked')); return; }
    setBusy(true);
    try {
      const current = await currentSource();
      if (!current) { closeDetachedPrintWindow(printWindow); return; }
      const generatedAt = new Date();
      if (kind === 'csv') {
        const text = cateringOrderDocumentCsv(current, { orderId, generatedAt, notice: t('cateringDocuments.notice') });
        if (!isCurrent()) return;
        downloadCsvText(text, `catering-${orderId}-v${current.order.orderVersion}.csv`);
      } else await presentCateringPrintDocument({ printWindow, value: createCateringOrderDocument(current, { orderId, generatedAt }),
        isCurrent, validateForPrint, onFailure });
      if (isCurrent()) onStatus(t('cateringDocuments.prepared'));
    } catch (error) { closeDetachedPrintWindow(printWindow); if (isCurrent()) onFailure(error); }
    finally {
      if (isCurrent()) {
        setBusy(false);
        if (restoreFocus && !csv.disabled && [document.body,csv].includes(document.activeElement)) csv.focus();
      }
    }
  }
  csv.addEventListener('click', () => { void prepare('csv'); });
  pdf.addEventListener('click', () => { void prepare('pdf'); });
}
