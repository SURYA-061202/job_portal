import { useState, useCallback, createContext, useContext } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X, Loader2 } from 'lucide-react';

type PopupType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface PopupItem {
  id: string;
  type: PopupType;
  message: string;
  duration?: number;
}

interface PopupContextValue {
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  showLoading: (message: string) => string;
  hideLoading: (id: string) => void;
}

const PopupContext = createContext<PopupContextValue | null>(null);

let globalPopupId = 0;

export function PopupProvider({ children }: { children: React.ReactNode }) {
  const [popups, setPopups] = useState<PopupItem[]>([]);

  const addPopup = useCallback((type: PopupType, message: string, duration?: number) => {
    const id = `popup-${++globalPopupId}`;
    const item: PopupItem = { id, type, message, duration };
    setPopups(prev => [...prev, item]);

    if (type !== 'loading' && duration !== 0) {
      setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== id));
      }, duration || 3000);
    }

    return id;
  }, []);

  const hidePopup = useCallback((id: string) => {
    setPopups(prev => prev.filter(p => p.id !== id));
  }, []);

  const value: PopupContextValue = {
    showSuccess: useCallback((msg, dur) => addPopup('success', msg, dur), [addPopup]),
    showError: useCallback((msg, dur) => addPopup('error', msg, dur), [addPopup]),
    showWarning: useCallback((msg, dur) => addPopup('warning', msg, dur), [addPopup]),
    showInfo: useCallback((msg, dur) => addPopup('info', msg, dur), [addPopup]),
    showLoading: useCallback((msg) => addPopup('loading', msg, 0), [addPopup]),
    hideLoading: useCallback((id) => hidePopup(id), [hidePopup]),
  };

  const iconMap: Record<PopupType, React.ReactNode> = {
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
    error: <XCircle className="h-5 w-5 text-red-500" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
    loading: <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />,
  };

  return (
    <PopupContext.Provider value={value}>
      {children}

      {/* Toast Popups - Bottom Right */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {popups.map((popup) => (
          <div
            key={popup.id}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white min-w-[280px] max-w-[400px] animate-slide-in"
          >
            {iconMap[popup.type]}
            <span className="text-sm text-gray-700 flex-1">{popup.message}</span>
            {popup.type !== 'loading' && (
              <button
                onClick={() => hidePopup(popup.id)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </PopupContext.Provider>
  );
}

export function usePopup(): PopupContextValue {
  const ctx = useContext(PopupContext);
  if (!ctx) throw new Error('usePopup must be used within PopupProvider');
  return ctx;
}
