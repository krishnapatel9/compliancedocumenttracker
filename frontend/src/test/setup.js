import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Run every test in a zone west of UTC: code that formats dates with local time (instead of
// UTC) shows the previous day here, so those bugs cannot hide on a developer's machine.
process.env.TZ = 'America/Los_Angeles';

// jsdom has no matchMedia; tests control the "operating system" theme through these helpers.
let systemLight = false;
const listeners = new Set();
window.matchMedia = (query) => ({
    get matches() { return query.includes('light') ? systemLight : !systemLight; },
    media: query,
    addEventListener: (type, fn) => { if (type === 'change') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'change') listeners.delete(fn); },
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    dispatchEvent: () => false,
});
globalThis.setSystemTheme = (theme) => {
    systemLight = theme === 'light';
    listeners.forEach((fn) => fn({ matches: systemLight }));
};

beforeEach(() => {
    systemLight = false;
    listeners.clear();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    window.URL.createObjectURL = vi.fn(() => 'blob:test');
    window.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
