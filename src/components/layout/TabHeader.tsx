interface TabHeaderProps {
    title: string;
    subtitle?: string;
}

export default function TabHeader({ title, subtitle }: TabHeaderProps) {
    return (
        <div className="bg-brand/10 border-b border-brand/20 px-6 py-4 mb-6 rounded-t-xl">
            <h1 className="text-2xl font-bold bg-brand bg-clip-text text-transparent">
                {title}
            </h1>
            {subtitle && (
                <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            )}
        </div>
    );
}
