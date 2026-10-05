import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

interface CustomDropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    className?: string;
}

export default function CustomDropdown({ value, onChange, options, placeholder, className = '' }: CustomDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const skin = useSkin();

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={dropdownRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full px-4 py-2 ${skin.field} ${FOCUS} cursor-pointer text-left flex items-center justify-between`}
            >
                <span className="truncate">{selectedOption?.label || placeholder}</span>
                <ChevronDown className={`w-4 h-4 text-ink/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className={`absolute z-50 w-full mt-1 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} max-h-60 overflow-y-auto`}>
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-brand hover:text-brand-foreground ${FOCUS} ${option.value === value ? 'bg-brand/10 text-ink font-medium' : 'text-ink/80'
                                }`}
                            style={{ whiteSpace: 'normal', wordWrap: 'break-word' }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
