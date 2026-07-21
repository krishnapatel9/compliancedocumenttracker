import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

function Frameworks() {
    const { authFetch } = useAuth();
    const [controls, setControls] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [selectedFramework, setSelectedFramework] = useState('SOC2');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [linkLoading, setLinkLoading] = useState(null); // stores controlCode for linking

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            // Fetch controls
            const controlsRes = await authFetch('/api/frameworks');
            if (!controlsRes.ok) throw new Error('Failed to fetch framework controls');
            const controlsData = await controlsRes.json();
            setControls(controlsData);

            // Fetch all documents for linking dropdown
            const documentsRes = await authFetch('/api/documents?limit=100');
            if (!documentsRes.ok) throw new Error('Failed to fetch inventory documents');
            const documentsData = await documentsRes.json();
            setDocuments(documentsData.items || documentsData.documents || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleLink = async (controlCode, documentId) => {
        setLinkLoading(controlCode);
        try {
            const res = await authFetch('/api/frameworks/link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    framework: selectedFramework,
                    controlCode,
                    documentId: documentId || null
                })
            });

            if (!res.ok) throw new Error('Failed to save mapping');

            await fetchData();
        } catch (err) {
            alert(err.message);
        } finally {
            setLinkLoading(null);
        }
    };

    const filteredControls = controls.filter(c => c.framework === selectedFramework);

    return (
        <div className="page-container animate-fade-in" style={{ padding: '2rem', color: '#f1f3f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#fff', margin: 0 }}>Compliance Frameworks</h1>
                    <p style={{ color: '#868e96', fontSize: '0.9rem', marginTop: '0.25rem' }}>Map inventory documents to active international controls checklist requirements.</p>
                </div>

                <div className="framework-selector-tabs" style={{ display: 'flex', gap: '0.5rem', backgroundColor: '#090f18', padding: '4px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {['SOC2', 'ISO27001', 'GDPR'].map(fw => (
                        <button
                            key={fw}
                            onClick={() => setSelectedFramework(fw)}
                            style={{
                                border: 'none',
                                background: selectedFramework === fw ? '#101726' : 'transparent',
                                color: selectedFramework === fw ? '#4c6ef5' : '#868e96',
                                padding: '0.5rem 1.2rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 550,
                                transition: 'all 0.2s',
                                border: selectedFramework === fw ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent'
                            }}
                        >
                            {fw === 'SOC2' ? 'SOC 2 Type II' : fw === 'ISO27001' ? 'ISO 27001' : 'GDPR'}
                        </button>
                    ))}
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
                    {filteredControls.map(ctrl => {
                        const isMapped = !!ctrl.document;
                        const doc = ctrl.document;

                        return (
                            <div
                                key={ctrl.controlCode}
                                style={{
                                    backgroundColor: '#090f18',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    borderRadius: '8px',
                                    padding: '1.25rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '2rem',
                                    transition: 'border-color 0.25s',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(76, 110, 245, 0.2)'}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'}
                            >
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                                        <span style={{
                                            fontFamily: 'monospace',
                                            fontSize: '0.85rem',
                                            backgroundColor: '#101726',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            color: '#4c6ef5',
                                            border: '1px solid rgba(76,110,245,0.15)'
                                        }}>{ctrl.controlCode}</span>
                                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff', fontWeight: 550 }}>{ctrl.name}</h3>
                                    </div>
                                    <p style={{ margin: 0, color: '#868e96', fontSize: '0.85rem', lineHeight: '1.4' }}>{ctrl.description}</p>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '400px', justifyContent: 'flex-end' }}>
                                    {isMapped ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#101726', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', width: '100%', justifyContent: 'space-between' }}>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                                                <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</div>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    color: doc.status === 'expired' ? '#fa5252' : doc.status === 'expiring_soon' ? '#fd7e14' : '#40c057',
                                                    fontWeight: 650,
                                                    textTransform: 'uppercase'
                                                }}>
                                                    ● {doc.status === 'expiring_soon' ? 'expiring soon' : doc.status}
                                                </span>
                                            </div>

                                            <button
                                                onClick={() => handleLink(ctrl.controlCode, null)}
                                                disabled={linkLoading === ctrl.controlCode}
                                                style={{
                                                    backgroundColor: 'transparent',
                                                    border: 'none',
                                                    color: '#fa5252',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '4px',
                                                    transition: 'background-color 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(250,82,82,0.1)'}
                                                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                                            >
                                                {linkLoading === ctrl.controlCode ? 'Unlinking...' : 'Unlink'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
                                            <select
                                                id={`select-${ctrl.controlCode}`}
                                                defaultValue=""
                                                style={{
                                                    flex: 1,
                                                    backgroundColor: '#101726',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    color: '#e1e3e5',
                                                    fontSize: '0.85rem',
                                                    padding: '0.5rem',
                                                    borderRadius: '6px',
                                                    outline: 'none',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <option value="" disabled>Choose compliance document...</option>
                                                {documents.map(d => (
                                                    <option key={d.id} value={d.id}>{d.title} ({d.category})</option>
                                                ))}
                                            </select>

                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById(`select-${ctrl.controlCode}`);
                                                    if (select.value) {
                                                        handleLink(ctrl.controlCode, select.value);
                                                    }
                                                }}
                                                disabled={linkLoading === ctrl.controlCode}
                                                style={{
                                                    backgroundColor: '#4c6ef5',
                                                    border: 'none',
                                                    color: '#fff',
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 550,
                                                    transition: 'filter 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.target.style.filter = 'brightness(1.1)'}
                                                onMouseLeave={(e) => e.target.style.filter = 'brightness(1)'}
                                            >
                                                {linkLoading === ctrl.controlCode ? 'Linking...' : 'Link'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default Frameworks;
