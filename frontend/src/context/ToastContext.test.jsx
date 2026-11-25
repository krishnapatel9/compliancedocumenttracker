import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './ToastContext';

function Trigger() {
    const toast = useToast();
    return (
        <>
            <button onClick={() => toast.success('Saved')}>ok</button>
            <button onClick={() => toast.error('Broke')}>bad</button>
        </>
    );
}

describe('toasts', () => {
    it('shows a message and lets the user dismiss it', async () => {
        render(<ToastProvider><Trigger /></ToastProvider>);
        await userEvent.click(screen.getByText('ok'));
        expect(screen.getByText('Saved')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    });

    it('removes success toasts after 4 s and keeps errors for 7 s', () => {
        vi.useFakeTimers();
        try {
            render(<ToastProvider><Trigger /></ToastProvider>);
            act(() => { screen.getByText('ok').click(); screen.getByText('bad').click(); });
            expect(screen.getByText('Saved')).toBeInTheDocument();
            act(() => vi.advanceTimersByTime(4100));
            expect(screen.queryByText('Saved')).not.toBeInTheDocument();
            expect(screen.getByText('Broke')).toBeInTheDocument();
            act(() => vi.advanceTimersByTime(3000));
            expect(screen.queryByText('Broke')).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });
});
