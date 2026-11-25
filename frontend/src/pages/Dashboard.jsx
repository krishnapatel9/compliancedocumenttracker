import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime, readJson } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

const CATEGORY_LABELS = { license: 'Licences', certificate: 'Certificates', insurance: 'Insurance', contract: 'Contracts', permit: 'Permits', tax_document: 'Tax documents' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Dashboard() {
    const { authFetch } = useAuth();
    const toast = useToast();
    const [stats, setStats] = useState(null);
    const [attention, setAttention] = useState([]);
    const [recentAlerts, setRecentAlerts] = useState([]);
    const [alertHealth, setAlertHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        try {
            setError(null);
            const [statsRes, expiredRes, soonRes, notifRes, healthRes] = await Promise.all([
                authFetch('/api/dashboard'),
                authFetch('/api/documents?limit=6&sort=expiryDate&order=desc&status=expired'),
                authFetch('/api/documents?limit=6&sort=expiryDate&order=asc&status=expiring_soon'),
                authFetch('/api/notifications'),
                fetch('/api/health')
            ]);
            if (!statsRes.ok) throw new Error((await readJson(statsRes)).error || 'Could not load the overview');
            setStats(await statsRes.json());

            const expired = expiredRes.ok ? (await expiredRes.json()).items || [] : [];
            const soon = soonRes.ok ? (await soonRes.json()).items || [] : [];
            setAttention([...expired, ...soon].slice(0, 8));
            setRecentAlerts(notifRes.ok ? (await notifRes.json()).slice(0, 6) : []);
            setAlertHealth(healthRes.ok ? (await readJson(healthRes)).alerts || null : null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, []);

    const runScan = async () => {
        setScanning(true);
        try {
            const res = await authFetch('/api/services/cron/trigger', { method: 'POST' });
            const result = await readJson(res);
            if (!res.ok) {
                const detail = result.error || (result.failed && result.failed[0] && result.failed[0].error) || `HTTP ${res.status}`;
                throw new Error(`The scan did not complete: ${detail}`);
            }
            toast.success(`Scan complete: ${plural(result.sentCount, 'email', 'emails')} sent, ${result.skippedDuplicates.length} already sent.`);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setScanning(false);
            load();
        }
    };

    if (loading) return <p className="loading">Loading the register…</p>;

    if (error) {
        return (
            <div className="notice error" role="alert">
                {error}
                <button className="btn secondary small" onClick={() => { setLoading(true); load(); }}>Try again</button>
            </div>
        );
    }

    const total = stats.total;
    const expired = stats.expired;
    const soon = stats.expiringSoon;
    const active = stats.active;
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const pct = (n) => (total > 0 ? (n / total) * 100 : 0);
    const alertsFailing = Boolean(alertHealth && alertHealth.lastError);

    let lede;
    if (total === 0) {
        lede = <>The register is empty. <Link to="/documents">Add the first document.</Link></>;
    } else if (expired === 0 && soon === 0) {
        lede = <>Everything is in date. <b>{plural(total, 'document', 'documents')}</b>, none expiring in the next 30 days.</>;
    } else {
        lede = (
            <>
                {expired > 0 && <><b className="late">{plural(expired, 'document has', 'documents have')} expired</b>{soon > 0 ? ' and ' : '.'}</>}
                {soon > 0 && <><b className="soon">{plural(soon, 'expires', 'expire')}</b> within 30 days.</>}
            </>
        );
    }

    const categoryRows = Object.entries(stats.categories).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

    return (
        <div>
            <header className="page-head">
                <div>
                    <h1>Overview</h1>
                    <p>{today}</p>
                </div>
                <div className="page-actions">
                    <Link className="btn secondary" to="/documents">Open the register</Link>
                </div>
            </header>

            <p className="lede">{lede}</p>

            {total > 0 && (
                <div role="img" aria-label={`${expired} expired, ${soon} expiring within 30 days, ${active} in date`}>
                    <div className="spread">
                        {expired > 0 && <span className="late" style={{ flexBasis: `${pct(expired)}%` }} />}
                        {soon > 0 && <span className="soon" style={{ flexBasis: `${pct(soon)}%` }} />}
                        {active > 0 && <span className="ok" style={{ flexBasis: `${pct(active)}%` }} />}
                    </div>
                </div>
            )}

            <dl className="figures">
                <div className="figure"><dt><span className="swatch late" />Expired</dt><dd>{expired}</dd><small>Need renewal now</small></div>
                <div className="figure"><dt><span className="swatch soon" />Expiring within 30 days</dt><dd>{soon}</dd><small>{stats.expiring7d} within 7 days</small></div>
                <div className="figure"><dt><span className="swatch ok" />In date</dt><dd>{active}</dd><small>More than 30 days left</small></div>
                <div className="figure"><dt><span className="swatch all" />Total registered</dt><dd>{total}</dd><small>{stats.healthRate}% not expired</small></div>
            </dl>

            <div className="split">
                <section className="panel">
                    <div className="panel-head">
                        <h2>Needs attention</h2>
                        <Link to="/documents">All documents</Link>
                    </div>
                    {attention.length === 0 ? (
                        <div className="empty"><strong>Nothing needs attention</strong>No document is expired or expiring within 30 days.</div>
                    ) : (
                        <div className="table-wrap">
                            <table className="table">
                                <thead><tr><th>Document</th><th>Status</th><th className="hide-sm">Reminder goes to</th></tr></thead>
                                <tbody>
                                    {attention.map((doc) => (
                                        <tr key={doc.id}>
                                            <td>
                                                <Link to={`/documents?open=${doc.id}`} className="cell-title" style={{ textDecoration: 'none' }}>{doc.title}</Link>
                                                <div className="cell-sub">{CATEGORY_LABELS[doc.category] || doc.category}</div>
                                            </td>
                                            <td><StatusBadge status={doc.status} days={doc.daysRemaining} /></td>
                                            <td className="hide-sm">{doc.notifyEmail}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className="panel">
                    <div className="panel-head">
                        <h2>Recent reminders</h2>
                        <Link to="/warnings">Full log</Link>
                    </div>
                    {recentAlerts.length === 0 ? (
                        <div className="empty"><strong>No reminders sent yet</strong>They go out at 30, 15 and 7 days before expiry.</div>
                    ) : (
                        <ul className="feed">
                            {recentAlerts.map((n) => (
                                <li key={n.id}>
                                    <span>{n.document ? n.document.title : 'Document'}: {n.daysBefore === 0 ? 'expiry notice' : `${n.daysBefore}-day warning`}</span>
                                    <span className="who">to {n.document ? n.document.notifyEmail : 'recipient'}</span>
                                    <span className="when">{formatDateTime(n.sentAt)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className={`scan-line ${alertsFailing ? 'bad' : ''}`}>
                        <span>
                            {alertsFailing
                                ? `Last scan reported a problem: ${alertHealth.lastError}`
                                : alertHealth && alertHealth.lastSuccessAt
                                    ? `Last successful scan ${formatDateTime(alertHealth.lastSuccessAt)}`
                                    : 'No scan has completed since the server started'}
                        </span>
                        <button className="btn secondary small" onClick={runScan} disabled={scanning}>{scanning ? 'Scanning…' : 'Run scan'}</button>
                    </div>
                </section>
            </div>

            <section className="panel">
                <div className="panel-head"><h2>By category</h2><span className="note">{plural(total, 'document', 'documents')}</span></div>
                <div className="panel-body">
                    {categoryRows.length === 0 ? <p className="note">No documents yet.</p> : (
                        <div className="bars">
                            {categoryRows.map(([key, n]) => (
                                <div className="bar-row" key={key}>
                                    <span>{CATEGORY_LABELS[key] || key}</span>
                                    <div className="bar-track"><div className="bar-fill" style={{ width: `${pct(n)}%` }} /></div>
                                    <span className="v">{n} ({Math.round(pct(n))}%)</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

export default Dashboard;
