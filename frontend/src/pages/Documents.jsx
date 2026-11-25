import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate, formatDateTime, toInputDate, readJson } from '../utils/format';
import { describeEntry } from '../utils/audit';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';

const CATEGORIES = [['license', 'Licence'], ['certificate', 'Certificate'], ['insurance', 'Insurance policy'], ['contract', 'Contract'], ['permit', 'Permit'], ['tax_document', 'Tax document']];
const categoryLabel = (key) => (CATEGORIES.find(([k]) => k === key) || [key, key])[1];
const msg = (v) => (Array.isArray(v) ? v.join(' ') : v);

const SORT_OPTIONS = {
    newest: { label: 'Newest first', sort: 'createdAt', order: 'desc' },
    expiry_asc: { label: 'Expiry: soonest', sort: 'expiryDate', order: 'asc' },
    expiry_desc: { label: 'Expiry: latest', sort: 'expiryDate', order: 'desc' },
    title: { label: 'Title A-Z', sort: 'title', order: 'asc' },
};

function Documents() {
    const { authFetch } = useAuth();
    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();

    // List state
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);

    // Pagination & Filtering state
    const [searchQuery, setSearchQuery] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [sortKey, setSortKey] = useState('newest');
    const [view, setView] = useState('active'); // 'active' | 'trash'
    const [history, setHistory] = useState([]);
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const itemsPerPage = 5;

    // Form states (Create)
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('license');
    const [issueDate, setIssueDate] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [notifyEmail, setNotifyEmail] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState(null);

    const [formErrors, setFormErrors] = useState({});
    const [submitError, setSubmitError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Modal active states
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [activeModal, setActiveModal] = useState(null); // 'create' | 'details' | 'edit' | 'delete'

    // Form states (Edit)
    const [editTitle, setEditTitle] = useState('');
    const [editCategory, setEditCategory] = useState('license');
    const [editIssueDate, setEditIssueDate] = useState('');
    const [editExpiryDate, setEditExpiryDate] = useState('');
    const [editNotifyEmail, setEditNotifyEmail] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editFile, setEditFile] = useState(null);
    const [editErrors, setEditErrors] = useState({});
    const [editSubmitting, setEditSubmitting] = useState(false);

    const fetchDocuments = async () => {
        try {
            setLoading(true);
            setFetchError(null);
            const params = new URLSearchParams({
                page: currentPage,
                limit: itemsPerPage,
                sort: view === 'trash' ? 'deletedAt' : SORT_OPTIONS[sortKey].sort,
                order: view === 'trash' ? 'desc' : SORT_OPTIONS[sortKey].order
            });
            if (view === 'trash') params.set('trash', 'true');
            if (appliedSearch) params.set('search', appliedSearch);
            if (filterCategory) params.set('category', filterCategory);
            if (filterStatus) params.set('status', filterStatus);
            const res = await authFetch(`/api/documents?${params.toString()}`);
            if (!res.ok) throw new Error((await readJson(res)).error || 'Failed to fetch documents');
            const data = await res.json();
            setDocuments(data.items || []);
            setTotalPages(data.totalPages || 1);
            setTotalItems(data.totalItems || 0);
            // The last item of a page was deleted, or filters shrank the result: go to the last real page.
            if ((data.items || []).length === 0 && currentPage > 1) {
                setCurrentPage(Math.max(1, data.totalPages || 1));
            }
        } catch (err) {
            setFetchError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch when page or dropdown filters change
    useEffect(() => {
        fetchDocuments();
    }, [currentPage, filterCategory, filterStatus, appliedSearch, sortKey, view]);

    // Change history for the document shown in the details modal
    useEffect(() => {
        if (activeModal !== 'details' || !selectedDoc) { setHistory([]); return; }
        let cancelled = false;
        (async () => {
            try {
                const res = await authFetch(`/api/audit-logs?entityId=${selectedDoc.id}&limit=20`);
                if (res.ok && !cancelled) setHistory((await res.json()).items || []);
            } catch { /* history is optional; the modal still works without it */ }
        })();
        return () => { cancelled = true; };
    }, [activeModal, selectedDoc]);

    // /documents?open=<id> opens that document's details (links from the overview)
    useEffect(() => {
        const id = searchParams.get('open');
        if (!id) return;
        (async () => {
            try {
                const res = await authFetch(`/api/documents/${id}`);
                if (res.ok) { setSelectedDoc(await res.json()); setActiveModal('details'); }
            } catch { /* ignore: the register still loads */ }
            setSearchParams((p) => { p.delete('open'); return p; }, { replace: true });
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const switchView = (next) => {
        setView(next);
        setCurrentPage(1);
        setDocuments([]);
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setCurrentPage(1);
        setAppliedSearch(searchQuery.trim());
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setAppliedSearch('');
        setFilterCategory('');
        setFilterStatus('');
        setCurrentPage(1);
    };

    const handleFileChange = (e, isEdit = false) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            if (selectedFile.type !== 'application/pdf') {
                const err = { file: 'PDF files only are allowed' };
                isEdit ? setEditErrors(err) : setFormErrors(err);
                isEdit ? setEditFile(null) : setFile(null);
            } else if (selectedFile.size > 5 * 1024 * 1024) {
                const err = { file: 'File size must be under 5MB' };
                isEdit ? setEditErrors(err) : setFormErrors(err);
                isEdit ? setEditFile(null) : setFile(null);
            } else {
                isEdit ? setEditErrors({}) : setFormErrors({});
                isEdit ? setEditFile(selectedFile) : setFile(selectedFile);
            }
        }
    };

    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        setSubmitError(null);
        setFormErrors({});

        if (!file) {
            setFormErrors({ file: 'Upload path PDF is required' });
            return;
        }

        setSubmitting(true);

        const formData = new FormData();
        formData.append('title', title);
        formData.append('category', category);
        formData.append('issueDate', issueDate);
        formData.append('expiryDate', expiryDate);
        formData.append('notifyEmail', notifyEmail);
        formData.append('description', description);
        formData.append('file', file);

        try {
            const res = await authFetch('/api/documents', {
                method: 'POST',
                body: formData
            });

            const data = await readJson(res);

            if (!res.ok) {
                if (data.error === 'Validation failed' && data.details) {
                    setFormErrors(data.details);
                } else {
                    setSubmitError(data.error || 'Server error. Could not create document.');
                }
                return;
            }

            toast.success('Document registered.');
            setTitle('');
            setCategory('license');
            setIssueDate('');
            setExpiryDate('');
            setNotifyEmail('');
            setDescription('');
            setFile(null);
            setActiveModal(null); // Close creation drawer
            fetchDocuments();
        } catch (err) {
            setSubmitError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditOpen = (doc) => {
        setSelectedDoc(doc);
        setEditTitle(doc.title);
        setEditCategory(doc.category);
        setEditIssueDate(toInputDate(doc.issueDate));
        setEditExpiryDate(toInputDate(doc.expiryDate));
        setEditNotifyEmail(doc.notifyEmail);
        setEditDescription(doc.description || '');
        setEditFile(null);
        setEditErrors({});
        setActiveModal('edit');
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        setEditErrors({});
        setEditSubmitting(true);

        const formData = new FormData();
        formData.append('title', editTitle);
        formData.append('category', editCategory);
        formData.append('issueDate', editIssueDate);
        formData.append('expiryDate', editExpiryDate);
        formData.append('notifyEmail', editNotifyEmail);
        formData.append('description', editDescription);
        if (editFile) {
            formData.append('file', editFile);
        }

        try {
            const res = await authFetch(`/api/documents/${selectedDoc.id}`, {
                method: 'PUT',
                body: formData
            });

            const data = await readJson(res);

            if (!res.ok) {
                if (data.error === 'Validation failed' && data.details) {
                    setEditErrors(data.details);
                } else {
                    toast.error(data.error || 'Failed to update document');
                }
                return;
            }

            toast.success('Document updated.');
            setActiveModal(null);
            fetchDocuments();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setEditSubmitting(false);
        }
    };

    const handleDeleteSubmit = async () => {
        try {
            const res = await authFetch(`/api/documents/${selectedDoc.id}`, { method: 'DELETE' });
            const data = await readJson(res);
            if (!res.ok) throw new Error(data.error || 'Deletion failed');
            toast.success(data.message || 'Document moved to trash.');
            setActiveModal(null);
            fetchDocuments();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleRestore = async (doc) => {
        try {
            const res = await authFetch(`/api/documents/${doc.id}/restore`, { method: 'POST' });
            if (!res.ok) throw new Error((await readJson(res)).error || 'Restore failed');
            toast.success(`"${doc.title}" restored.`);
            fetchDocuments();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handlePurgeSubmit = async () => {
        try {
            const res = await authFetch(`/api/documents/${selectedDoc.id}/permanent`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await readJson(res)).error || 'Permanent deletion failed');
            toast.success('Document permanently deleted.');
            setActiveModal(null);
            fetchDocuments();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleDownload = async (docId, docTitle) => {
        try {
            const res = await authFetch(`/api/documents/${docId}/file`);
            if (!res.ok) throw new Error((await readJson(res)).error || 'Attachment download failed. Check server status.');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            try {
                const a = document.createElement('a');
                a.href = url;
                a.download = `${docTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } finally {
                window.URL.revokeObjectURL(url);
            }
        } catch (err) {
            toast.error('Download failed: ' + err.message);
        }
    };

    const closeDrawer = () => setActiveModal(null);
    const hasFilters = Boolean(searchQuery || appliedSearch || filterCategory || filterStatus);

    return (
        <div>
            <header className="page-head">
                <div>
                    <h1>Documents</h1>
                    <p>Every licence, certificate, policy and permit, with its expiry date and who is reminded.</p>
                </div>
                {view === 'active' && (
                    <div className="page-actions">
                        <button className="btn" onClick={() => { setSubmitError(null); setFormErrors({}); setActiveModal('create'); }}>
                            <Icon name="plus" size={16} /> Add document
                        </button>
                    </div>
                )}
            </header>

            <div className="tabs" role="tablist">
                <button role="tab" className="tab" aria-selected={view === 'active'} onClick={() => switchView('active')}>Register</button>
                <button role="tab" className="tab" aria-selected={view === 'trash'} onClick={() => switchView('trash')}>Trash</button>
            </div>

            <form className="toolbar" onSubmit={handleSearchSubmit} role="search">
                <div className="search">
                    <Icon name="search" size={16} />
                    <input className="input" type="search" placeholder="Search title or notes" aria-label="Search documents" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <select className="select" aria-label="Category" value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}>
                    <option value="">All categories</option>
                    {CATEGORIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                {view === 'active' && (
                    <select className="select" aria-label="Status" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}>
                        <option value="">Any status</option>
                        <option value="active">In date</option>
                        <option value="expiring_soon">Expiring soon</option>
                        <option value="expired">Expired</option>
                    </select>
                )}
                {view === 'active' && (
                    <select className="select" aria-label="Sort" value={sortKey} onChange={(e) => { setSortKey(e.target.value); setCurrentPage(1); }}>
                        {Object.entries(SORT_OPTIONS).map(([key, o]) => <option key={key} value={key}>{o.label}</option>)}
                    </select>
                )}
                <button type="submit" className="btn secondary">Search</button>
                {hasFilters && <button type="button" className="link-btn" onClick={handleClearFilters}>Clear filters</button>}
            </form>

            {fetchError && <div className="notice error" role="alert">{fetchError}<button className="btn secondary small" onClick={fetchDocuments}>Try again</button></div>}

            <div className="panel">
                {loading ? (
                    <p className="loading" style={{ padding: '24px 20px' }}>Loading…</p>
                ) : documents.length === 0 ? (
                    <div className="empty">
                        <strong>{view === 'trash' ? 'The trash is empty' : hasFilters ? 'No documents match' : 'No documents yet'}</strong>
                        {view === 'trash' ? 'Deleted documents wait here for 30 days before they are removed for good.' : hasFilters ? 'Try a different search or clear the filters.' : 'Add the first document to start the register.'}
                    </div>
                ) : (
                    <>
                        <div className="table-wrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Document</th>
                                        <th>{view === 'trash' ? 'Deleted' : 'Status'}</th>
                                        <th>Expires</th>
                                        <th className="hide-sm">Reminders go to</th>
                                        <th className="actions"><span className="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {documents.map((doc) => (
                                        <tr key={doc.id}>
                                            <td>
                                                <button className="cell-title" onClick={() => { setSelectedDoc(doc); setActiveModal('details'); }}>{doc.title}</button>
                                                <div className="cell-sub">{categoryLabel(doc.category)}</div>
                                            </td>
                                            <td>
                                                {view === 'trash' ? (
                                                    <span>{formatDate(doc.deletedAt)}<span className="cell-sub">Removed for good {formatDate(doc.purgeAt)}</span></span>
                                                ) : (
                                                    <StatusBadge status={doc.status} days={doc.daysRemaining} />
                                                )}
                                            </td>
                                            <td>{formatDate(doc.expiryDate)}</td>
                                            <td className="hide-sm">{doc.notifyEmail}</td>
                                            <td className="actions">
                                                {view === 'trash' ? (
                                                    <>
                                                        <button className="icon-btn" onClick={() => handleRestore(doc)} aria-label={`Restore ${doc.title}`} title="Restore"><Icon name="restore" /></button>
                                                        <button className="icon-btn danger" onClick={() => { setSelectedDoc(doc); setActiveModal('purge'); }} aria-label={`Delete ${doc.title} forever`} title="Delete forever"><Icon name="trash" /></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button className="icon-btn" onClick={() => handleDownload(doc.id, doc.title)} disabled={!doc.hasFile} aria-label={`Download ${doc.title}`} title={doc.hasFile ? 'Download PDF' : 'No file stored. Re-upload it via Edit'}><Icon name="download" /></button>
                                                        <button className="icon-btn" onClick={() => handleEditOpen(doc)} aria-label={`Edit ${doc.title}`} title="Edit"><Icon name="edit" /></button>
                                                        <button className="icon-btn danger" onClick={() => { setSelectedDoc(doc); setActiveModal('delete'); }} aria-label={`Move ${doc.title} to trash`} title="Move to trash"><Icon name="trash" /></button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="pager">
                            <span>{totalItems} {totalItems === 1 ? 'document' : 'documents'}{totalPages > 1 ? `, page ${currentPage} of ${totalPages}` : ''}</span>
                            {totalPages > 1 && (
                                <div className="pager-btns">
                                    <button className="btn secondary small" onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1}>Previous</button>
                                    <button className="btn secondary small" onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}>Next</button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Details drawer */}
            {activeModal === 'details' && selectedDoc && (
                <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeDrawer()}>
                    <aside className="drawer" role="dialog" aria-modal="true" aria-label="Document details">
                        <div className="drawer-head">
                            <div>
                                <h2>{selectedDoc.title}</h2>
                                <div className="cell-sub">{categoryLabel(selectedDoc.category)}</div>
                            </div>
                            <button className="icon-btn" onClick={closeDrawer} aria-label="Close"><Icon name="close" /></button>
                        </div>
                        <div className="drawer-body">
                            <dl className="facts">
                                <dt>Status</dt><dd>{selectedDoc.deletedAt ? 'In the trash' : <StatusBadge status={selectedDoc.status} days={selectedDoc.daysRemaining} />}</dd>
                                <dt>Issued</dt><dd>{formatDate(selectedDoc.issueDate)}</dd>
                                <dt>Expires</dt><dd>{formatDate(selectedDoc.expiryDate)}</dd>
                                <dt>Reminders to</dt><dd>{selectedDoc.notifyEmail}</dd>
                                <dt>File</dt><dd>{selectedDoc.hasFile ? `${selectedDoc.file.fileName} (${Math.max(1, Math.round(selectedDoc.file.size / 1024))} KB)` : 'No PDF stored. Re-upload it via Edit.'}</dd>
                                <dt>Notes</dt><dd>{selectedDoc.description || 'None'}</dd>
                                <dt>Reference</dt><dd style={{ fontSize: 12 }}>{selectedDoc.id}</dd>
                            </dl>

                            <h3 className="section-title">History</h3>
                            {history.length === 0 ? (
                                <p className="cell-sub">No changes recorded yet.</p>
                            ) : (
                                <ol className="timeline">
                                    {history.map((e) => (
                                        <li key={e.id}>
                                            <span>{describeEntry(e)}</span>
                                            <span className="when">{formatDateTime(e.createdAt)} by {e.actorEmail}</span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </div>
                        {!selectedDoc.deletedAt && (
                            <div className="drawer-foot">
                                <button className="btn secondary" disabled={!selectedDoc.hasFile} onClick={() => handleDownload(selectedDoc.id, selectedDoc.title)}><Icon name="download" size={16} /> Download PDF</button>
                                <button className="btn" onClick={() => handleEditOpen(selectedDoc)}><Icon name="edit" size={16} /> Edit</button>
                            </div>
                        )}
                    </aside>
                </div>
            )}

            {/* Add drawer */}
            {activeModal === 'create' && (
                <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeDrawer()}>
                    <aside className="drawer" role="dialog" aria-modal="true" aria-label="Add document">
                        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div className="drawer-head">
                                <h2>Add a document</h2>
                                <button type="button" className="icon-btn" onClick={closeDrawer} aria-label="Close"><Icon name="close" /></button>
                            </div>
                            <div className="drawer-body">
                                {submitError && <div className="notice error" role="alert">{submitError}</div>}
                                <div className="field">
                                    <label htmlFor="title">Title</label>
                                    <input type="text" id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. ISO 9001 certificate" required />
                                    {formErrors.title && <span className="field-error">{msg(formErrors.title)}</span>}
                                </div>
                                <div className="field">
                                    <label htmlFor="category">Category</label>
                                    <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} required>
                                        {CATEGORIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                                    </select>
                                    {formErrors.category && <span className="field-error">{msg(formErrors.category)}</span>}
                                </div>
                                <div className="field-row">
                                    <div className="field">
                                        <label htmlFor="issueDate">Issue date</label>
                                        <input type="date" id="issueDate" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
                                        {formErrors.issueDate && <span className="field-error">{msg(formErrors.issueDate)}</span>}
                                    </div>
                                    <div className="field">
                                        <label htmlFor="expiryDate">Expiry date</label>
                                        <input type="date" id="expiryDate" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
                                        {formErrors.expiryDate && <span className="field-error">{msg(formErrors.expiryDate)}</span>}
                                    </div>
                                </div>
                                <div className="field">
                                    <label htmlFor="notifyEmail">Send reminders to</label>
                                    <input type="email" id="notifyEmail" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} placeholder="compliance@company.com" required />
                                    {formErrors.notifyEmail && <span className="field-error">{msg(formErrors.notifyEmail)}</span>}
                                </div>
                                <div className="field">
                                    <label htmlFor="description">Notes (optional)</label>
                                    <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
                                </div>
                                <div className="field">
                                    <label htmlFor="file-upload">PDF (up to 5 MB)</label>
                                    <input type="file" id="file-upload" accept="application/pdf" onChange={(e) => handleFileChange(e, false)} />
                                    {formErrors.file && <span className="field-error">{msg(formErrors.file)}</span>}
                                </div>
                            </div>
                            <div className="drawer-foot">
                                <button type="button" className="btn secondary" onClick={closeDrawer}>Cancel</button>
                                <button type="submit" className="btn" disabled={submitting}>{submitting ? 'Saving…' : 'Add document'}</button>
                            </div>
                        </form>
                    </aside>
                </div>
            )}

            {/* Edit drawer */}
            {activeModal === 'edit' && selectedDoc && (
                <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeDrawer()}>
                    <aside className="drawer" role="dialog" aria-modal="true" aria-label="Edit document">
                        <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div className="drawer-head">
                                <h2>Edit document</h2>
                                <button type="button" className="icon-btn" onClick={closeDrawer} aria-label="Close"><Icon name="close" /></button>
                            </div>
                            <div className="drawer-body">
                                <div className="field">
                                    <label htmlFor="edit-title">Title</label>
                                    <input type="text" id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                                    {editErrors.title && <span className="field-error">{msg(editErrors.title)}</span>}
                                </div>
                                <div className="field">
                                    <label htmlFor="edit-category">Category</label>
                                    <select id="edit-category" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} required>
                                        {CATEGORIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                                    </select>
                                </div>
                                <div className="field-row">
                                    <div className="field">
                                        <label htmlFor="edit-issue">Issue date</label>
                                        <input type="date" id="edit-issue" value={editIssueDate} onChange={(e) => setEditIssueDate(e.target.value)} required />
                                        {editErrors.issueDate && <span className="field-error">{msg(editErrors.issueDate)}</span>}
                                    </div>
                                    <div className="field">
                                        <label htmlFor="edit-expiry">Expiry date</label>
                                        <input type="date" id="edit-expiry" value={editExpiryDate} onChange={(e) => setEditExpiryDate(e.target.value)} required />
                                        {editErrors.expiryDate && <span className="field-error">{msg(editErrors.expiryDate)}</span>}
                                    </div>
                                </div>
                                <div className="field">
                                    <label htmlFor="edit-email">Send reminders to</label>
                                    <input type="email" id="edit-email" value={editNotifyEmail} onChange={(e) => setEditNotifyEmail(e.target.value)} required />
                                    {editErrors.notifyEmail && <span className="field-error">{msg(editErrors.notifyEmail)}</span>}
                                </div>
                                <div className="field">
                                    <label htmlFor="edit-description">Notes</label>
                                    <textarea id="edit-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                                </div>
                                <div className="field">
                                    <label htmlFor="edit-file">Replace the PDF (optional)</label>
                                    <input type="file" id="edit-file" accept="application/pdf" onChange={(e) => handleFileChange(e, true)} />
                                    {editErrors.file && <span className="field-error">{msg(editErrors.file)}</span>}
                                </div>
                            </div>
                            <div className="drawer-foot">
                                <button type="button" className="btn secondary" onClick={closeDrawer}>Cancel</button>
                                <button type="submit" className="btn" disabled={editSubmitting}>{editSubmitting ? 'Saving…' : 'Save changes'}</button>
                            </div>
                        </form>
                    </aside>
                </div>
            )}

            {/* Confirmations */}
            {activeModal === 'delete' && selectedDoc && (
                <div className="overlay center" onClick={(e) => e.target === e.currentTarget && closeDrawer()}>
                    <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Move to trash">
                        <div className="drawer-head"><h2>Move to trash?</h2></div>
                        <div className="drawer-body">
                            <p><strong>{selectedDoc.title}</strong> leaves the register and stops sending reminders. You can restore it from the Trash tab for 30 days; after that it is deleted for good. The deletion is written to the audit log.</p>
                        </div>
                        <div className="drawer-foot">
                            <button className="btn secondary" onClick={closeDrawer}>Cancel</button>
                            <button className="btn danger" onClick={handleDeleteSubmit}>Move to trash</button>
                        </div>
                    </div>
                </div>
            )}

            {activeModal === 'purge' && selectedDoc && (
                <div className="overlay center" onClick={(e) => e.target === e.currentTarget && closeDrawer()}>
                    <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Delete forever">
                        <div className="drawer-head"><h2>Delete forever?</h2></div>
                        <div className="drawer-body">
                            <p><strong>{selectedDoc.title}</strong> will be removed permanently, with its PDF and reminder history. This cannot be undone. The audit log keeps a record that it was deleted, and by whom.</p>
                        </div>
                        <div className="drawer-foot">
                            <button className="btn secondary" onClick={closeDrawer}>Cancel</button>
                            <button className="btn danger" onClick={handlePurgeSubmit}>Delete forever</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Documents;
