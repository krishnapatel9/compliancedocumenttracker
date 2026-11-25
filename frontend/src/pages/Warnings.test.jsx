import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Warnings from './Warnings';
import { renderApp, mockApi, json, signIn } from '../test/helpers';

const note = (over = {}) => ({
    id: 'n' + Math.random(), sentAt: '2026-11-24T10:00:00.000Z', daysBefore: 30, expiryDate: '2026-12-24T00:00:00.000Z',
    document: { id: 'd1', title: 'Fire Policy', category: 'insurance', notifyEmail: 'owner@example.com', status: 'expiring_soon', daysRemaining: 20 }, ...over,
});

describe('Reminders log', () => {
    it('words each milestone, and shows the recipient and the document\'s current status', async () => {
        signIn();
        mockApi({ 'GET /api/notifications': json([note({ daysBefore: 30 }), note({ daysBefore: 0, document: { id: 'd2', title: 'Old Permit', notifyEmail: 'legal@example.com', status: 'expired', daysRemaining: -3 } })]) });
        renderApp(<Warnings />);
        const rows = await screen.findAllByRole('row');
        expect(within(rows[1]).getByText('30 days before expiry')).toBeInTheDocument();
        expect(within(rows[1]).getByText('owner@example.com')).toBeInTheDocument();
        expect(within(rows[2]).getByText('Expiry notice')).toBeInTheDocument();
        expect(within(rows[2]).getByText('Expired')).toBeInTheDocument();
    });

    it('has an empty state that explains when reminders go out', async () => {
        signIn();
        mockApi({ 'GET /api/notifications': json([]) });
        renderApp(<Warnings />);
        expect(await screen.findByText('No reminders sent yet')).toBeInTheDocument();
        expect(screen.getByText(/30, 15 and 7 days/)).toBeInTheDocument();
    });

    it('runs a scan and refreshes the log', async () => {
        signIn();
        let sent = false;
        mockApi({
            'GET /api/notifications': () => json(sent ? [note()] : []),
            'POST /api/services/cron/trigger': () => { sent = true; return json({ success: true, sentCount: 1, skippedDuplicates: [], failed: [] }); },
        });
        renderApp(<Warnings />);
        await userEvent.click(await screen.findByRole('button', { name: 'Run scan now' }));
        expect(await screen.findByText('Scan complete: 1 sent, 0 already sent.')).toBeInTheDocument();
        expect(await screen.findByText('Fire Policy')).toBeInTheDocument();
    });

    it('reports a failed scan with its reason', async () => {
        signIn();
        mockApi({
            'GET /api/notifications': json([]),
            'POST /api/services/cron/trigger': json({ success: false, failed: [{ error: 'Connection refused' }], sentCount: 0, skippedDuplicates: [] }, 502),
        });
        renderApp(<Warnings />);
        await userEvent.click(await screen.findByRole('button', { name: 'Run scan now' }));
        expect(await screen.findByText(/The scan did not complete: Connection refused/)).toBeInTheDocument();
    });
});
