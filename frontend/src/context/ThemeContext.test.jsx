import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from './ThemeContext';
import ThemeToggle from '../components/ThemeToggle';

const theme = () => document.documentElement.getAttribute('data-theme');
const mount = () => render(<ThemeProvider><ThemeToggle /></ThemeProvider>);

describe('theme', () => {
    it('follows the operating system when there is no saved choice', () => {
        setSystemTheme('light');
        mount();
        expect(theme()).toBe('light');
        expect(localStorage.getItem('docshield-theme')).toBeNull();
    });

    it('uses dark when the OS is dark', () => {
        mount();
        expect(theme()).toBe('dark');
    });

    it('follows live OS changes while no choice is saved', () => {
        mount();
        act(() => setSystemTheme('light'));
        expect(theme()).toBe('light');
        act(() => setSystemTheme('dark'));
        expect(theme()).toBe('dark');
    });

    it('names the theme you will switch to', () => {
        mount();
        expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
    });

    it('saves an explicit choice that differs from the OS, and keeps it when the OS changes', async () => {
        mount();                                   // OS dark
        await userEvent.click(screen.getByRole('button'));
        expect(theme()).toBe('light');
        expect(localStorage.getItem('docshield-theme')).toBe('light');
        act(() => setSystemTheme('light'));
        act(() => setSystemTheme('dark'));
        expect(theme()).toBe('light');             // explicit choice wins
    });

    it('restores the saved choice on the next visit', () => {
        localStorage.setItem('docshield-theme', 'light');
        mount();                                   // OS dark, saved light
        expect(theme()).toBe('light');
    });

    it('goes back to following the OS when you pick the theme the OS already uses', async () => {
        localStorage.setItem('docshield-theme', 'light');
        mount();                                   // OS dark, explicit light
        await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
        expect(theme()).toBe('dark');
        expect(localStorage.getItem('docshield-theme')).toBeNull();
        act(() => setSystemTheme('light'));
        expect(theme()).toBe('light');             // following again
    });

    it('ignores a corrupted saved value', () => {
        localStorage.setItem('docshield-theme', 'purple');
        mount();
        expect(theme()).toBe('dark');
    });
});
