import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime, readJson } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

const milestone = (days) => (days === 0 ? 'Expiry notice' : `${days} days before expiry`);

function Warnings() {
    const { authFetch } = useAuth();
    const toast = useToast();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [running, setRunning] = useState(false);

    const fetchNotifications = async () => {
        setError('');
        try {
            const res = await authFetch('/api/notifications');
            if (!res.ok) throw new Error((await readJson(res)).error || 'Could not load the reminder log');
            setNotifications(await res.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchNotifications(); }, []);

    const runScan = async () => {
        setRunning(true);
        try {
            const res = await authFetch('/api/services/cron/trigger', { method: 'POST' });
            const result = await readJson(res);
            if (!res.ok) {
                const detail = result.error || (result.failed && result.failed[0] && result.failed[0].error) || `HTTP ${res.status}`;
                throw new Error(`The scan did not complete: ${detail}`);
            }
            toast.success(`Scan complete: ${result.sentCount} sent, ${result.skippedDuplicates.length} already sent.`);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setRunning(false);
            fetchNotifications();
        }
    };

    return (
        <div>
            <header className="page-head">
                <div>
                    <h1>Reminders</h1>
                    <p>Every reminder email the register has sent. Each milestone is sent once per document and expiry date; renewing a document starts a new cycle.</p>
                </div>
                <div className="page-actions">
                    <button className="btn" onClick={runScan} disabled={running}>{running ? 'Scanning…' : 'Run scan now'}</button>
                </div>
            </header>

            {error && <div className="notice error" role="alert">{error}<button className="btn secondary small" onClick={fetchNotifications}>Try again</button></div>}

            <div className="panel">
                {loading ? (
                    <p className="loading" style={{ padding: '24px 20px' }}>Loading…</p>
                ) : notifications.length === 0 ? (
                    <div className="empty"><strong>No reminders sent yet</strong>Reminders go out at 30, 15 and 7 days before a document expires, and once it has expired.</div>
                ) : (
                    <div className="table-wrap">
                        <table className="table">
                            <thead><tr><th>Sent</th><th>Document</th><th>Milestone</th><th>Sent to</th><th>Document now</th></tr></thead>
                            <tbody>
                                {notifications.map((n) => (
                                    <tr key={n.id}>
                                        <td>{formatDateTime(n.sentAt)}</td>
                                        <td className="cell-title" style={{ cursor: 'default' }}>{n.document.title}</td>
                                        <td>{milestone(n.daysBefore)}</td>
                                        <td>{n.document.notifyEmail}</td>
                                        <td><StatusBadge status={n.document.status} days={n.document.daysRemaining} showDays={false} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Warnings;
