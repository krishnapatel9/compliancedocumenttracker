import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { renderApp, mockApi, json, signIn, doc, page, requests } from '../test/helpers';

const stats = (over = {}) => ({
    total: 14, active: 7, expiringSoon: 3, expired: 4, expiring7d: 1, expiring30d: 3, expiring60d: 3, expiring90d: 3,
    categories: { license: 0, certificate: 2, insurance: 7, contract: 2, permit: 2, tax_document: 1 },
    healthRate: 71, warningsCount: 1,
    monthlyUploads: [], ...over,
});
const routes = (statsBody, extra = {}) => ({
    'GET /api/dashboard': json(statsBody),
    'GET /api/documents': (url) => json(page(url.searchParams.get('status') === 'expired'
        ? [doc({ id: 'e1', title: 'Old Permit', status: 'expired', daysRemaining: -4 })]
        : [doc({ id: 's1', title: 'Lease', status: 'expiring_soon', daysRemaining: 5 })])),
    'GET /api/notifications': json([{ id: 'n1', sentAt: '2026-11-24T10:00:00.000Z', daysBefore: 7, document: { title: 'Lease', notifyEmail: 'owner@example.com' } }]),
    'GET /api/health': json({ alerts: { lastSuccessAt: null, lastError: null } }),
    ...extra,
});

describe('Dashboard', () => {
    it('leads with a plain-language statement of the position', async () => {
        signIn();
        mockApi(routes(stats()));
        renderApp(<Dashboard />);
        expect(await screen.findByText(/4 documents have expired/)).toBeInTheDocument();
        expect(screen.getByText(/3 expire/)).toBeInTheDocument();
    });

    it('uses singular wording for one document', async () => {
        signIn();
        mockApi(routes(stats({ expired: 1, expiringSoon: 1, total: 9 })));
        renderApp(<Dashboard />);
        expect(await screen.findByText(/1 document has expired/)).toBeInTheDocument();
        expect(screen.getByText(/1 expires/)).toBeInTheDocument();
    });

    it('says everything is in date when nothing is expired or expiring', async () => {
        signIn();
        mockApi(routes(stats({ expired: 0, expiringSoon: 0, active: 14, expiring7d: 0, expiring30d: 0 }), { 'GET /api/documents': json(page([])) }));
        renderApp(<Dashboard />);
        expect(await screen.findByText(/Everything is in date/)).toBeInTheDocument();
        expect(screen.getByText('Nothing needs attention')).toBeInTheDocument();
    });

    it('invites the first upload when the register is empty', async () => {
        signIn();
        mockApi(routes(stats({ total: 0, expired: 0, expiringSoon: 0, active: 0, expiring7d: 0, categories: {} }), { 'GET /api/documents': json(page([])) }));
        renderApp(<Dashboard />);
        expect(await screen.findByText(/The register is empty/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Add the first document/ })).toHaveAttribute('href', '/documents');
    });

    it('shows the four figures with their meaning', async () => {
        signIn();
        mockApi(routes(stats()));
        renderApp(<Dashboard />);
        await screen.findByText(/4 documents have expired/);
        const figures = screen.getByText('Total registered').closest('dl');
        expect(figures).toHaveTextContent('Expired4');
        expect(figures).toHaveTextContent('Expiring within 30 days3');
        expect(figures).toHaveTextContent('In date7');
        expect(figures).toHaveTextContent('Total registered14');
        expect(figures).toHaveTextContent('71% not expired');
    });

    it('lists expired documents before those expiring soon, each linking to its details', async () => {
        signIn();
        mockApi(routes(stats()));
        renderApp(<Dashboard />);
        const rows = await screen.findAllByRole('row');
        const names = rows.map((r) => r.textContent).filter((t) => /Old Permit|Lease/.test(t));
        expect(names[0]).toContain('Old Permit');
        expect(names[1]).toContain('Lease');
        expect(screen.getByRole('link', { name: 'Old Permit' })).toHaveAttribute('href', '/documents?open=e1');
    });

    it('shows recent reminders with who they went to', async () => {
        signIn();
        mockApi(routes(stats()));
        renderApp(<Dashboard />);
        expect(await screen.findByText('Lease: 7-day warning')).toBeInTheDocument();
        expect(screen.getByText('to owner@example.com')).toBeInTheDocument();
    });

    it('runs a scan and reports what was sent', async () => {
        signIn();
        const api = mockApi(routes(stats(), { 'POST /api/services/cron/trigger': json({ success: true, sentCount: 2, skippedDuplicates: [{}], failed: [] }) }));
        renderApp(<Dashboard />);
        await userEvent.click(await screen.findByRole('button', { name: 'Run scan' }));
        expect(await screen.findByText('Scan complete: 2 emails sent, 1 already sent.')).toBeInTheDocument();
        expect(requests(api).some((r) => r.method === 'POST' && r.path === '/api/services/cron/trigger')).toBe(true);
    });

    it('reports a failed scan as an error, with the reason, not as success', async () => {
        signIn();
        mockApi(routes(stats(), { 'POST /api/services/cron/trigger': json({ success: false, error: 'SMTP_HOST is not configured', sentCount: 0, skippedDuplicates: [], failed: [] }, 502) }));
        renderApp(<Dashboard />);
        await userEvent.click(await screen.findByRole('button', { name: 'Run scan' }));
        expect(await screen.findByText(/The scan did not complete: SMTP_HOST is not configured/)).toBeInTheDocument();
        expect(screen.queryByText(/Scan complete/)).not.toBeInTheDocument();
    });

    it('warns when the last scan reported a problem', async () => {
        signIn();
        mockApi(routes(stats(), { 'GET /api/health': json({ alerts: { lastSuccessAt: null, lastError: '2 warning(s) failed' } }) }));
        renderApp(<Dashboard />);
        expect(await screen.findByText(/Last scan reported a problem: 2 warning\(s\) failed/)).toBeInTheDocument();
    });

    it('shows an error with retry when the figures cannot be loaded', async () => {
        signIn();
        let fail = true;
        mockApi(routes(stats(), { 'GET /api/dashboard': () => (fail ? json({ error: 'Database error' }, 500) : json(stats())) }));
        renderApp(<Dashboard />);
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Database error');
        fail = false;
        await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(screen.getByText(/4 documents have expired/)).toBeInTheDocument());
    });
});
