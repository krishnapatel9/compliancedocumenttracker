import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge, { dueText } from './StatusBadge';

describe('dueText', () => {
    it('words past, present and future days', () => {
        expect(dueText(-1)).toBe('1 day ago');
        expect(dueText(-35)).toBe('35 days ago');
        expect(dueText(0)).toBe('today');
        expect(dueText(1)).toBe('in 1 day');
        expect(dueText(24)).toBe('in 24 days');
    });
});

describe('StatusBadge', () => {
    it('always shows the status as words, not colour alone', () => {
        const { rerender } = render(<StatusBadge status="expired" days={-3} />);
        expect(screen.getByText('Expired', { selector: '.status' })).toBeInTheDocument();
        expect(screen.getByText('Expired 3 days ago')).toBeInTheDocument();

        rerender(<StatusBadge status="expiring_soon" days={5} />);
        expect(screen.getByText('Expiring soon')).toBeInTheDocument();
        expect(screen.getByText('Expires in 5 days')).toBeInTheDocument();

        rerender(<StatusBadge status="active" days={200} />);
        expect(screen.getByText('In date')).toBeInTheDocument();
    });

    it('can hide the day count', () => {
        render(<StatusBadge status="active" days={200} showDays={false} />);
        expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
    });
});
