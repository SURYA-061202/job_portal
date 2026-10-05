import { useSkin } from '@/styles/skin';

interface TabHeaderProps {
    title: string;
    subtitle?: string;
}

export default function TabHeader({ title, subtitle }: TabHeaderProps) {
    const skin = useSkin();
    return (
        <div className="bg-brand/10 border-b border-brand/20 px-6 py-4 mb-6 rounded-t-2xl">
            <h1 className={skin.heading}>
                {title}
            </h1>
            {subtitle && (
                <p className="text-sm text-ink/60 mt-1">{subtitle}</p>
            )}
        </div>
    );
}
