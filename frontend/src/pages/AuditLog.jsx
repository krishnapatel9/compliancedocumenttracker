import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime, readJson } from '../utils/format';
import { ACTION_LABELS, describeEntry } from '../utils/audit';

const PAGE_SIZE = 25;

function AuditLog() {
    const { authFetch } = useAuth();
    const toast = useToast();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [action, setAction] = useState('');
    const [actor, setActor] = useState('');
    const [appliedActor, setAppliedActor] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: PAGE_SIZE });
            if (action) params.set('action', action);
            if (appliedActor) params.set('actor', appliedActor);
            if (from) params.set('from', from);
            if (to) params.set('to', to);
            const res = await authFetch(`/api/audit-logs?${params}`);
            const data = await readJson(res);
            if (!res.ok) throw new Error(data.error || 'Failed to load the audit log');
            setEntries(data.items || []);
            setTotalPages(data.totalPages || 1);
            setTotalItems(data.totalItems || 0);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, action, appliedActor, from, to]);

    useEffect(() => { load(); }, [load]);

    const reset = () => { setAction(''); setActor(''); setAppliedActor(''); setFrom(''); setTo(''); setPage(1); };

    return (
        <div>
            <header className="page-head">
                <div>
                    <h1>Audit log</h1>
                    <p>Who did what, and when. Entries cannot be edited or deleted, and they outlive the documents they describe.</p>
                </div>
            </header>

            <form className="filters-inline" onSubmit={(e) => { e.preventDefault(); setPage(1); setAppliedActor(actor.trim()); }}>
                <label>Action
                    <select className="select" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
                        <option value="">All actions</option>
                        {Object.entries(ACTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                </label>
                <label>Person
                    <input className="input" type="text" placeholder="Email" value={actor} onChange={(e) => setActor(e.target.value)} />
                </label>
                <label>From<input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
                <label>To<input className="input" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
                <button type="submit" className="btn secondary">Apply</button>
                {(action || appliedActor || from || to) && <button type="button" className="link-btn" onClick={reset}>Clear filters</button>}
            </form>

            <div className="panel">
                {loading ? (
                    <p className="loading" style={{ padding: '24px 20px' }}>Loading…</p>
                ) : entries.length === 0 ? (
                    <div className="empty"><strong>No matching entries</strong>Try widening the filters.</div>
                ) : (
                    <div className="table-wrap">
                        <table className="table">
                            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Document</th><th>IP address</th></tr></thead>
                            <tbody>
                                {entries.map((e) => (
                                    <tr key={e.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.createdAt)}</td>
                                        <td>{e.actorEmail}</td>
                                        <td>{describeEntry(e)}</td>
                                        <td>{e.documentTitle || '—'}</td>
                                        <td>{e.ip || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="pager">
                    <span>{totalItems} {totalItems === 1 ? 'entry' : 'entries'}, page {page} of {totalPages}</span>
                    <div className="pager-btns">
                        <button className="btn secondary small" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
                        <button className="btn secondary small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AuditLog;
