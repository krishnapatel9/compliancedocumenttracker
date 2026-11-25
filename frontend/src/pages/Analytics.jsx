import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { readJson } from '../utils/format';

const CATEGORY_LABELS = { license: 'Licences', certificate: 'Certificates', insurance: 'Insurance', contract: 'Contracts', permit: 'Permits', tax_document: 'Tax documents' };

function Analytics() {
    const { authFetch } = useAuth();
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setError('');
        try {
            const res = await authFetch('/api/dashboard');
            if (!res.ok) throw new Error((await readJson(res)).error || 'Could not load the figures');
            setStats(await res.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, []);

    if (loading) return <p className="loading">Loading…</p>;
    if (error) return <div className="notice error" role="alert">{error}<button className="btn secondary small" onClick={load}>Try again</button></div>;

    const { total, expired, expiring7d, expiring30d, expiring60d, expiring90d, categories, healthRate, warningsCount, monthlyUploads } = stats;
    const maxUpload = Math.max(...monthlyUploads.map((m) => m.count), 1);
    const horizon = [['Next 7 days', expiring7d], ['Next 30 days', expiring30d], ['Next 60 days', expiring60d], ['Next 90 days', expiring90d]];
    const maxHorizon = Math.max(...horizon.map(([, n]) => n), 1);
    const cats = Object.entries(categories).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

    return (
        <div>
            <header className="page-head">
                <div>
                    <h1>Analytics</h1>
                    <p>How the register is distributed, what is coming due, and how much has been added.</p>
                </div>
            </header>

            <dl className="figures">
                <div className="figure"><dt>Documents</dt><dd>{total}</dd><small>In the register</small></div>
                <div className="figure"><dt>Not expired</dt><dd>{healthRate}%</dd><small>{expired} expired</small></div>
                <div className="figure"><dt>Due in 90 days</dt><dd>{expiring90d}</dd><small>Plan the renewals</small></div>
                <div className="figure"><dt>Reminders sent</dt><dd>{warningsCount}</dd><small>All time</small></div>
            </dl>

            <div className="split" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <section className="panel">
                    <div className="panel-head"><h2>Coming due</h2><span className="note">Documents expiring within</span></div>
                    <div className="panel-body bars">
                        {horizon.map(([label, n]) => (
                            <div className="bar-row" key={label} style={{ gridTemplateColumns: '100px minmax(0, 1fr) 40px' }}>
                                <span>{label}</span>
                                <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / maxHorizon) * 100}%` }} /></div>
                                <span className="v">{n}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="panel">
                    <div className="panel-head"><h2>By category</h2><span className="note">Share of the register</span></div>
                    <div className="panel-body bars">
                        {cats.length === 0 ? <p className="note">No documents yet.</p> : cats.map(([key, n]) => (
                            <div className="bar-row" key={key} style={{ gridTemplateColumns: '110px minmax(0, 1fr) 80px' }}>
                                <span>{CATEGORY_LABELS[key] || key}</span>
                                <div className="bar-track"><div className="bar-fill" style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></div>
                                <span className="v">{n} ({total ? Math.round((n / total) * 100) : 0}%)</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <section className="panel">
                <div className="panel-head"><h2>Documents added</h2><span className="note">Last six months</span></div>
                <div className="panel-body">
                    <div className="chart" role="img" aria-label={`Documents added per month: ${monthlyUploads.map((m) => `${m.month} ${m.count}`).join(', ')}`}>
                        {monthlyUploads.map((m) => (
                            <div className="chart-col" key={m.month}>
                                <span className="v">{m.count}</span>
                                <div className="col" style={{ height: `${(m.count / maxUpload) * 100}%` }} />
                                <span className="m">{m.month}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}

export default Analytics;
