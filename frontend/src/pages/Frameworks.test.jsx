import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Frameworks from './Frameworks';
import { renderApp, mockApi, json, signIn, doc, page, requests } from '../test/helpers';

const control = (framework, controlCode, name, document = null) => ({ framework, controlCode, name, description: `${name} description`, id: document ? 'c-' + controlCode : null, documentId: document ? document.id : null, document });
const FIRE = doc();
const CONTROLS = [
    control('SOC2', 'CC1.1', 'Integrity and Ethical Values'),
    control('SOC2', 'CC6.1', 'Access Authorization', { id: FIRE.id, title: 'Fire Policy', status: 'expired', daysRemaining: -3 }),
    control('GDPR', 'Article 5', 'Integrity and Confidentiality'),
];
const baseRoutes = (extra = {}) => ({ 'GET /api/frameworks': json(CONTROLS), 'GET /api/documents': json(page([FIRE])), ...extra });

describe('Frameworks', () => {
    it('shows the selected framework\'s controls and how many have evidence', async () => {
        signIn();
        mockApi(baseRoutes());
        renderApp(<Frameworks />);
        expect(await screen.findByText('Integrity and Ethical Values')).toBeInTheDocument();
        expect(screen.queryByText('Integrity and Confidentiality')).not.toBeInTheDocument();   // GDPR is on another tab
        expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
        expect(screen.getByText(/1 with a document that is expired or expiring/)).toBeInTheDocument();
    });

    it('shows the evidence document\'s status so an expired document exposes its control', async () => {
        signIn();
        mockApi(baseRoutes());
        renderApp(<Frameworks />);
        const row = (await screen.findByText('Access Authorization')).closest('.control');
        expect(within(row).getByText('Fire Policy')).toBeInTheDocument();
        expect(within(row).getByText('Expired', { selector: '.status' })).toBeInTheDocument();
    });

    it('switches framework tabs', async () => {
        signIn();
        mockApi(baseRoutes());
        renderApp(<Frameworks />);
        await screen.findByText('Integrity and Ethical Values');
        await userEvent.click(screen.getByRole('tab', { name: 'GDPR' }));
        expect(screen.getByText('Integrity and Confidentiality')).toBeInTheDocument();
        expect(screen.queryByText('Integrity and Ethical Values')).not.toBeInTheDocument();
    });

    it('keeps Attach disabled until a document is chosen, then links it', async () => {
        signIn();
        const api = mockApi(baseRoutes({ 'POST /api/frameworks/link': json({}) }));
        renderApp(<Frameworks />);
        const row = (await screen.findByText('Integrity and Ethical Values')).closest('.control');
        const attach = within(row).getByRole('button', { name: 'Attach' });
        expect(attach).toBeDisabled();
        await userEvent.selectOptions(within(row).getByLabelText('Evidence for CC1.1'), FIRE.id);
        expect(attach).toBeEnabled();
        await userEvent.click(attach);
        const post = requests(api).find((r) => r.method === 'POST');
        expect(JSON.parse(post.options.body)).toEqual({ framework: 'SOC2', controlCode: 'CC1.1', documentId: FIRE.id });
    });

    it('removes the evidence with documentId null', async () => {
        signIn();
        const api = mockApi(baseRoutes({ 'POST /api/frameworks/link': json({}) }));
        renderApp(<Frameworks />);
        const row = (await screen.findByText('Access Authorization')).closest('.control');
        await userEvent.click(within(row).getByRole('button', { name: 'Remove' }));
        const post = requests(api).find((r) => r.method === 'POST');
        expect(JSON.parse(post.options.body)).toEqual({ framework: 'SOC2', controlCode: 'CC6.1', documentId: null });
    });

    it('tells the user when saving fails', async () => {
        signIn();
        mockApi(baseRoutes({ 'POST /api/frameworks/link': json({ error: 'Document not found' }, 404) }));
        renderApp(<Frameworks />);
        const row = (await screen.findByText('Integrity and Ethical Values')).closest('.control');
        await userEvent.selectOptions(within(row).getByLabelText('Evidence for CC1.1'), FIRE.id);
        await userEvent.click(within(row).getByRole('button', { name: 'Attach' }));
        expect(await screen.findByText('Document not found')).toBeInTheDocument();
    });
});
