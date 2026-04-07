import React, { useState, useCallback, createContext, useContext } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

const ToastContext = createContext(null);

const TOAST_CONFIG = {
  success: { icon: CheckCircleIcon, bg: 'bg-white', border: 'border-success/30', text: 'text-neutral-800', iconColor: 'text-success' },
  error: { icon: XCircleIcon, bg: 'bg-white', border: 'border-error/30', text: 'text-neutral-800', iconColor: 'text-error' },
  warning: { icon: ExclamationTriangleIcon, bg: 'bg-white', border: 'border-warning/30', text: 'text-neutral-800', iconColor: 'text-warning' },
  info: { icon: InformationCircleIcon, bg: 'bg-white', border: 'border-info/30', text: 'text-neutral-800', iconColor: 'text-info' },
};

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-6 right-6 z-toast flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => {
        const config = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;
        const Icon = config.icon;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg max-w-sm animate-slide-in-right ${config.bg} ${config.border}`}
          >
            <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
            <p className={`text-sm font-medium flex-1 ${config.text}`}>{toast.message}</p>
            <button
              onClick={() => onDismiss(toast.id)}
              className={`flex-shrink-0 ${config.iconColor} hover:opacity-70`}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 0),
    warn: (msg) => addToast(msg, 'warning', 5000),
    info: (msg) => addToast(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
