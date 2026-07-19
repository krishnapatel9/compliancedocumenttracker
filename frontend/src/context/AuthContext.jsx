import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token') || null);
    const [admin, setAdmin] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            localStorage.setItem('token', token);
            try {
                const decoded = JSON.parse(atob(token.split('.')[1]));
                setAdmin({ id: decoded.id, email: decoded.email });
            } catch (e) {
                console.error('Failed to decode token', e);
                logout();
            }
        } else {
            localStorage.removeItem('token');
            setAdmin(null);
        }
        setLoading(false);
    }, [token]);

    const login = async (email, password) => {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        setToken(data.token);
        return data;
    };

    const logout = () => {
        setToken(null);
        setAdmin(null);
        localStorage.removeItem('token');
    };

    const authFetch = async (url, options = {}) => {
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401) {
            logout();
            throw new Error('Session expired, please log in again.');
        }

        return response;
    };

    return (
        <AuthContext.Provider value={{ token, admin, loading, login, logout, authFetch }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
