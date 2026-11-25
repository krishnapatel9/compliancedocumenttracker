import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { mockApi, json, makeToken, signIn, requests } from '../test/helpers';

function Probe() {
    const { token, admin, login, logout, authFetch } = useAuth();
    const [msg, setMsg] = React.useState('');
    return (
        <div>
            <span data-testid="who">{admin ? admin.email : 'signed out'}</span>
            <span data-testid="msg">{msg}</span>
            <button onClick={() => login('a@b.com', 'pw').catch((e) => setMsg(e.message))}>login</button>
            <button onClick={() => authFetch('/api/documents').catch((e) => setMsg(e.message))}>fetch</button>
            <button onClick={logout}>logout</button>
            <span data-testid="has-token">{String(Boolean(token))}</span>
        </div>
    );
}
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);

describe('AuthContext', () => {
    it('signs in, stores the token and exposes the admin', async () => {
        const token = makeToken({ email: 'a@b.com' });
        const api = mockApi({ 'POST /api/auth/login': json({ token }) });
        mount();
        await userEvent.click(screen.getByText('login'));
        await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('a@b.com'));
        expect(localStorage.getItem('token')).toBe(token);
        expect(JSON.parse(requests(api)[0].options.body)).toEqual({ email: 'a@b.com', password: 'pw' });
    });

    it('surfaces the server error message', async () => {
        mockApi({ 'POST /api/auth/login': json({ error: 'Invalid email or password' }, 401) });
        mount();
        await userEvent.click(screen.getByText('login'));
        await waitFor(() => expect(screen.getByTestId('msg')).toHaveTextContent('Invalid email or password'));
        expect(screen.getByTestId('who')).toHaveTextContent('signed out');
    });

    it('does not crash when the server answers with HTML (proxy error, cold start)', async () => {
        mockApi({ 'POST /api/auth/login': { ok: false, status: 502, json: async () => { throw new SyntaxError('<html>'); } } });
        mount();
        await userEvent.click(screen.getByText('login'));
        await waitFor(() => expect(screen.getByTestId('msg')).toHaveTextContent('server responded 502'));
    });

    it('sends the bearer token on authenticated requests', async () => {
        signIn();
        const api = mockApi({ 'GET /api/documents': json({ items: [] }) });
        mount();
        await userEvent.click(screen.getByText('fetch'));
        await waitFor(() => expect(api).toHaveBeenCalled());
        expect(requests(api)[0].options.headers.Authorization).toMatch(/^Bearer .+\..+\..+$/);
    });

    it('signs out when the server says the session has expired (401)', async () => {
        signIn();
        mockApi({ 'GET /api/documents': json({ error: 'Not authorized' }, 401) });
        mount();
        expect(screen.getByTestId('who')).toHaveTextContent('admin@test.com');
        await userEvent.click(screen.getByText('fetch'));
        await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('signed out'));
        expect(screen.getByTestId('msg')).toHaveTextContent('Session expired');
        expect(localStorage.getItem('token')).toBeNull();
    });

    it('ignores a stored token that has already expired', () => {
        signIn({ exp: Math.floor(Date.now() / 1000) - 60 });
        mount();
        expect(screen.getByTestId('who')).toHaveTextContent('signed out');
    });

    it('ignores a malformed stored token', () => {
        localStorage.setItem('token', 'not-a-jwt');
        mount();
        expect(screen.getByTestId('who')).toHaveTextContent('signed out');
    });

    it('logout clears the stored token', async () => {
        signIn();
        mount();
        await userEvent.click(screen.getByText('logout'));
        expect(screen.getByTestId('who')).toHaveTextContent('signed out');
        expect(localStorage.getItem('token')).toBeNull();
    });
});
