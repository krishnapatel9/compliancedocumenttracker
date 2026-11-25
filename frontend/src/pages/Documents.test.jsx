import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Documents from './Documents';
import { renderApp, mockApi, json, signIn, doc, page, requests } from '../test/helpers';

const FIRE = doc();
const EXPIRED = doc({ id: '22222222-2222-4222-8222-222222222222', title: 'Old Permit', category: 'permit', status: 'expired', daysRemaining: -12, expiryDate: '2026-11-12T00:00:00.000Z', hasFile: false, file: null });
const SOON = doc({ id: '33333333-3333-4333-8333-333333333333', title: 'Lease', category: 'contract', status: 'expiring_soon', daysRemaining: 5 });

const list = (items = [FIRE, EXPIRED, SOON], over) => json(page(items, over));
const lastList = (api) => requests(api).filter((r) => r.path === '/api/documents' && r.method === 'GET').at(-1);

describe('Documents register', () => {
    it('lists documents with status words, due days, dates in UTC and recipients', async () => {
        signIn();
        mockApi({ 'GET /api/documents': list(), 'GET /api/audit-logs': json({ items: [] }) });
        renderApp(<Documents />);
        const row = (await screen.findByText('Fire Policy')).closest('tr');
        expect(within(row).getByText('In date')).toBeInTheDocument();
        expect(within(row).getByText('Expires in 90 days')).toBeInTheDocument();
        expect(within(row).getByText('01 Jan 2027')).toBeInTheDocument();      // not 31 Dec in Los Angeles
        expect(within(row).getByText('owner@example.com')).toBeInTheDocument();

        const old = screen.getByText('Old Permit').closest('tr');
        expect(within(old).getByText('Expired', { selector: '.status' })).toBeInTheDocument();
        expect(within(old).getByText('Expired 12 days ago')).toBeInTheDocument();
        expect(within(screen.getByText('Lease').closest('tr')).getByText('Expiring soon')).toBeInTheDocument();
    });

    it('requests the first page sorted by newest, 5 per page', async () => {
        signIn();
        const api = mockApi({ 'GET /api/documents': list() });
        renderApp(<Documents />);
        await screen.findByText('Fire Policy');
        const q = lastList(api).query;
        expect(q.get('page')).toBe('1');
        expect(q.get('limit')).toBe('5');
        expect(q.get('sort')).toBe('createdAt');
        expect(q.get('order')).toBe('desc');
        expect(q.has('trash')).toBe(false);
    });

    it('searches, and clearing the filters refetches even when only the search text was set', async () => {
        signIn();
        const api = mockApi({ 'GET /api/documents': list() });
        renderApp(<Documents />);
        await screen.findByText('Fire Policy');

        await userEvent.type(screen.getByLabelText('Search documents'), 'permit{enter}');
        await waitFor(() => expect(lastList(api).query.get('search')).toBe('permit'));

        await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
        await waitFor(() => expect(lastList(api).query.has('search')).toBe(false));
        expect(screen.getByLabelText('Search documents')).toHaveValue('');
    });

    it('filters by category and status and sorts', async () => {
        signIn();
        const api = mockApi({ 'GET /api/documents': list() });
        renderApp(<Documents />);
        await screen.findByText('Fire Policy');
        await userEvent.selectOptions(screen.getByLabelText('Category'), 'permit');
        await userEvent.selectOptions(screen.getByLabelText('Status'), 'expired');
        await userEvent.selectOptions(screen.getByLabelText('Sort'), 'expiry_asc');
        await waitFor(() => {
            const q = lastList(api).query;
            expect([q.get('category'), q.get('status'), q.get('sort'), q.get('order')]).toEqual(['permit', 'expired', 'expiryDate', 'asc']);
        });
    });

    it('pages forward and back', async () => {
        signIn();
        const api = mockApi({ 'GET /api/documents': (url) => list([FIRE], { totalItems: 12, totalPages: 3, page: Number(url.searchParams.get('page')) }) });
        renderApp(<Documents />);
        expect(await screen.findByText('12 documents, page 1 of 3')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
        await userEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(await screen.findByText('12 documents, page 2 of 3')).toBeInTheDocument();
        expect(lastList(api).query.get('page')).toBe('2');
    });

    it('steps back a page when the last item on a later page is deleted', async () => {
        signIn();
        let deleted = false;
        const two = doc({ id: '44444444-4444-4444-8444-444444444444', title: 'Second Page Doc' });
        const api = mockApi({
            'GET /api/documents': (url) => {
                const p = Number(url.searchParams.get('page'));
                if (p === 1) return list([FIRE], { totalItems: deleted ? 1 : 6, totalPages: deleted ? 1 : 2, page: 1 });
                return deleted ? list([], { totalItems: 1, totalPages: 1, page: 2 }) : list([two], { totalItems: 6, totalPages: 2, page: 2 });
            },
            'DELETE /api/documents/44444444-4444-4444-8444-444444444444': () => { deleted = true; return json({ message: 'Document moved to trash.' }); },
        });
        renderApp(<Documents />);
        await screen.findByText('Fire Policy');
        await userEvent.click(screen.getByRole('button', { name: 'Next' }));
        await screen.findByText('Second Page Doc');
        await userEvent.click(screen.getByRole('button', { name: 'Move Second Page Doc to trash' }));
        await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Move to trash' }));
        // page 2 is now empty: the register must land on page 1, not show an empty page
        expect(await screen.findByText('Fire Policy')).toBeInTheDocument();
        expect(lastList(api).query.get('page')).toBe('1');
        expect(screen.queryByText('No documents yet')).not.toBeInTheDocument();
    });

    it('opens with the status filter from the URL (links from the overview)', async () => {
        signIn();
        const api = mockApi({ 'GET /api/documents': list([EXPIRED]) });
        renderApp(<Documents />, { route: '/documents?status=expired' });
        await screen.findByText('Old Permit');
        expect(lastList(api).query.get('status')).toBe('expired');
        expect(screen.getByLabelText('Status')).toHaveValue('expired');
    });

    it('shows a helpful empty state, different for filters and for an empty register', async () => {
        signIn();
        mockApi({ 'GET /api/documents': list([]) });
        renderApp(<Documents />);
        expect(await screen.findByText('No documents yet')).toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText('Category'), 'permit');
        expect(await screen.findByText('No documents match')).toBeInTheDocument();
    });

    it('shows an error with a retry instead of a blank page', async () => {
        signIn();
        let fail = true;
        mockApi({ 'GET /api/documents': () => (fail ? json({ error: 'Database is down' }, 500) : list()) });
        renderApp(<Documents />);
        const notice = await screen.findByRole('alert');
        expect(notice).toHaveTextContent('Database is down');
        fail = false;
        await userEvent.click(within(notice).getByRole('button', { name: 'Try again' }));
        expect(await screen.findByText('Fire Policy')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();       // the banner clears
    });

    it('disables download for a document with no stored file and explains why', async () => {
        signIn();
        mockApi({ 'GET /api/documents': list() });
        renderApp(<Documents />);
        await screen.findByText('Old Permit');
        const btn = screen.getByRole('button', { name: 'Download Old Permit' });
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('title', expect.stringContaining('Re-upload'));
        expect(screen.getByRole('button', { name: 'Download Fire Policy' })).toBeEnabled();
    });

    it('downloads the PDF without raising an error', async () => {
        signIn();
        const api = mockApi({ 'GET /api/documents': list(), 'GET /api/documents/11111111-1111-4111-8111-111111111111/file': json({}) });
        renderApp(<Documents />);
        await screen.findByText('Fire Policy');
        await userEvent.click(screen.getByRole('button', { name: 'Download Fire Policy' }));
        await waitFor(() => expect(window.URL.revokeObjectURL).toHaveBeenCalled());
        expect(requests(api).some((r) => r.path.endsWith('/file'))).toBe(true);
        expect(screen.queryByText(/Download failed/)).not.toBeInTheDocument();
    });
});

describe('Documents: trash, delete and restore', () => {
    it('moving to trash asks first, then calls DELETE and reports it', async () => {
        signIn();
        const api = mockApi({
            'GET /api/documents': list(),
            'DELETE /api/documents/11111111-1111-4111-8111-111111111111': json({ message: 'Document moved to trash. It can be restored for 30 days.' }),
        });
        renderApp(<Documents />);
        await screen.findByText('Fire Policy');
        await userEvent.click(screen.getByRole('button', { name: 'Move Fire Policy to trash' }));
        const dialog = screen.getByRole('alertdialog', { name: 'Move to trash' });
        expect(dialog).toHaveTextContent('restore it from the Trash tab for 30 days');
        expect(requests(api).some((r) => r.method === 'DELETE')).toBe(false);          // nothing happens until confirmed
        await userEvent.click(within(dialog).getByRole('button', { name: 'Move to trash' }));
        expect(await screen.findByText(/moved to trash/i)).toBeInTheDocument();
        expect(requests(api).filter((r) => r.method === 'DELETE')).toHaveLength(1);
    });

    it('cancelling the confirmation does nothing', async () => {
        signIn();
        const api = mockApi({ 'GET /api/documents': list() });
        renderApp(<Documents />);
        await screen.findByText('Fire Policy');
        await userEvent.click(screen.getByRole('button', { name: 'Move Fire Policy to trash' }));
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(requests(api).some((r) => r.method === 'DELETE')).toBe(false);
    });

    it('lists the trash with removal dates, and restores from it', async () => {
        signIn();
        const trashed = doc({ title: 'Gone Doc', deletedAt: '2026-11-20T00:00:00.000Z', purgeAt: '2026-12-20T00:00:00.000Z' });
        const api = mockApi({
            'GET /api/documents': (url) => (url.searchParams.get('trash') === 'true' ? list([trashed]) : list()),
            'POST /api/documents/11111111-1111-4111-8111-111111111111/restore': json({ message: 'Document restored', document: FIRE }),
        });
        renderApp(<Documents />);
        await screen.findByText('Fire Policy');
        await userEvent.click(screen.getByRole('tab', { name: 'Trash' }));
        const row = (await screen.findByText('Gone Doc')).closest('tr');
        expect(within(row).getByText('20 Nov 2026')).toBeInTheDocument();
        expect(within(row).getByText(/Removed for good 20 Dec 2026/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add document/ })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();     // status filter is meaningless in the trash

        await userEvent.click(screen.getByRole('button', { name: 'Restore Gone Doc' }));
        expect(await screen.findByText(/"Gone Doc" restored/)).toBeInTheDocument();
        expect(requests(api).some((r) => r.method === 'POST' && r.path.endsWith('/restore'))).toBe(true);
    });

    it('deleting forever needs a second, stronger confirmation', async () => {
        signIn();
        const trashed = doc({ title: 'Gone Doc', deletedAt: '2026-11-20T00:00:00.000Z', purgeAt: '2026-12-20T00:00:00.000Z' });
        const api = mockApi({
            'GET /api/documents': (url) => (url.searchParams.get('trash') === 'true' ? list([trashed]) : list()),
            'DELETE /api/documents/11111111-1111-4111-8111-111111111111/permanent': json({ message: 'Document permanently deleted' }),
        });
        renderApp(<Documents />);
        await userEvent.click(await screen.findByRole('tab', { name: 'Trash' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Delete Gone Doc forever' }));
        const dialog = screen.getByRole('alertdialog', { name: 'Delete forever' });
        expect(dialog).toHaveTextContent('cannot be undone');
        await userEvent.click(within(dialog).getByRole('button', { name: 'Delete forever' }));
        expect(await screen.findByText('Document permanently deleted.')).toBeInTheDocument();
        expect(requests(api).some((r) => r.path.endsWith('/permanent'))).toBe(true);
    });
});

describe('Documents: details, add and edit', () => {
    it('shows details with the change history', async () => {
        signIn();
        mockApi({
            'GET /api/documents': list(),
            'GET /api/audit-logs': json({ items: [
                { id: 'a1', action: 'DOCUMENT_UPDATED', createdAt: '2026-11-20T10:00:00.000Z', actorEmail: 'admin@test.com', details: { changes: { expiryDate: { from: '2026-12-01', to: '2027-12-01' } }, fileReplaced: false } },
                { id: 'a2', action: 'DOCUMENT_CREATED', createdAt: '2026-11-01T10:00:00.000Z', actorEmail: 'admin@test.com', details: {} },
            ] }),
        });
        renderApp(<Documents />);
        await userEvent.click(await screen.findByRole('button', { name: 'Fire Policy' }));
        const drawer = await screen.findByRole('dialog', { name: 'Document details' });
        expect(within(drawer).getByText('fire.pdf (2 KB)')).toBeInTheDocument();
        expect(await within(drawer).findByText('Updated (expiry date: 2026-12-01 → 2027-12-01)')).toBeInTheDocument();
        expect(within(drawer).getByText('Document created')).toBeInTheDocument();
    });

    it('adds a document: sends a multipart form and refreshes the list', async () => {
        signIn();
        const api = mockApi({ 'GET /api/documents': list(), 'POST /api/documents': json({ message: 'ok', document: FIRE }, 201) });
        renderApp(<Documents />);
        await screen.findByText('Fire Policy');
        await userEvent.click(screen.getByRole('button', { name: /Add document/ }));
        const drawer = await screen.findByRole('dialog', { name: 'Add document' });
        await userEvent.type(within(drawer).getByLabelText('Title'), 'New Licence');
        await userEvent.type(within(drawer).getByLabelText('Issue date'), '2026-01-05');
        await userEvent.type(within(drawer).getByLabelText('Expiry date'), '2027-01-05');
        await userEvent.type(within(drawer).getByLabelText('Send reminders to'), 'me@example.com');
        await userEvent.upload(within(drawer).getByLabelText('PDF (up to 5 MB)'), new File(['%PDF-1.4'], 'l.pdf', { type: 'application/pdf' }));
        await userEvent.click(within(drawer).getByRole('button', { name: 'Add document' }));

        expect(await screen.findByText('Document registered.')).toBeInTheDocument();
        const post = requests(api).find((r) => r.method === 'POST');
        expect(post.options.body).toBeInstanceOf(FormData);
        expect(post.options.body.get('title')).toBe('New Licence');
        expect(post.options.body.get('expiryDate')).toBe('2027-01-05');
        expect(post.options.body.get('file').name).toBe('l.pdf');
        expect(screen.queryByRole('dialog', { name: 'Add document' })).not.toBeInTheDocument();
    });

    it('rejects a non-PDF client-side and shows server validation messages next to the field', async () => {
        signIn();
        mockApi({
            'GET /api/documents': list(),
            'POST /api/documents': json({ error: 'Validation failed', details: { title: ['Title must be between 3 and 150 characters'], notifyEmail: ['Invalid notify email address'] } }, 400),
        });
        renderApp(<Documents />);
        await userEvent.click(await screen.findByRole('button', { name: /Add document/ }));
        const drawer = await screen.findByRole('dialog', { name: 'Add document' });

        await userEvent.upload(within(drawer).getByLabelText('PDF (up to 5 MB)'), new File(['hi'], 'x.txt', { type: 'text/plain' }), { applyAccept: false });
        expect(within(drawer).getByText('PDF files only are allowed')).toBeInTheDocument();

        await userEvent.upload(within(drawer).getByLabelText('PDF (up to 5 MB)'), new File(['%PDF'], 'ok.pdf', { type: 'application/pdf' }));
        await userEvent.type(within(drawer).getByLabelText('Title'), 'ab');
        await userEvent.type(within(drawer).getByLabelText('Issue date'), '2026-01-05');
        await userEvent.type(within(drawer).getByLabelText('Expiry date'), '2027-01-05');
        await userEvent.type(within(drawer).getByLabelText('Send reminders to'), 'bad@x.com');
        await userEvent.click(within(drawer).getByRole('button', { name: 'Add document' }));
        expect(await within(drawer).findByText('Title must be between 3 and 150 characters')).toBeInTheDocument();
        expect(within(drawer).getByText('Invalid notify email address')).toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Add document' })).toBeInTheDocument();    // stays open to fix
    });

    it('edit prefills the form with the stored calendar dates and sends a PUT', async () => {
        signIn();
        const api = mockApi({ 'GET /api/documents': list(), 'PUT /api/documents/11111111-1111-4111-8111-111111111111': json({ message: 'ok', document: FIRE }) });
        renderApp(<Documents />);
        await userEvent.click(await screen.findByRole('button', { name: 'Edit Fire Policy' }));
        const drawer = await screen.findByRole('dialog', { name: 'Edit document' });
        expect(within(drawer).getByLabelText('Expiry date')).toHaveValue('2027-01-01');   // not 2026-12-31
        expect(within(drawer).getByLabelText('Title')).toHaveValue('Fire Policy');

        await userEvent.clear(within(drawer).getByLabelText('Title'));
        await userEvent.type(within(drawer).getByLabelText('Title'), 'Fire Policy 2027');
        await userEvent.click(within(drawer).getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByText('Document updated.')).toBeInTheDocument();
        const put = requests(api).find((r) => r.method === 'PUT');
        expect(put.options.body.get('title')).toBe('Fire Policy 2027');
        expect(put.options.body.has('file')).toBe(false);          // no replacement file chosen
    });
});
