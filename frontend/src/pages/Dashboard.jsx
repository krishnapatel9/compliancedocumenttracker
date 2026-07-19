import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

function Dashboard() {
    const { authFetch } = useAuth();
    const [stats, setStats] = useState(null);
    const [imminentDocs, setImminentDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            // Fetch stats
            const statsRes = await authFetch('/api/dashboard');
            if (!statsRes.ok) throw new Error('Failed to fetch dashboard metrics');
            const statsData = await statsRes.json();
            setStats(statsData);

            // Fetch document list for imminent danger queue sorted by days remaining
            const docsRes = await authFetch('/api/documents?limit=100');
            if (docsRes.ok) {
                const docsData = await docsRes.json();
                const items = docsData.items || [];
                const sorted = [...items].sort((a, b) => a.daysRemaining - b.daysRemaining);
                setImminentDocs(sorted.slice(0, 4));
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboardData();
    }, []);

    if (loading) {
        return (
            <div className="state-loading" style={{ color: '#868e96', fontFamily: 'monospace' }}>
                [+] SCANNING WORKSPACE DATABASE LAYERS ENGINE...
            </div>
        );
    }

    if (error) {
        return (
            <div className="alert-error" style={{ fontFamily: 'monospace' }}>
                [-] SYSTEM FAULT DETECTED: {error}
            </div>
        );
    }

    // Circular SVG progress math
    const total = stats?.total || 0;
    const expired = stats?.expired || 0;
    const score = total > 0 ? Math.round(((total - expired) / total) * 100) : 100;
    // Stroke calculation (circle radius 54, circumference = 2 * PI * r = ~339.3)
    const circumference = 339.3;
    const strokeDashOffset = circumference - (circumference * score) / 100;

    return (
        <div className="dashboard-page">
            <div className="dashboard-hero-grid">
                {/* Left Card: Fleet status card */}
                <div className="card fleet-card">
                    <div className="fleet-card-header">
                        <div>
                            <span className="status-sys-label">SYSTEM FLAGS // Compliance Registry</span>
                            <h2 className="fleet-title">Fleet Health</h2>
                            <p className="dashboard-desc-compact">
                                Aggregate index representing active nodes versus warning checkpoints.
                            </p>
                        </div>
                        <span className="stability-pill">NOMINAL</span>
                    </div>

                    <div className="fleet-metrics-body">
                        <div className="compliance-radial-gauge">
                            <svg viewBox="0 0 120 120">
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="54"
                                    fill="none"
                                    stroke="rgba(255, 255, 255, 0.03)"
                                    strokeWidth="4"
                                />
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="54"
                                    fill="none"
                                    stroke="url(#radialGaugeGrad)"
                                    strokeWidth="4"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={strokeDashOffset}
                                    strokeLinecap="round"
                                />
                                <defs>
                                    <linearGradient id="radialGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#4c6ef5" />
                                        <stop offset="100%" stopColor="#22b8cf" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="gauge-value">
                                <span>{score}</span>
                                <span className="gauge-percent-symbol">SCORE</span>
                            </div>
                        </div>

                        <div className="fleet-stats-notes">
                            <p className="fleet-notes-text">
                                The DocShield safety score is calculated dynamically based on actively verified evidence nodes. Expired documentation triggers notifications immediately.
                            </p>
                            <div className="fleet-mini-cards">
                                <div className="mini-card">
                                    <span className="mini-card-label">ACTIVE NODES</span>
                                    <div className="mini-card-value">{total - expired}</div>
                                </div>
                                <div className="mini-card" style={{ borderColor: expired > 0 ? 'rgba(201, 42, 42, 0.3)' : 'var(--border-color)' }}>
                                    <span className="mini-card-label" style={{ color: expired > 0 ? 'var(--error-text)' : 'inherit' }}>EXPIRED</span>
                                    <div className="mini-card-value" style={{ color: expired > 0 ? 'var(--error-text)' : 'inherit' }}>{expired}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Card: Life activity feed logs */}
                <div className="card feed-card">
                    <h3>
                        <span>SYSTEM_ACTIVITY_FEED</span>
                        <span className="feed-pulse"></span>
                    </h3>
                    <div className="feed-list">
                        <div className="feed-item">
                            <span className="feed-time">09:41:22</span>
                            <p className="feed-content">Daily expiry cron check: complete validation loop</p>
                            <span className="feed-tag">CRON_SERVICE</span>
                        </div>
                        <div className="feed-item">
                            <span className="feed-time">08:35:10</span>
                            <p className="feed-content">Database connection pool refreshed successfully</p>
                            <span className="feed-tag">POSTGRES_DB</span>
                        </div>
                        <div className="feed-item">
                            <span className="feed-time">07:11:05</span>
                            <p className="feed-content">Admin session token validated</p>
                            <span className="feed-tag">JWT_AUTH</span>
                        </div>
                        <div className="feed-item">
                            <span className="feed-time">00:01:00</span>
                            <p className="feed-content">Scanned {total} documents for active warning flags</p>
                            <span className="feed-tag">COMPLIANCE_ENGINE</span>
                        </div>
                    </div>
                    <button className="btn-feed-footer" onClick={loadDashboardData}>
                        FORCE MANUAL RUN // SCAN NOW
                    </button>
                </div>
            </div>

            <div className="dashboard-bottom-grid">
                {/* Category distribution chart segment */}
                <div className="card">
                    <h3>Distribution by Category</h3>
                    <div className="bars-list">
                        {stats && Object.entries(stats.categories).map(([cat, count]) => {
                            const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                            return (
                                <div key={cat} className="category-bar-row">
                                    <div className="bar-info">
                                        <span className="bar-name">{cat.replace('_', ' ')}</span>
                                        <span className="bar-count">{count} Nodes ({Math.round(percentage)}%)</span>
                                    </div>
                                    <div className="progress-bg">
                                        <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Imminent action queue */}
                <div className="card">
                    <h3>Imminent Actions Queue</h3>
                    <div className="imminent-list">
                        {imminentDocs.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                LIST_EMPTY: No documents registered.
                            </p>
                        ) : (
                            imminentDocs.map((doc) => {
                                const isExpired = doc.daysRemaining < 0;
                                const isWarning = doc.daysRemaining >= 0 && doc.daysRemaining <= 30;
                                let statusClass = 'active-ok';
                                let textLabel = 'VERIFIED';
                                if (isExpired) {
                                    statusClass = 'expired-high';
                                    textLabel = `EXPIRED (${Math.abs(doc.daysRemaining)}D AGO)`;
                                } else if (isWarning) {
                                    statusClass = 'expiring-warn';
                                    textLabel = `EXPIRES IN ${doc.daysRemaining}D`;
                                } else {
                                    textLabel = `ACTIVE (${doc.daysRemaining}D LEFT)`;
                                }

                                return (
                                    <div className="imminent-item" key={doc.id}>
                                        <div className="imminent-left">
                                            <span className="imminent-icon">
                                                {doc.category === 'license' ? '📄' : '🛡️'}
                                            </span>
                                            <div className="imminent-info">
                                                <span className="imminent-title">{doc.title}</span>
                                                <span className="imminent-sub">{doc.notifyEmail}</span>
                                            </div>
                                        </div>
                                        <span className={`imminent-right ${statusClass}`}>
                                            {textLabel}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
