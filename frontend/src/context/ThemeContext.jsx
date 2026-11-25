import React, { createContext, useContext, useEffect, useState } from 'react';

const KEY = 'docshield-theme';
const QUERY = '(prefers-color-scheme: light)';
const ThemeContext = createContext({ theme: 'dark', toggle: () => {} });

const systemTheme = () => {
    try {
        return window.matchMedia(QUERY).matches ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
};

// null means "no explicit choice": follow the operating system.
const readSaved = () => {
    try {
        const v = localStorage.getItem(KEY);
        return v === 'light' || v === 'dark' ? v : null;
    } catch {
        return null;
    }
};

export const ThemeProvider = ({ children }) => {
    const [saved, setSaved] = useState(readSaved);
    const [system, setSystem] = useState(systemTheme);
    const theme = saved || system;

    // Follow the OS live (e.g. automatic day/night switching) while there is no explicit choice.
    useEffect(() => {
        let mq;
        try { mq = window.matchMedia(QUERY); } catch { return undefined; }
        const sync = () => setSystem(systemTheme());
        mq.addEventListener('change', sync);
        // Safety net: re-read when the tab regains focus, in case a change event was missed.
        window.addEventListener('focus', sync);
        document.addEventListener('visibilitychange', sync);
        return () => {
            mq.removeEventListener('change', sync);
            window.removeEventListener('focus', sync);
            document.removeEventListener('visibilitychange', sync);
        };
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'light' ? '#f3f7f2' : '#0f4440');
    }, [theme]);

    useEffect(() => {
        try {
            if (saved) localStorage.setItem(KEY, saved);
            else localStorage.removeItem(KEY);
        } catch { /* storage unavailable: the choice lasts until reload */ }
    }, [saved]);

    // Choosing the theme the OS already uses goes back to following the OS, so the
    // default can always be restored from the same button.
    const toggle = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setSaved(next === system ? null : next);
    };

    return <ThemeContext.Provider value={{ theme, toggle, following: saved === null }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
