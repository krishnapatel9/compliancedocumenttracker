import React, { createContext, useState, useContext, useCallback, useMemo, useRef } from 'react';
import { readJson } from '../utils/format';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || '';
const url = (path) => (path.startsWith('http') ? path : `${API_BASE}${path}`);

// Free hosts sleep; the first request can take ~50 s while the server wakes up.
const LOGIN_TIMEOUT_MS = 70000;
// Log out 60 s before the token actually expires to prevent sending doomed requests.
const EXPIRY_BUFFER_MS = 60_000;

const decodeToken = (token) => {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp && payload.exp * 1000 < Date.now()) return null;
        return { id: payload.id, email: payload.email, exp: payload.exp };
    } catch {
        return null;
    }
};

const isTokenFresh = (token) => {
    if (!token) return false;
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (!payload.exp) return true;
        return payload.exp * 1000 - Date.now() > EXPIRY_BUFFER_MS;
    } catch {
        return false;
    }
};

const loadStoredToken = () => {
    try {
        const stored = localStorage.getItem('token');
        return stored && decodeToken(stored) ? stored : null;
    } catch {
        return null;
    }
};

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(loadStoredToken);
    // Memoize decoded admin so components don't re-render on unrelated state changes.
    const admin = useMemo(() => (token ? decodeToken(token) : null), [token]);
    // Track auto-logout timer so we can clear it on manual logout.
    const expiryTimer = useRef(null);

    const persist = useCallback((value) => {
        setToken(value);
        try {
            if (value) localStorage.setItem('token', value);
            else localStorage.removeItem('token');
        } catch { /* storage unavailable (private mode): session lasts until reload */ }
    }, []);

    const logout = useCallback(() => {
        clearTimeout(expiryTimer.current);
        persist(null);
    }, [persist]);

    // Schedule proactive logout when a token is stored, so the UI reflects
    // expiry without waiting for the first failed request after the deadline.
    const scheduleExpiry = useCallback((tok) => {
        clearTimeout(expiryTimer.current);
        try {
            const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (!payload.exp) return;
            const msUntilExpiry = payload.exp * 1000 - Date.now() - EXPIRY_BUFFER_MS;
            if (msUntilExpiry > 0) {
                expiryTimer.current = setTimeout(() => persist(null), msUntilExpiry);
            }
        } catch { /* non-standard token: skip proactive logout */ }
    }, [persist]);

    const login = async (email, password) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
        try {
            const response = await fetch(url('/api/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                signal: controller.signal
            });
            const data = await readJson(response);
            if (!response.ok) {
                throw new Error(data.error || `Login failed (server responded ${response.status}).`);
            }
            persist(data.token);
            // Use server-provided expiry when available; fall back to decoding.
            if (data.expiresAt) {
                clearTimeout(expiryTimer.current);
                const msUntilExpiry = data.expiresAt - Date.now() - EXPIRY_BUFFER_MS;
                if (msUntilExpiry > 0) {
                    expiryTimer.current = setTimeout(() => persist(null), msUntilExpiry);
                }
            } else {
                scheduleExpiry(data.token);
            }
            return data;
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('The server is taking too long to respond. It may be waking up; try again in a minute.');
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    };

    const authFetch = useCallback(async (path, options = {}) => {
        // Bail out before the network round-trip if we know the token is stale.
        if (!isTokenFresh(token)) {
            logout();
            throw new Error('Session expired, please log in again.');
        }

        const response = await fetch(url(path), {
            ...options,
            headers: { ...options.headers, Authorization: `Bearer ${token}` }
        });

        if (response.status === 401) {
            logout();
            throw new Error('Session expired, please log in again.');
        }

        return response;
    }, [token, logout]);

    return (
        <AuthContext.Provider value={{ token, admin, loading: false, login, logout, authFetch }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
