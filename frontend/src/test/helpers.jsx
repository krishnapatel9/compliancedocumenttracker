import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { ThemeProvider } from '../context/ThemeContext';

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** An unsigned JWT the client accepts (the client only decodes it; the server verifies it). */
export const makeToken = (over = {}) =>
    `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ id: 'admin-1', email: 'admin@test.com', exp: Math.floor(Date.now() / 1000) + 3600, ...over })}.sig`;

export const signIn = (over) => localStorage.setItem('token', makeToken(over));

export const json = (body, status = 200) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob(['%PDF-test']) });

/**
 * Replaces fetch with a router. Keys are "METHOD /path" (no query string); values are a
 * response or a function (url, options) => response. Unmatched calls fail the test loudly.
 * Returns the mock so tests can inspect calls.
 */
export const mockApi = (routes = {}) => {
    const fn = vi.fn(async (input, options = {}) => {
        const url = new URL(String(input), 'http://localhost');
        const key = `${(options.method || 'GET').toUpperCase()} ${url.pathname}`;
        const route = routes[key];
        if (route === undefined) throw new Error(`Unexpected request: ${key}${url.search}`);
        return typeof route === 'function' ? route(url, options) : route;
    });
    vi.stubGlobal('fetch', fn);
    return fn;
};

/** Requests made so far, as { method, path, query (URLSearchParams), options }. */
export const requests = (fetchMock) =>
    fetchMock.mock.calls.map(([input, options = {}]) => {
        const url = new URL(String(input), 'http://localhost');
        return { method: (options.method || 'GET').toUpperCase(), path: url.pathname, query: url.searchParams, options };
    });

export const renderApp = (ui, { route = '/' } = {}) =>
    render(
        <MemoryRouter initialEntries={[route]}>
            <ThemeProvider>
                <ToastProvider>
                    <AuthProvider>{ui}</AuthProvider>
                </ToastProvider>
            </ThemeProvider>
        </MemoryRouter>
    );

export const doc = (over = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Fire Policy',
    category: 'insurance',
    issueDate: '2026-01-01T00:00:00.000Z',
    expiryDate: '2027-01-01T00:00:00.000Z',
    notifyEmail: 'owner@example.com',
    description: null,
    hasFile: true,
    file: { fileName: 'fire.pdf', size: 2048 },
    status: 'active',
    daysRemaining: 90,
    deletedAt: null,
    purgeAt: null,
    ...over,
});

export const page = (items, over = {}) => ({ items, totalItems: items.length, totalPages: 1, page: 1, limit: 5, ...over });
