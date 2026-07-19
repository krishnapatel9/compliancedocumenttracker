import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

function Dashboard() {
    const { authFetch } = useAuth();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const res = await authFetch('/api/dashboard');
            if (!res.ok) throw new Error('Failed to fetch dashboard metrics');
            const data = await res.json();
            setStats(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading) return <div className="state-loading">Analyzing compliance database documents...</div>;
    if (error) return <div className="alert-error">Failed to load statistics: {error}</div>;

    return (
        <div className="dashboard-page">
            <div className="page-header">
                <h2>Executive Dashboard</h2>
                <p className="page-desc">Overview of organizational compliance health, imminent expiries, and document distributions.</p>
            </div>

            {stats && (
                <React.Fragment>
                    {/* Metrics Grid */}
                    <div className="stats-grid">
                        <div className="stat-card">
                            <span className="stat-icon">📄</span>
                            <div className="stat-info">
                                <span className="stat-label">Total Documents</span>
                                <span className="stat-value">{stats.total}</span>
                            </div>
                        </div>

                        <div className="stat-card urgent">
                            <span className="stat-icon">🚨</span>
                            <div className="stat-info">
                                <span className="stat-label">Expired</span>
                                <span className="stat-value">{stats.expired}</span>
                            </div>
                        </div>

                        <div className="stat-card warning">
                            <span className="stat-icon">⚠️</span>
                            <div className="stat-info">
                                <span className="stat-label">Expiring (30 Days)</span>
                                <span className="stat-value">{stats.expiring30d}</span>
                            </div>
                        </div>

                        <div className="stat-card info">
                            <span className="stat-icon">⏳</span>
                            <div className="stat-info">
                                <span className="stat-label">Expiring (7 Days)</span>
                                <span className="stat-value">{stats.expiring7d}</span>
                            </div>
                        </div>
                    </div>

                    {/* Metrics Breakdown chart section */}
                    <div className="insights-section card">
                        <h3>Document Distribution by Category</h3>
                        <div className="bars-list">
                            {Object.entries(stats.categories).map(([cat, count]) => {
                                const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                                return (
                                    <div key={cat} className="category-bar-row">
                                        <div className="bar-info">
                                            <span className="bar-name">{cat.replace('_', ' ')}</span>
                                            <span className="bar-count">{count} documents ({Math.round(percentage)}%)</span>
                                        </div>
                                        <div className="progress-bg">
                                            <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </React.Fragment>
            )}
        </div>
    );
}

export default Dashboard;
