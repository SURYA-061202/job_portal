import type { FireDate } from '@/types';
import { toDate as toFireDate } from '@/lib/dates';
import { jsPDF } from 'jspdf';
import type { PaymentInvoice } from '@/types';

/**
 * Builds the subscription invoice PDF from the invoice the server froze on the
 * payment (functions/src/payments.ts) and saves it. Loaded on demand from the
 * Payment history panel, so jsPDF never ships with the main bundle.
 *
 * jsPDF's built-in fonts have no rupee glyph, so amounts read "INR 1,999.00".
 */

type DateLike = FireDate;
const toDate = (v: DateLike): Date => toFireDate(v) ?? new Date(NaN);
const fmtDate = (v: DateLike) =>
    toDate(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const fmtAmount = (paise: number, currency: string) =>
    `${currency || 'INR'} ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METHOD_LABEL: Record<string, string> = {
    upi: 'UPI',
    card: 'Card',
    netbanking: 'Net banking',
    wallet: 'Wallet',
    emi: 'EMI',
    paylater: 'Pay later',
};
const methodLabel = (m: string) => METHOD_LABEL[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Online');

const BRAND: [number, number, number] = [249, 115, 22];
const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];

export function downloadInvoicePdf(inv: PaymentInvoice): void {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const M = 48;
    const right = W - M;
    let y = M;

    // Brand bar
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, W, 6, 'F');

    // Title + number (left), seller (right)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(...INK);
    doc.text('INVOICE', M, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(inv.number, M, y + 36);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(inv.seller.name || 'Indian Infra Jobs', right, y + 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    let sy = y + 30;
    const sellerLines = [
        ...(inv.seller.address ? doc.splitTextToSize(inv.seller.address, 220) : []),
        inv.seller.gstin ? `GSTIN: ${inv.seller.gstin}` : '',
        inv.seller.email,
    ].filter(Boolean) as string[];
    sellerLines.forEach((line) => {
        doc.text(line, right, sy, { align: 'right' });
        sy += 13;
    });

    y = Math.max(y + 64, sy + 12);
    doc.setDrawColor(...LINE);
    doc.line(M, y, right, y);
    y += 26;

    // Billed to (left) and invoice facts (right)
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('BILLED TO', M, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(inv.billedTo.name || inv.billedTo.email, M, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    let by = y + 31;
    [inv.billedTo.company, inv.billedTo.email, inv.billedTo.phone].filter(Boolean).forEach((line) => {
        doc.text(line, M, by);
        by += 13;
    });

    const facts: [string, string][] = [
        ['Invoice date', fmtDate(inv.issuedAt)],
        ['Payment method', methodLabel(inv.method)],
        ['Status', 'Paid'],
    ];
    let fy = y;
    facts.forEach(([label, value]) => {
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        doc.text(label, right - 170, fy);
        doc.setTextColor(...INK);
        doc.text(value, right, fy, { align: 'right' });
        fy += 15;
    });

    y = Math.max(by, fy) + 22;

    // Line items
    const colPeriod = M + 250;
    doc.setFillColor(248, 250, 252);
    doc.rect(M, y, right - M, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('Description', M + 10, y + 17);
    doc.text('Period', colPeriod, y + 17);
    doc.text('Amount', right - 10, y + 17, { align: 'right' });
    y += 26;

    doc.setFont('helvetica', 'normal');
    const desc = doc.splitTextToSize(inv.description, colPeriod - M - 24) as string[];
    const rowH = Math.max(30, desc.length * 13 + 17);
    doc.text(desc, M + 10, y + 19);
    doc.text(`${fmtDate(inv.periodStart)} - ${fmtDate(inv.periodEnd)}`, colPeriod, y + 19);
    doc.text(fmtAmount(inv.amount, inv.currency), right - 10, y + 19, { align: 'right' });
    y += rowH;
    doc.setDrawColor(...LINE);
    doc.line(M, y, right, y);

    // Total
    y += 24;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Total paid', right - 170, y);
    doc.text(fmtAmount(inv.amount, inv.currency), right - 10, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Inclusive of all applicable taxes.', right - 10, y + 15, { align: 'right' });

    // Footer
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE);
    doc.line(M, H - 70, right, H - 70);
    doc.setFontSize(8);
    doc.text(`Payment reference: ${inv.razorpayPaymentId}`, M, H - 52);
    doc.text('This is a computer-generated invoice and does not require a signature.', M, H - 40);

    doc.save(`${inv.number}.pdf`);
}
