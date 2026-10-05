import UserHeader from '@/components/layout/UserHeader';

export default function VerifiedProfilePage() {
    return (
        <div className="min-h-screen bg-muted flex flex-col">
            <UserHeader />
            <div className="flex-1 w-full px-6 lg:px-12 py-8 flex flex-col items-center justify-center">
                <div className="bg-surface p-8 rounded-2xl shadow-xl border border-border text-center max-w-md">
                    <h2 className="text-2xl font-bold text-ink mb-4">Verified Profile + Career Assistance</h2>
                    <p className="text-ink/60">This feature is coming soon! Check back later.</p>
                </div>
            </div>
        </div>
    );
}
