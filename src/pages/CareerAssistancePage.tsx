import UserHeader from '@/components/layout/UserHeader';
import { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSkin, FOCUS } from '@/styles/skin';

const WHATSAPP_NUMBER = '8778326518';
const MAX_HEIGHT = 3;

export default function CareerAssistancePage() {
    const [message, setMessage] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const skin = useSkin();

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setMessage(e.target.value);
        const el = e.target;
        el.style.height = 'auto';
        const maxPx = MAX_HEIGHT * 24;
        el.style.height = Math.min(el.scrollHeight, maxPx) + 'px';
    };

    const handleSend = () => {
        const trimmed = message.trim();
        if (!trimmed) {
            toast.error('Please enter your message');
            return;
        }
        const encoded = encodeURIComponent(trimmed);
        const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
        if (isMobile) {
            window.location.href = `whatsapp://send?phone=${WHATSAPP_NUMBER}&text=${encoded}`;
        } else {
            window.open(`https://web.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encoded}`, '_blank');
        }
        setMessage('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        toast.success(isMobile ? 'Opening WhatsApp...' : 'Opening WhatsApp Web...');
    };

    return (
        <div className={`min-h-screen ${skin.canvas} flex flex-col`}>
            <UserHeader />
            <div className="flex-1 w-full px-6 lg:px-12 py-8">
                <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} p-8 sm:p-12 w-full max-w-4xl mx-auto`}>
                    <h2 className={`${skin.heading} mb-3`}>End-to-End Career Assistance</h2>
                    <p className="text-ink/60 mb-8 text-lg">Ask us anything about your career and we'll get back to you on WhatsApp.</p>
                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={handleChange}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Type your career question..."
                        rows={1}
                        className={`w-full px-4 py-3 resize-none overflow-y-auto ${skin.field} ${FOCUS}`}
                    />
                    <div className="flex justify-end mt-3">
                        <button
                            onClick={handleSend}
                            className={`inline-flex items-center gap-2 cursor-pointer ${skin.cta} ${FOCUS}`}
                        >
                            <Send className="w-4 h-4" />
                            Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
