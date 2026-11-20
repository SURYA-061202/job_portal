import type { RecruitmentRequest } from '@/types';
import { getPostLifecycle, describeExpiry } from '@/lib/postLifecycle';
import type { PostStatus } from '@/types';

const TONE: Record<PostStatus, string> = {
    draft: 'border-sky-300 bg-sky-50 text-sky-800',
    active: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    paused: 'border-amber-300 bg-amber-50 text-amber-800',
    expired: 'border-rose-300 bg-rose-50 text-rose-800',
    closed: 'border-neutral-300 bg-neutral-100 text-neutral-700',
};

type Lifecycle = Pick<RecruitmentRequest, 'status' | 'expiresAt'>;

/** Status pill for a post: Active, Paused, Expired or Closed. An active post about to lapse reads "Expiring soon". */
export default function PostStatusBadge({ post, className = '' }: { post: Lifecycle; className?: string }) {
    const lc = getPostLifecycle(post);
    const soon = lc.expiringSoon;
    const tone = soon ? 'border-amber-300 bg-amber-50 text-amber-800' : TONE[lc.status];
    return (
        <span
            title={describeExpiry(post)}
            className={`inline-flex items-center whitespace-nowrap rounded-lg border px-2 py-0.5 text-[11px] font-bold leading-4 ${tone} ${className}`}
        >
            {soon ? 'Expiring soon' : lc.label}
        </span>
    );
}
