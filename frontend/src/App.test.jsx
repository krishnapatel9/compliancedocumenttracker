import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { mockApi, json, signIn, page } from './test/helpers';

const stats = {
    total: 3, active: 1, expiringSoon: 1, expired: 1, expiring7d: 1, expiring30d: 1, expiring60d: 1, expiring90d: 1,
    categories: { license: 0, certificate: 0, insurance: 3, contract: 0, permit: 0, tax_document: 0 },
    healthRate: 67, warningsCount: 0, monthlyUploads: [{ month: 'Nov', count: 3 }],
};
const api = {
    'GET /api/dashboard': json(stats),
    'GET /api/documents': json(page([])),
    'GET /api/notifications': json([]),
    'GET /api/health': json({ alerts: {} }),
    'GET /api/audit-logs': json({ items: [], totalItems: 0, totalPages: 1, page: 1, limit: 25 }),
};
const go = (path) => window.history.pushState({}, '', path);

describe('routing', () => {
    beforeEach(() => { mockApi(api); });

    it('sends signed-out visitors to the sign-in page, whatever they asked for', async () => {
        go('/documents');
        render(<App />);
        expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
        expect(window.location.pathname).toBe('/login');
        expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    });

    it('shows the app shell and the requested page when signed in', async () => {
        signIn();
        go('/documents');
        render(<App />);
        expect(await screen.findByRole('heading', { name: 'Documents' })).toBeInTheDocument();
        const nav = screen.getByRole('navigation', { name: 'Main' });
        expect(nav).toHaveTextContent('Overview');
        expect(nav).toHaveTextContent('Audit log');
        expect(screen.getByRole('link', { name: 'Documents' })).toHaveClass('active');
    });

    it('moves a signed-in user away from /login', async () => {
        signIn();
        go('/login');
        render(<App />);
        expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
        expect(window.location.pathname).toBe('/');
    });

    it('sends unknown URLs to the overview', async () => {
        signIn();
        go('/no/such/page');
        render(<App />);
        expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    });

    it('reaches every page from the navigation', async () => {
        signIn();
        go('/');
        render(<App />);
        for (const [link, heading] of [['Frameworks', 'Frameworks'], ['Reminders', 'Reminders'], ['Analytics', 'Analytics'], ['Audit log', 'Audit log']]) {
            screen.getByRole('link', { name: link }).click();
            expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
        }
    });

    it('signs out from the rail', async () => {
        signIn();
        go('/');
        render(<App />);
        (await screen.findByRole('button', { name: /Sign out/ })).click();
        expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
        expect(localStorage.getItem('token')).toBeNull();
    });
});
