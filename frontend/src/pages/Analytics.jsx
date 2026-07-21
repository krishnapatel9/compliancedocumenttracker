import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

function Analytics() {
    const { authFetch } = useAuth();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await authFetch('/api/dashboard');
            if (!res.ok) throw new Error('Failed to fetch dashboard analytics');
            const data = await res.json();
            setStats(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ border: '1px solid #fa5252', padding: '1rem', borderRadius: '8px', backgroundColor: 'rgba(250,82,82,0.05)', color: '#fa5252', margin: '2rem' }}>
                <strong>Fetch error:</strong> {error}
            </div>
        );
    }

    const {
        total = 0,
        expired = 0,
        expiring7d = 0,
        expiring30d = 0,
        expiring60d = 0,
        expiring90d = 0,
        categories = {},
        healthRate = 100,
        warningsCount = 0,
        monthlyUploads = []
    } = stats || {};

    const maxUploadCount = Math.max(...monthlyUploads.map(m => m.count), 1);

    // Categories shares
    const categoryColors = {
        license: '#4c6ef5',
        certificate: '#12b886',
        insurance: '#ffd43b',
        contract: '#da77f2',
        permit: '#fa5252',
        tax_document: '#fd7e14'
    };

    return (
        <div className="page-container animate-fade-in" style={{ padding: '2rem', color: '#f1f3f5' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#fff', margin: 0 }}>Activity & Compliance Analytics</h1>
                <p style={{ color: '#868e96', fontSize: '0.9rem', marginTop: '0.25rem' }}>Visual summaries reporting document category distributions, expiry windows, and ingestion growth rates.</p>
            </div>

            {/* Metrics cards grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                <div style={{ backgroundColor: '#090f18', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#868e96', fontWeight: 550 }}>REGULATORY HEALTH INDEX</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <span style={{ fontSize: '2.2rem', fontWeight: 700, color: healthRate >= 80 ? '#40c057' : healthRate >= 50 ? '#fd7e14' : '#fa5252' }}>{healthRate}%</span>
                    </div>
                    <div style={{ height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${healthRate}%`, height: '100%', backgroundColor: healthRate >= 80 ? '#40c057' : healthRate >= 50 ? '#fd7e14' : '#fa5252' }}></div>
                    </div>
                </div>

                <div style={{ backgroundColor: '#090f18', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#868e96', fontWeight: 550 }}>TOTAL COMPLIANCE ASSETS</span>
                    <span style={{ fontSize: '2.2rem', fontWeight: 700, color: '#fff' }}>{total}</span>
                    <span style={{ fontSize: '0.75rem', color: '#868e96' }}>PDF documents active in directory</span>
                </div>

                <div style={{ backgroundColor: '#090f18', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#868e96', fontWeight: 550 }}>DISPATCHED NOTIFICATIONS</span>
                    <span style={{ fontSize: '2.2rem', fontWeight: 700, color: '#ffd43b' }}>{warningsCount}</span>
                    <span style={{ fontSize: '0.75rem', color: '#ffd43b' }}>Alerts logs written by system cron</span>
                </div>

                <div style={{ backgroundColor: '#090f18', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#868e96', fontWeight: 550 }}>CRITICAL EXPIRED ALERTS</span>
                    <span style={{ fontSize: '2.2rem', fontWeight: 700, color: expired > 0 ? '#fa5252' : '#868e96' }}>{expired}</span>
                    <span style={{ fontSize: '0.75rem', color: expired > 0 ? '#fa5252' : '#868e96' }}>Requires immediate renewals updates</span>
                </div>
            </div>

            {/* Second row of charts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>

                {/* 1. Historical Upload Growth Rate (Custom SVG Bar Histogram) */}
                <div style={{ backgroundColor: '#090f18', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', color: '#fff', fontWeight: 600, margin: '0 0 1.5rem 0' }}>Asset Ingestion Trend (6M)</h3>

                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '200px', padding: '0 1rem 1rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {monthlyUploads.map((m, idx) => {
                            const barPercent = Math.min((m.count / maxUploadCount) * 100, 100);
                            return (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '12%', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 550 }}>{m.count}</span>
                                    <div style={{
                                        width: '100%',
                                        height: `${Math.max(barPercent * 1.5, 4)}px`,
                                        backgroundColor: '#4c6ef5',
                                        borderRadius: '3px 3px 0 0',
                                        boxShadow: '0 0 10px rgba(76,110,245,0.25)',
                                        transition: 'height 0.3s'
                                    }}></div>
                                    <span style={{ fontSize: '0.75rem', color: '#868e96', transform: 'translateY(10px)' }}>{m.month}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Expiry Timelines Projection Windows */}
                <div style={{ backgroundColor: '#090f18', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', color: '#fff', fontWeight: 600, margin: '0 0 1.5rem 0' }}>Expiry Timelines Projection</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                        {[
                            { label: 'Next 7 Days Threshold', count: expiring7d, color: '#fa5252' },
                            { label: 'Next 30 Days Threshold', count: expiring30d, color: '#fd7e14' },
                            { label: 'Next 60 Days Threshold', count: expiring60d, color: '#ffd43b' },
                            { label: 'Next 90 Days Threshold', count: expiring90d, color: '#4c6ef5' }
                        ].map((win, idx) => {
                            const percent = total > 0 ? Math.min((win.count / total) * 100, 100) : 0;
                            return (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                        <span style={{ color: '#a6a7ab' }}>{win.label}</span>
                                        <span style={{ color: '#fff', fontWeight: 600 }}>{win.count} documents ({Math.round(percent)}%)</span>
                                    </div>
                                    <div style={{ height: '6px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${percent}%`,
                                            height: '100%',
                                            backgroundColor: win.color,
                                            borderRadius: '3px',
                                            transition: 'width 0.3s'
                                        }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>

            {/* Ingestion Categories Breakdown percentages */}
            <div style={{ backgroundColor: '#090f18', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.5rem', marginTop: '2.5rem' }}>
                <h3 style={{ fontSize: '1rem', color: '#fff', fontWeight: 600, margin: '0 0 1.5rem 0' }}>Compliance Category Proportions</h3>

                <div style={{ display: 'flex', height: '14px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '7px', overflow: 'hidden', marginBottom: '1.5rem' }}>
                    {Object.entries(categories).map(([cat, val]) => {
                        const percent = total > 0 ? (val / total) * 100 : 0;
                        if (percent === 0) return null;
                        return (
                            <div
                                key={cat}
                                style={{
                                    width: `${percent}%`,
                                    height: '100%',
                                    backgroundColor: categoryColors[cat] || '#868e96'
                                }}
                                title={`${cat}: ${val} (${Math.round(percent)}%)`}
                            />
                        );
                    })}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                    {Object.entries(categories).map(([cat, val]) => {
                        const percent = total > 0 ? Math.round((val / total) * 100) : 0;
                        return (
                            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: categoryColors[cat] }} />
                                <span style={{ textTransform: 'capitalize', color: '#a6a7ab' }}>
                                    {cat.replace('_', ' ')}: <strong style={{ color: '#fff' }}>{val}</strong> ({percent}%)
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default Analytics;
