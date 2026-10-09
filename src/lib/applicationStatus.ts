/** Mirrors the status vocabulary recruiters set from the Pipeline/Interview tabs (see lib/jobApplications.ts). */
export function getApplicationStatusInfo(status?: string | null): { label: string; className: string } | null {
    if (!status) return null;
    const s = status.toLowerCase();

    if (s.endsWith('rejected') || s === 'declined') {
        return { label: 'Not Selected', className: 'bg-destructive/10 text-destructive border-destructive/20' };
    }
    if (s === 'selected' || s === 'hired') {
        return { label: 'Selected', className: 'bg-brand/10 text-brand border-brand/20' };
    }
    if (s === 'offer' || s === 'offer_sent') {
        return { label: 'Offer Sent', className: 'bg-brand/10 text-brand border-brand/20' };
    }
    const roundMatch = s.match(/^round(\d+)$/);
    if (roundMatch) {
        return { label: `Interview Round ${roundMatch[1]}`, className: 'bg-ink/5 text-ink/80 border-ink/20' };
    }
    if (s === 'technical' || s === 'hr') {
        return { label: 'Interview Round', className: 'bg-ink/5 text-ink/80 border-ink/20' };
    }
    if (s === 'shortlisted') {
        return { label: 'Shortlisted', className: 'bg-ink/5 text-ink/80 border-ink/20' };
    }
    return { label: 'Applied', className: 'bg-ink/5 text-ink/80 border-ink/20' };
}
