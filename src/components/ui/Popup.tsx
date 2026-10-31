/* The popup API is intentionally co-located with its renderer so every call
 * site has exactly one import for all popup behaviour. */
/* eslint-disable react-refresh/only-export-components */
import { useSyncExternalStore } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X, Loader2 } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

/**
 * The single popup module for the whole app. Every surface (CV page,
 * profile, recruitment, auth, ...) reports through this file, and
 * `PopupProvider` renders one stack at the bottom right.
 *
 * Rules: one line tall (fixed height), simple icon + message, longer
 * messages truncate with an ellipsis. Loading popups stay until they are
 * replaced (pass the same `id`) or dismissed.
 *
 *   import popup from '@/components/ui/Popup';
 *   const id = popup.loading('Saving...');
 *   popup.success('Saved', { id });          // replaces the spinner
 *   popup.error('Failed');                    // auto-dismisses in 3s
 */

type PopupKind = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface PopupItem {
    id: string;
    kind: PopupKind;
    message: string;
}

interface PopupOptions {
    /** Replace the popup with this id (used to turn a loading popup into its result). */
    id?: string;
    /** Auto-dismiss delay in ms. Ignored for loading popups. */
    duration?: number;
}

interface PopupApi {
    success: (message: string, options?: PopupOptions) => string;
    error: (message: string, options?: PopupOptions) => string;
    warning: (message: string, options?: PopupOptions) => string;
    info: (message: string, options?: PopupOptions) => string;
    loading: (message: string, options?: PopupOptions) => string;
    dismiss: (id?: string) => void;
}

/** Module-level store so popups work from anywhere (handlers, utils,
 *  non-component code) without a React context lookup. */
let items: PopupItem[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, number>();
let seq = 0;

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const snapshot = () => items;

const put = (kind: PopupKind, message: string, options?: PopupOptions): string => {
    const id = options?.id || `popup-${++seq}`;
    const next: PopupItem = { id, kind, message };
    items = items.some((item) => item.id === id)
        ? items.map((item) => (item.id === id ? next : item))
        : [...items, next];
    emit();

    const running = timers.get(id);
    if (running) window.clearTimeout(running);
    timers.delete(id);
    if (kind !== 'loading') {
        timers.set(id, window.setTimeout(() => popup.dismiss(id), options?.duration ?? 3000));
    }
    return id;
};

export const popup: PopupApi = {
    success: (message, options) => put('success', message, options),
    error: (message, options) => put('error', message, options),
    warning: (message, options) => put('warning', message, options),
    info: (message, options) => put('info', message, options),
    loading: (message, options) => put('loading', message, options),
    dismiss: (id) => {
        if (id) {
            const running = timers.get(id);
            if (running) window.clearTimeout(running);
            timers.delete(id);
            items = items.filter((item) => item.id !== id);
        } else {
            timers.forEach((running) => window.clearTimeout(running));
            timers.clear();
            items = [];
        }
        emit();
    },
};

export default popup;

const ICONS: Record<PopupKind, React.ReactNode> = {
    success: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />,
    error: <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />,
    warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />,
    info: <Info className="h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />,
    loading: <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink/40" aria-hidden="true" />,
};

/** Mount once at the app root; renders the bottom-right popup stack. */
export function PopupProvider({ children }: { children: React.ReactNode }) {
    const skin = useSkin();
    const list = useSyncExternalStore(subscribe, snapshot, snapshot);

    return (
        <>
            {children}
            <div
                className="pointer-events-none fixed bottom-4 right-4 z-[300] flex flex-col items-end gap-2"
                role="status"
                aria-live="polite"
            >
                {list.map((item) => (
                    <div
                        key={item.id}
                        className={`pointer-events-auto flex h-10 w-fit max-w-[340px] items-center gap-2 border px-3 ${skin.edge} ${skin.surface} ${skin.radius} animate-slide-in`}
                    >
                        {ICONS[item.kind]}
                        <span className="min-w-0 flex-1 truncate text-sm text-ink/80">{item.message}</span>
                        {item.kind !== 'loading' && (
                            <button
                                type="button"
                                aria-label="Dismiss"
                                onClick={() => popup.dismiss(item.id)}
                                className={`shrink-0 text-ink/50 hover:bg-ink/5 hover:text-ink ${FOCUS} ${skin.radius}`}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}

/** Hook form of the same API for components that prefer it. */
export function usePopup(): {
    showSuccess: (message: string, duration?: number) => void;
    showError: (message: string, duration?: number) => void;
    showWarning: (message: string, duration?: number) => void;
    showInfo: (message: string, duration?: number) => void;
    showLoading: (message: string) => string;
    hideLoading: (id: string) => void;
} {
    return {
        showSuccess: (message, duration) => {
            popup.success(message, { duration });
        },
        showError: (message, duration) => {
            popup.error(message, { duration });
        },
        showWarning: (message, duration) => {
            popup.warning(message, { duration });
        },
        showInfo: (message, duration) => {
            popup.info(message, { duration });
        },
        showLoading: (message) => popup.loading(message),
        hideLoading: (id) => {
            popup.dismiss(id);
        },
    };
}
