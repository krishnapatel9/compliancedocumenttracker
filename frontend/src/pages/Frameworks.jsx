import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { readJson } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

const FRAMEWORKS = [['SOC2', 'SOC 2'], ['ISO27001', 'ISO 27001'], ['GDPR', 'GDPR']];

function Frameworks() {
    const { authFetch } = useAuth();
    const toast = useToast();
    const [controls, setControls] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [selectedFramework, setSelectedFramework] = useState('SOC2');
    const [picks, setPicks] = useState({});          // controlCode -> chosen document id
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(null);          // controlCode being saved

    const fetchData = async () => {
        setError('');
        try {
            const controlsRes = await authFetch('/api/frameworks');
            if (!controlsRes.ok) throw new Error((await readJson(controlsRes)).error || 'Could not load the controls');
            setControls(await controlsRes.json());

            const docsRes = await authFetch('/api/documents?limit=100&sort=title&order=asc');
            if (!docsRes.ok) throw new Error((await readJson(docsRes)).error || 'Could not load the documents');
            setDocuments((await docsRes.json()).items || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchData(); }, []);

    const handleLink = async (controlCode, documentId) => {
        setBusy(controlCode);
        try {
            const res = await authFetch('/api/frameworks/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ framework: selectedFramework, controlCode, documentId: documentId || null })
            });
            if (!res.ok) throw new Error((await readJson(res)).error || 'Could not save the link');
            setPicks((p) => ({ ...p, [controlCode]: '' }));
            await fetchData();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setBusy(null);
        }
    };

    const shown = controls.filter((c) => c.framework === selectedFramework);
    const covered = shown.filter((c) => c.document).length;
    const gaps = shown.filter((c) => c.document && c.document.status !== 'active').length;

    return (
        <div>
            <header className="page-head">
                <div>
                    <h1>Frameworks</h1>
                    <p>Attach a document as evidence for each control. A control is only as good as its document: one that expires leaves the control exposed.</p>
                </div>
            </header>

            <div className="tabs" role="tablist">
                {FRAMEWORKS.map(([key, label]) => (
                    <button key={key} role="tab" className="tab" aria-selected={selectedFramework === key} onClick={() => setSelectedFramework(key)}>{label}</button>
                ))}
            </div>

            {loading ? (
                <p className="loading">Loading controls…</p>
            ) : error ? (
                <div className="notice error" role="alert">{error}<button className="btn secondary small" onClick={fetchData}>Try again</button></div>
            ) : (
                <>
                    <div className="fw-summary">
                        <span><strong style={{ color: 'var(--page-text)' }}>{covered} of {shown.length}</strong> controls have evidence{gaps > 0 ? `, ${gaps} with a document that is expired or expiring` : ''}</span>
                        <div className="bar-track" role="img" aria-label={`${covered} of ${shown.length} controls covered`}><div className="bar-fill" style={{ width: `${shown.length ? (covered / shown.length) * 100 : 0}%` }} /></div>
                    </div>

                    <section className="panel">
                        {shown.map((ctrl) => {
                            const saving = busy === ctrl.controlCode;
                            return (
                                <div className="control" key={ctrl.controlCode}>
                                    <span className="code">{ctrl.controlCode}</span>
                                    <div>
                                        <h3>{ctrl.name}</h3>
                                        <p>{ctrl.description}</p>
                                    </div>
                                    {ctrl.document ? (
                                        <div className="evidence">
                                            <div className="evidence-doc">
                                                <strong title={ctrl.document.title}>{ctrl.document.title}</strong>
                                                <StatusBadge status={ctrl.document.status} days={ctrl.document.daysRemaining} />
                                            </div>
                                            <button className="link-btn danger" onClick={() => handleLink(ctrl.controlCode, null)} disabled={saving}>{saving ? 'Removing…' : 'Remove'}</button>
                                        </div>
                                    ) : (
                                        <div className="evidence">
                                            <select className="select" aria-label={`Evidence for ${ctrl.controlCode}`} value={picks[ctrl.controlCode] || ''} onChange={(e) => setPicks((p) => ({ ...p, [ctrl.controlCode]: e.target.value }))}>
                                                <option value="">Choose a document</option>
                                                {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                                            </select>
                                            <button className="btn small" disabled={!picks[ctrl.controlCode] || saving} onClick={() => handleLink(ctrl.controlCode, picks[ctrl.controlCode])}>{saving ? 'Saving…' : 'Attach'}</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </section>
                </>
            )}
        </div>
    );
}

export default Frameworks;
