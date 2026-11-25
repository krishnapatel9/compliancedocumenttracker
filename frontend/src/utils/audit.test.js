import { describe, it, expect } from 'vitest';
import { describeEntry, ACTION_LABELS } from './audit';

const entry = (action, details = null) => ({ action, details });

describe('describeEntry', () => {
    it('lists field-level changes for updates', () => {
        const text = describeEntry(entry('DOCUMENT_UPDATED', {
            changes: { expiryDate: { from: '2026-12-01', to: '2027-12-01' }, notifyEmail: { from: 'a@x.com', to: null } },
            fileReplaced: true,
        }));
        expect(text).toBe('Updated (expiry date: 2026-12-01 → 2027-12-01; notify email: a@x.com → (empty); PDF replaced)');
    });

    it('says so when an update changed no fields', () => {
        expect(describeEntry(entry('DOCUMENT_UPDATED', { changes: {}, fileReplaced: false }))).toBe('Updated (no field changes)');
    });

    it('names the control for framework links', () => {
        expect(describeEntry(entry('FRAMEWORK_LINKED', { framework: 'SOC2', controlCode: 'CC6.1' }))).toBe('Linked to framework control: SOC2 CC6.1');
        expect(describeEntry(entry('FRAMEWORK_UNLINKED', { framework: 'GDPR', controlCode: 'Article 5' }))).toBe('Unlinked from framework control: GDPR Article 5');
    });

    it('summarises scans, including failures', () => {
        expect(describeEntry(entry('EXPIRY_SCAN_RUN', { success: true, sent: 2, duplicates: 1, failed: 0 }))).toBe('Expiry scan succeeded: 2 sent, 1 already sent, 0 failed');
        expect(describeEntry(entry('EXPIRY_SCAN_RUN', { success: false, sent: 0, duplicates: 0, failed: 0, error: 'SMTP down' }))).toContain('reported a problem');
        expect(describeEntry(entry('EXPIRY_SCAN_RUN', { success: false, sent: 0, duplicates: 0, failed: 0, error: 'SMTP down' }))).toContain('(SMTP down)');
    });

    it('explains failed sign-ins and purges', () => {
        expect(describeEntry(entry('LOGIN_FAILED', { reason: 'wrong password' }))).toBe('Failed sign-in (wrong password)');
        expect(describeEntry(entry('DOCUMENT_PURGED', { reason: 'retention window of 30 days passed' }))).toBe('Permanently deleted (retention window of 30 days passed)');
    });

    it('has a readable label for every action the server records', () => {
        const serverActions = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'DOCUMENT_CREATED', 'DOCUMENT_UPDATED', 'DOCUMENT_DOWNLOADED', 'DOCUMENT_DELETED', 'DOCUMENT_RESTORED', 'DOCUMENT_PURGED', 'FRAMEWORK_LINKED', 'FRAMEWORK_UNLINKED', 'EXPIRY_SCAN_RUN'];
        for (const a of serverActions) expect(ACTION_LABELS[a], a).toBeTruthy();
        expect(describeEntry(entry('SOMETHING_NEW'))).toBe('SOMETHING_NEW');
    });
});
