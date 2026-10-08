import { useSkin } from '@/styles/skin';

/** Single pulsing placeholder bar. Size/shape comes from className. */
export function Skeleton({ className = '' }: { className?: string }) {
    const skin = useSkin();
    return <div className={`animate-pulse ${skin.skeleton} rounded-lg ${className}`} />;
}

/** Placeholder shaped like a UserJobCard (jobs, applications, matching lists). */
export function JobCardSkeleton() {
    const skin = useSkin();
    return (
        <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-4 md:p-6 flex flex-col gap-4`}>
            <Skeleton className="h-5 w-1/2" />
            <div className="flex flex-wrap gap-2 md:gap-3">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 border-t ${skin.edge} pt-4`}>
                <div className="flex flex-wrap gap-1.5">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-14" />
                </div>
                <Skeleton className="h-8 w-20" />
            </div>
        </div>
    );
}

/** Stack of job-card skeletons for list loading states. */
export function JobListSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div className="flex flex-col gap-4 md:gap-6">
            {Array.from({ length: count }).map((_, i) => (
                <JobCardSkeleton key={i} />
            ))}
        </div>
    );
}

/** Placeholder shaped like a notification row. */
export function NotificationSkeleton() {
    const skin = useSkin();
    return (
        <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} p-4 sm:p-6`}>
            <div className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-24" />
                </div>
            </div>
        </div>
    );
}

/** Stack of notification skeletons. */
export function NotificationListSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className="space-y-4">
            {Array.from({ length: count }).map((_, i) => (
                <NotificationSkeleton key={i} />
            ))}
        </div>
    );
}

/** Profile sidebar card: cover strip, avatar, and name/details lines. */
export function ProfileCardSkeleton() {
    const skin = useSkin();
    return (
        <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} overflow-hidden bg-surface`}>
            <div className={`h-24 ${skin.skeleton} animate-pulse`} />
            <div className="p-6 flex flex-col items-center gap-3">
                <div className={`w-20 h-20 rounded-full ${skin.skeleton} animate-pulse border-4 border-surface -mt-10 relative`} />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
                <div className="w-full pt-3 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
            </div>
        </div>
    );
}

/** Generic content card: heading bar plus body lines. */
export function ContentCardSkeleton({ lines = 3 }: { lines?: number }) {
    const skin = useSkin();
    return (
        <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} p-6 space-y-4`}>
            <Skeleton className="h-5 w-1/3" />
            <div className="space-y-3">
                {Array.from({ length: lines }).map((_, i) => (
                    <Skeleton key={i} className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
                ))}
            </div>
        </div>
    );
}
