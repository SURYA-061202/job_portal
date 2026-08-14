/** Mirrors the status vocabulary recruiters set from the Pipeline/Interview tabs (see lib/jobApplications.ts). */
export function getApplicationStatusInfo(status?: string | null): { label: string; className: string } | null {
    if (!status) return null;
    const s = status.toLowerCase();

    if (s.endsWith('rejected') || s === 'declined') {
        return { label: 'Not Selected', className: 'bg-red-50 text-red-600 border-red-100' };
    }
    if (s === 'selected' || s === 'hired') {
        return { label: 'Selected', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    }
    if (s === 'offer' || s === 'offer_sent') {
        return { label: 'Offer Sent', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    }
    const roundMatch = s.match(/^round(\d+)$/);
    if (roundMatch) {
        return { label: `Interview Round ${roundMatch[1]}`, className: 'bg-violet-50 text-violet-700 border-violet-100' };
    }
    if (s === 'technical' || s === 'hr') {
        return { label: 'Interview Round', className: 'bg-violet-50 text-violet-700 border-violet-100' };
    }
    if (s === 'shortlisted') {
        return { label: 'Shortlisted', className: 'bg-blue-50 text-blue-700 border-blue-100' };
    }
    return { label: 'Applied', className: 'bg-gray-100 text-gray-600 border-gray-200' };
}
