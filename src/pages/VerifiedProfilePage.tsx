import UserHeader from '@/components/layout/UserHeader';

export default function VerifiedProfilePage() {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <UserHeader />
            <div className="flex-1 w-full px-6 lg:px-12 py-8 flex flex-col items-center justify-center">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 text-center max-w-md">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Verified Profile + Career Assistance</h2>
                    <p className="text-gray-500">This feature is coming soon! Check back later.</p>
                </div>
            </div>
        </div>
    );
}
