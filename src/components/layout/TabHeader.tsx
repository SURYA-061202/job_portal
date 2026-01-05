interface TabHeaderProps {
    title: string;
    subtitle?: string;
}

export default function TabHeader({ title, subtitle }: TabHeaderProps) {
    return (
        <div className="bg-gradient-to-r from-orange-50 to-primary-50 border-b border-orange-100 px-6 py-4 mb-6 rounded-t-xl">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent">
                {title}
            </h1>
            {subtitle && (
                <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            )}
        </div>
    );
}
