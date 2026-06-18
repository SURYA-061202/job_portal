import UserHeader from '@/components/layout/UserHeader';
import { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import toast from 'react-hot-toast';

const WHATSAPP_NUMBER = '8778326518';
const MAX_HEIGHT = 3;

export default function CareerAssistancePage() {
    const [message, setMessage] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <UserHeader />
            <div className="flex-1 w-full px-6 lg:px-12 py-8">
                <div className="bg-white p-8 sm:p-12 rounded-2xl border border-gray-200 w-full max-w-4xl mx-auto">
                    <h2 className="text-3xl font-bold text-gray-900 mb-3">End-to-End Career Assistance</h2>
                    <p className="text-gray-500 mb-8 text-lg">Ask us anything about your career and we'll get back to you on WhatsApp.</p>
                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={handleChange}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Type your career question..."
                        rows={1}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all resize-none overflow-y-auto"
                    />
                    <div className="flex justify-end mt-3">
                        <button
                            onClick={handleSend}
                            className="bg-gradient-to-r from-primary-600 to-orange-500 text-white px-6 py-3 rounded-xl font-semibold text-base shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
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
