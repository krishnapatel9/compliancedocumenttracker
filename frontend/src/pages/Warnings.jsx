import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

function Warnings() {
    const { authFetch } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [runningCron, setRunningCron] = useState(false);
    const [cronSuccess, setCronSuccess] = useState(false);

    const fetchNotifications = async () => {
        setError('');
        try {
            const res = await authFetch('/api/notifications');
            if (!res.ok) throw new Error('Failed to fetch system notifications');
            const data = await res.json();
            setNotifications(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const triggerCronCheck = async () => {
        setRunningCron(true);
        setCronSuccess(false);
        try {
            const res = await authFetch('/api/services/cron/trigger', {
                method: 'POST'
            });
            if (!res.ok) throw new Error('Failed to run compliance scan check');
            setCronSuccess(true);
            // Refresh list to pull any new notifications sent
            await fetchNotifications();
            setTimeout(() => setCronSuccess(false), 4000);
        } catch (err) {
            alert(err.message);
        } finally {
            setRunningCron(false);
        }
    };

    return (
        <div className="page-container animate-fade-in" style={{ padding: '2rem', color: '#f1f3f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#fff', margin: 0 }}>System Warnings</h1>
                    <p style={{ color: '#868e96', fontSize: '0.9rem', marginTop: '0.25rem' }}>Audit trail logging for proactive notification emails dispatched by backend cron checker.</p>
                </div>

                <div>
                    <button
                        onClick={triggerCronCheck}
                        disabled={runningCron}
                        style={{
                            backgroundColor: cronSuccess ? '#2b8a3e' : '#e03131',
                            border: 'none',
                            color: '#fff',
                            padding: '0.6rem 1.2rem',
                            borderRadius: '6px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.3s',
                            boxShadow: '0 4px 10px rgba(224,49,49,0.15)'
                        }}
                    >
                        {runningCron ? 'Executing Audit...' : cronSuccess ? 'Audit Scan Completed! ✓' : '⚡ Trigger Manual Audit'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                    <div className="spinner"></div>
                </div>
            ) : error ? (
                <div style={{ border: '1px solid #fa5252', padding: '1rem', borderRadius: '8px', backgroundColor: 'rgba(250,82,82,0.05)', color: '#fa5252', margin: '2rem 0' }}>
                    <strong>Fetch error:</strong> {error}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{
                        backgroundColor: '#090f18',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        padding: '1.25rem',
                        fontFamily: 'monospace',
                        color: '#a6a7ab'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: '#868e96' }}>
                            <span>AUDIT DISPATCH ACTIONS HISTORY ({notifications.length} entries)</span>
                            <span>DATABASE ENGINE LEDGER</span>
                        </div>

                        {notifications.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '2rem 0', color: '#5c5f66', margin: 0 }}>No alerts have been dispatched yet. Nearing deadlines (30d, 7d) trigger warnings list.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '420px', overflowY: 'auto' }}>
                                {notifications.map(notif => (
                                    <div
                                        key={notif.id}
                                        style={{
                                            padding: '0.6rem 0.8rem',
                                            borderRadius: '6px',
                                            backgroundColor: '#101726',
                                            borderLeft: '4px solid #fd7e14',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '1rem'
                                        }}
                                    >
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <span style={{ color: '#868e96' }}>
                                                [{new Date(notif.sentAt).toLocaleString()}]
                                            </span>
                                            <div>
                                                <span style={{ color: '#4c6ef5', fontWeight: 600 }}>[ALERT SENT]</span>
                                                <span style={{ color: '#fff', marginLeft: '0.5rem' }}>"{notif.document.title}"</span>
                                                <span style={{ color: '#a6a7ab', marginLeft: '0.50rem' }}>expired threshold milestone ({notif.daysBefore} days left) warning dispatched to</span>
                                                <span style={{ color: '#ffd43b', marginLeft: '0.5rem' }}>{notif.document.notifyEmail}</span>
                                            </div>
                                        </div>

                                        <span style={{
                                            fontSize: '0.75rem',
                                            backgroundColor: 'rgba(253,126,20,0.1)',
                                            color: '#fd7e14',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(253,126,20,0.2)'
                                        }}>{notif.document.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Warnings;
