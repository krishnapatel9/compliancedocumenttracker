import Icon from '../components/Icon';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(1);

    const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

    const push = useCallback((kind, message) => {
        const id = nextId.current++;
        setToasts((t) => [...t, { id, kind, message }]);
        setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
    }, [dismiss]);

    const api = {
        success: (m) => push('success', m),
        error: (m) => push('error', m),
        info: (m) => push('info', m),
    };

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="toasts" role="status" aria-live="polite">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast ${t.kind}`}>
                        <span>{t.message}</span>
                        <button onClick={() => dismiss(t.id)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => useContext(ToastContext);
