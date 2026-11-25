import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';
import { renderApp, mockApi, json, makeToken, requests } from '../test/helpers';

describe('Login', () => {
    it('submits the credentials and signs in', async () => {
        const api = mockApi({ 'POST /api/auth/login': json({ token: makeToken() }) });
        renderApp(<Login />);
        await userEvent.type(screen.getByLabelText('Email'), 'admin@test.com');
        await userEvent.type(screen.getByLabelText('Password'), 'secret');
        await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        await waitFor(() => expect(localStorage.getItem('token')).toBeTruthy());
        expect(JSON.parse(requests(api)[0].options.body)).toEqual({ email: 'admin@test.com', password: 'secret' });
    });

    it('shows the server error and lets the user retry', async () => {
        mockApi({ 'POST /api/auth/login': json({ error: 'Invalid email or password' }, 401) });
        renderApp(<Login />);
        await userEvent.type(screen.getByLabelText('Email'), 'x@y.com');
        await userEvent.type(screen.getByLabelText('Password'), 'nope');
        await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
        expect(localStorage.getItem('token')).toBeNull();
    });

    it('disables the button and explains the wait while a sleeping server wakes up', async () => {
        let release;
        mockApi({ 'POST /api/auth/login': () => new Promise((resolve) => { release = () => resolve(json({ token: makeToken() })); }) });
        renderApp(<Login />);
        await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
        await userEvent.type(screen.getByLabelText('Password'), 'pw');
        await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(screen.getByRole('button', { name: /Signing in/ })).toBeDisabled();
        expect(screen.getByText(/may be waking up/)).toBeInTheDocument();
        release();
        await waitFor(() => expect(localStorage.getItem('token')).toBeTruthy());
    });

    it('offers the theme toggle on the sign-in page', () => {
        renderApp(<Login />);
        expect(screen.getByRole('button', { name: /Switch to (light|dark) theme/ })).toBeInTheDocument();
    });
});
