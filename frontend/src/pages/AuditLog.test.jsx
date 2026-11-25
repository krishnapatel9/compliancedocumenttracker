import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditLog from './AuditLog';
import { renderApp, mockApi, json, signIn, requests } from '../test/helpers';

const entry = (over) => ({ id: Math.random().toString(36), createdAt: '2026-11-24T10:00:00.000Z', actorEmail: 'admin@test.com', action: 'DOCUMENT_CREATED', entityType: 'document', documentTitle: 'Fire Policy', details: {}, ip: '10.0.0.1', ...over });
const reply = (items, over = {}) => json({ items, totalItems: items.length, totalPages: 1, page: 1, limit: 25, ...over });
const last = (api) => requests(api).filter((r) => r.path === '/api/audit-logs').at(-1);

describe('Audit log', () => {
    it('shows who did what to which document', async () => {
        signIn();
        mockApi({ 'GET /api/audit-logs': reply([
            entry({ action: 'DOCUMENT_DELETED' }),
            entry({ action: 'LOGIN_FAILED', actorEmail: 'x@y.com', documentTitle: null, details: { reason: 'wrong password' }, ip: '1.2.3.4' }),
        ]) });
        renderApp(<AuditLog />);
        const rows = await screen.findAllByRole('row');
        expect(within(rows[1]).getByText('Moved to trash')).toBeInTheDocument();
        expect(within(rows[1]).getByText('Fire Policy')).toBeInTheDocument();
        expect(within(rows[2]).getByText('Failed sign-in (wrong password)')).toBeInTheDocument();
        expect(within(rows[2]).getByText('x@y.com')).toBeInTheDocument();
        expect(within(rows[2]).getByText('1.2.3.4')).toBeInTheDocument();
    });

    it('filters by action and by person, and can clear the filters', async () => {
        signIn();
        const api = mockApi({ 'GET /api/audit-logs': reply([entry()]) });
        renderApp(<AuditLog />);
        await screen.findByText('Document created');
        await userEvent.selectOptions(screen.getByLabelText('Action'), 'DOCUMENT_PURGED');
        await waitFor(() => expect(last(api).query.get('action')).toBe('DOCUMENT_PURGED'));

        await userEvent.type(screen.getByLabelText('Person'), 'admin@');
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        await waitFor(() => expect(last(api).query.get('actor')).toBe('admin@'));

        await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
        await waitFor(() => expect(last(api).query.has('action') || last(api).query.has('actor')).toBe(false));
    });

    it('filters by date range', async () => {
        signIn();
        const api = mockApi({ 'GET /api/audit-logs': reply([entry()]) });
        renderApp(<AuditLog />);
        await screen.findByText('Document created');
        await userEvent.type(screen.getByLabelText('From'), '2026-11-01');
        await userEvent.type(screen.getByLabelText('To'), '2026-11-30');
        await waitFor(() => {
            const q = last(api).query;
            expect([q.get('from'), q.get('to')]).toEqual(['2026-11-01', '2026-11-30']);
        });
    });

    it('pages through the entries', async () => {
        signIn();
        const api = mockApi({ 'GET /api/audit-logs': (url) => reply([entry()], { totalItems: 60, totalPages: 3, page: Number(url.searchParams.get('page')) }) });
        renderApp(<AuditLog />);
        expect(await screen.findByText('60 entries, page 1 of 3')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(await screen.findByText('60 entries, page 2 of 3')).toBeInTheDocument();
        expect(last(api).query.get('page')).toBe('2');
    });

    it('has an empty state', async () => {
        signIn();
        mockApi({ 'GET /api/audit-logs': reply([], { totalItems: 0 }) });
        renderApp(<AuditLog />);
        expect(await screen.findByText('No matching entries')).toBeInTheDocument();
    });
});
