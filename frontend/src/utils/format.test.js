import { describe, it, expect } from 'vitest';
import { formatDate, toInputDate, formatDateTime, readJson } from './format';

describe('date formatting', () => {
    it('shows the calendar day stored in the database, whatever the viewer time zone is', () => {
        // The test run is set to America/Los_Angeles, where local time would show 30 Nov
        expect(formatDate('2026-12-01T00:00:00.000Z')).toBe('01 Dec 2026');
        expect(toInputDate('2026-12-01T00:00:00.000Z')).toBe('2026-12-01');
    });

    it('handles month and year boundaries', () => {
        expect(formatDate('2027-01-01T00:00:00.000Z')).toBe('01 Jan 2027');
        expect(formatDate('2026-02-28T00:00:00.000Z')).toBe('28 Feb 2026');
    });

    it('returns safe placeholders for bad values', () => {
        expect(formatDate('nonsense')).toBe('—');
        expect(formatDate(null)).toBe('—');          // not 01 Jan 1970
        expect(formatDate(undefined)).toBe('—');
        expect(formatDate('')).toBe('—');
        expect(toInputDate(null)).toBe('');
        expect(formatDateTime(null)).toBe('—');
        expect(toInputDate('nonsense')).toBe('');
        expect(formatDateTime('nonsense')).toBe('—');
    });
});

describe('readJson', () => {
    it('parses a JSON body', async () => {
        expect(await readJson({ json: async () => ({ a: 1 }) })).toEqual({ a: 1 });
    });

    it('returns {} instead of throwing on HTML or empty bodies (proxy errors, cold starts)', async () => {
        expect(await readJson({ json: async () => { throw new SyntaxError('Unexpected token <'); } })).toEqual({});
    });
});
