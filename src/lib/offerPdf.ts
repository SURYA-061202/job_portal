import type { OfferLetter } from '@/types';

/**
 * Offer letter as a PDF, generated in the browser with jsPDF (loaded on demand
 * so the library stays out of the initial bundle). Used by the recruiter for
 * "Download PDF" and available to the candidate from their offer page.
 */
export async function buildOfferPdf(offer: OfferLetter): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureRoom = (needed: number) => {
        if (y + needed > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }
    };

    const line = (text: string, size = 11, style: 'normal' | 'bold' = 'normal', gap = 7) => {
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
        const wrapped = doc.splitTextToSize(text, maxWidth) as string[];
        wrapped.forEach((chunk) => {
            ensureRoom(gap);
            doc.text(chunk, margin, y);
            y += gap;
        });
        y += 1;
    };

    const paragraph = (text: string, size = 10.5) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(size);
        const wrapped = doc.splitTextToSize(text, maxWidth) as string[];
        wrapped.forEach((chunk) => {
            ensureRoom(6);
            doc.text(chunk, margin, y);
            y += 6;
        });
        y += 3;
    };

    const field = (label: string, value: string) => {
        ensureRoom(8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.text(`${label}:`, margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(doc.splitTextToSize(value || '—', maxWidth - 35) as string[], margin + 35, y);
        y += 7;
    };

    // Header
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;
    line(offer.companyName || 'Indian Infra', 18, 'bold', 9);
    line('OFFER LETTER', 13, 'bold', 12);
    line(`Date: ${formatDate(offer.joiningDate)}`, 10, 'normal', 10);

    line(`To,`, 11, 'bold', 7);
    line(offer.candidateName || 'Candidate', 11, 'bold', 6);
    if (offer.candidateEmail) line(offer.candidateEmail, 10, 'normal', 10);

    paragraph(
        `Subject: Offer of employment for the position of ${offer.designation || offer.jobTitle || 'the advertised role'}.`
    );

    paragraph(`Dear ${offer.candidateName || 'Candidate'},`);

    paragraph(
        `We are pleased to offer you the position of ${offer.designation || offer.jobTitle} with ${offer.companyName || 'our organisation'}. ` +
            `We were impressed with your qualifications and believe you will be a valuable addition to our team.`
    );

    field('Position', offer.designation || offer.jobTitle);
    if (offer.salary) field('Compensation', offer.salary);
    if (offer.joiningDate) field('Joining date', formatDate(offer.joiningDate));
    if (offer.location) field('Location', offer.location);

    if (offer.notes) {
        y += 2;
        line('Terms & conditions', 11, 'bold', 7);
        paragraph(offer.notes);
    }

    paragraph(
        'Please sign below to confirm your acceptance of this offer, using the link sent to your email address, ' +
            'and reply to this letter at the earliest. We look forward to welcoming you aboard.'
    );

    y += 6;
    ensureRoom(40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.text('For ' + (offer.companyName || 'Indian Infra'), margin, y);
    y += 22;
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin + 55, y);
    y += 5;
    doc.text('Authorised Signatory', margin, y);

    // Candidate acceptance block (only meaningful once signed).
    if (offer.signature) {
        y += 12;
        ensureRoom(30);
        doc.setFont('helvetica', 'bold');
        doc.text('Accepted by the candidate', margin, y);
        y += 7;
        doc.setFont('helvetica', 'normal');
        doc.text(`Name: ${offer.signature.name}`, margin, y);
        y += 6;
        doc.text(`Signed on: ${new Date(offer.signature.at).toLocaleString('en-IN')}`, margin, y);
    }

    const safeName = (offer.candidateName || 'candidate').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
    doc.save(`offer-letter-${safeName}.pdf`);
}

/** `2026-11-25` -> `25 Nov 2026`; anything else is passed through. */
function formatDate(value: string): string {
    if (!value) return '—';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
