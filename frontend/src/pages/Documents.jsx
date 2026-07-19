import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

function Documents() {
    const { authFetch } = useAuth();

    // List state
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);

    // Pagination & Filtering state
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const itemsPerPage = 5;

    // Filters open state mock
    const [filtersOpen, setFiltersOpen] = useState(true);

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
    const [successMsg, setSuccessMsg] = useState(null);

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
            const params = new URLSearchParams({
                page: currentPage,
                limit: itemsPerPage,
                search: searchQuery,
                category: filterCategory,
                status: filterStatus
            });
            const res = await authFetch(`/api/documents?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch documents');
            const data = await res.json();
            setDocuments(data.items || []);
            setTotalPages(data.totalPages || 1);
            setTotalItems(data.totalItems || 0);
        } catch (err) {
            setFetchError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch when page or dropdown filters change
    useEffect(() => {
        fetchDocuments();
    }, [currentPage, filterCategory, filterStatus]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setCurrentPage(1);
        fetchDocuments();
    };

    const handleClearFilters = () => {
        setSearchQuery('');
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
        setSuccessMsg(null);

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

            const data = await res.json();

            if (!res.ok) {
                if (data.error === 'Validation failed' && data.details) {
                    setFormErrors(data.details);
                } else {
                    setSubmitError(data.error || 'Server error. Could not create document.');
                }
                return;
            }

            setSuccessMsg('Asset successfully registered!');
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
        setEditIssueDate(new Date(doc.issueDate).toISOString().substring(0, 10));
        setEditExpiryDate(new Date(doc.expiryDate).toISOString().substring(0, 10));
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

            const data = await res.json();

            if (!res.ok) {
                if (data.error === 'Validation failed' && data.details) {
                    setEditErrors(data.details);
                } else {
                    alert(data.error || 'Failed to update document');
                }
                return;
            }

            setActiveModal(null);
            fetchDocuments();
        } catch (err) {
            alert(err.message);
        } finally {
            setEditSubmitting(false);
        }
    };

    const handleDeleteSubmit = async () => {
        try {
            const res = await authFetch(`/api/documents/${selectedDoc.id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Deletion failed');
            setActiveModal(null);
            fetchDocuments();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDownload = async (docId, docTitle) => {
        try {
            const res = await authFetch(`/api/documents/${docId}/file`);
            if (!res.ok) throw new Error('Attachment download failed. Check server status.');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${docTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            alert('Error downloading: ' + err.message);
        }
    };

    const getStatusPipeClass = (status) => {
        switch (status) {
            case 'expired': return 'status-pipe-expired';
            case 'expiring_soon': return 'status-pipe-warning';
            default: return 'status-pipe-verified';
        }
    };

    const getStatusLabelText = (status) => {
        switch (status) {
            case 'expired': return 'EXPIRED';
            case 'expiring_soon': return 'EXPIRING_SOON';
            default: return 'VERIFIED';
        }
    };

    return (
        <div className="doc-repository">
            <div className="doc-repository-header">
                <div>
                    <h2>Document Repository</h2>
                    <p className="repo-subtitle">Manage and audit institutional evidence, policy frameworks, and compliance certificates.</p>
                </div>

                <div className="repo-header-actions">
                    <button
                        className="btn-secondary"
                        onClick={() => setFiltersOpen(!filtersOpen)}
                        title="Toggle search filters"
                    >
                        <span>☰</span> Filters
                    </button>
                    <button
                        className="btn-accent"
                        onClick={() => {
                            setSubmitError(null);
                            setFormErrors({});
                            setSuccessMsg(null);
                            setActiveModal('create');
                        }}
                    >
                        + Upload Asset
                    </button>
                </div>
            </div>

            {/* Custom search filter bar drawer */}
            {filtersOpen && (
                <form onSubmit={handleSearchSubmit} className="registry-filter-overlay filter-drawer-open">
                    <div className="search-input-wrapper">
                        <input
                            type="text"
                            placeholder="Filter by title/desc..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <button type="submit" className="btn-search-go">🔍</button>
                    </div>

                    <div className="select-filters-wrapper">
                        <select
                            value={filterCategory}
                            onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
                            title="Filter by category"
                        >
                            <option value="">All Categories</option>
                            <option value="license">License</option>
                            <option value="certificate">Certificate</option>
                            <option value="insurance">Insurance Policy</option>
                            <option value="contract">Contract</option>
                            <option value="permit">Permit</option>
                            <option value="tax_document">Tax Document</option>
                        </select>

                        <select
                            value={filterStatus}
                            onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                            title="Filter by status"
                        >
                            <option value="">All Statuses</option>
                            <option value="active">Active Docs</option>
                            <option value="expiring_soon">Expiring Soon</option>
                            <option value="expired">Expired Docs</option>
                        </select>

                        {(searchQuery || filterCategory || filterStatus) && (
                            <button type="button" className="btn-clear-capsule" onClick={handleClearFilters}>
                                Reset Fields
                            </button>
                        )}
                    </div>
                </form>
            )}

            {/* Status bar checklist */}
            <div className="repo-sort-bar">
                <div className="sort-bar-left">
                    <span className="sort-item">SORT BY: <strong>LAST_MODIFIED</strong></span>
                    <span className="sort-item" style={{ opacity: 0.5 }}>CLASSIFICATION: UNRESTRICTED</span>
                </div>
                <div>
                    <span>TOTAL_RECORDS: {totalItems}</span>
                </div>
            </div>

            {fetchError && (
                <div className="alert-error" style={{ margin: '1rem' }}>
                    [-] CATALOG SYNCHRONIZATION FAILURE: {fetchError}
                </div>
            )}

            {loading ? (
                <div className="state-loading" style={{ color: '#868e96', fontFamily: 'monospace' }}>
                    [+] RETRIEVING COMPLIANCE CATALOG INDEXING RECORDSET...
                </div>
            ) : documents.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem', borderTop: 'none' }}>
                    <p style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        [-] QUERY_EMPTY: No matching regulatory documents registered on organizational nodes.
                    </p>
                </div>
            ) : (
                <div className="card repo-table-card">
                    <div className="repo-table-wrapper">
                        <table className="repo-table">
                            <thead>
                                <tr>
                                    <th className="checkbox-col-cell"><input type="checkbox" readOnly /></th>
                                    <th>Document ID</th>
                                    <th>Label / Name</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Custodian</th>
                                    <th>Exp Date</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc) => {
                                    const codeId = `DOC-${doc.category.substring(0, 2).toUpperCase()}-${doc.id.substring(0, 4).toUpperCase()}`;
                                    const isExpired = doc.daysRemaining < 0;
                                    const isWarning = doc.daysRemaining >= 0 && doc.daysRemaining <= 30;

                                    return (
                                        <tr key={doc.id}>
                                            <td className="checkbox-col-cell"><input type="checkbox" readOnly /></td>
                                            <td className="doc-code-cell">{codeId}</td>
                                            <td
                                                className="doc-name-cell"
                                                onClick={() => { setSelectedDoc(doc); setActiveModal('details'); }}
                                                title="View detailed audit checklist"
                                            >
                                                {doc.title}
                                            </td>
                                            <td>
                                                <span className="doc-type-cell">
                                                    {doc.category.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="doc-status-cell">
                                                <span className={`status-pipe-indicator ${getStatusPipeClass(doc.status)}`}></span>
                                                <span className={isExpired ? 'exp-date-expired' : isWarning ? 'exp-date-warning' : ''}>
                                                    {getStatusLabelText(doc.status)}
                                                </span>
                                            </td>
                                            <td className="doc-custodian-cell">{doc.notifyEmail}</td>
                                            <td className={`doc-exp-cell ${isExpired ? 'exp-date-expired' : isWarning ? 'exp-date-warning' : ''}`}>
                                                {new Date(doc.expiryDate).toLocaleDateString()}
                                            </td>
                                            <td className="action-btns-cell">
                                                <button
                                                    className="btn-table-icon"
                                                    onClick={() => handleDownload(doc.id, doc.title)}
                                                    title="Download Original PDF Attachment"
                                                >
                                                    📥
                                                </button>
                                                <button
                                                    className="btn-table-icon"
                                                    onClick={() => handleEditOpen(doc)}
                                                    title="Modify Metadata Properties"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="btn-table-icon btn-delete"
                                                    onClick={() => { setSelectedDoc(doc); setActiveModal('delete'); }}
                                                    title="Permanently Expunge Record Node"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination control row */}
                    {totalPages > 1 && (
                        <div className="repo-pagination-row">
                            <span>
                                Page <strong>{currentPage}</strong> of {totalPages}
                            </span>
                            <div className="repo-pagination-btn-group">
                                <button
                                    className="btn-repo-page"
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                >
                                    ◀ Prev
                                </button>
                                <button
                                    className="btn-repo-page"
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                >
                                    Next ▶
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modal: Details view drawer */}
            {activeModal === 'details' && selectedDoc && (
                <div className="modal-backdrop">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Document Registry Audit Details</h3>
                            <button className="btn-close" onClick={() => setActiveModal(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="detail-row">
                                <span className="detail-label">Asset UUID:</span>
                                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{selectedDoc.id}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Document:</span>
                                <span className="detail-value">{selectedDoc.title}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Category:</span>
                                <span className="detail-value capitalized">{selectedDoc.category.replace('_', ' ')}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Node Status:</span>
                                <span className="detail-value">
                                    <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                                        {getStatusLabelText(selectedDoc.status)} ({selectedDoc.daysRemaining} days remaining)
                                    </span>
                                </span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Issue Date:</span>
                                <span className="detail-value">{new Date(selectedDoc.issueDate).toLocaleDateString()}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Expiry Date:</span>
                                <span className="detail-value">{new Date(selectedDoc.expiryDate).toLocaleDateString()}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Recipient:</span>
                                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{selectedDoc.notifyEmail}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Audit Notes:</span>
                                <p className="detail-desc">{selectedDoc.description || 'No system notes or additional metadata exists for this catalog record.'}</p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => handleDownload(selectedDoc.id, selectedDoc.title)}>📥 Download PDF</button>
                            <button className="btn-primary" onClick={() => handleEditOpen(selectedDoc)}>✏️ Edit Asset</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Create Document Form Drawer */}
            {activeModal === 'create' && (
                <div className="modal-backdrop">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Register New evidence Asset</h3>
                            <button className="btn-close" onClick={() => setActiveModal(null)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateSubmit}>
                            <div className="modal-body">
                                {submitError && <div className="alert-error">[-] REGISTER_ERROR: {submitError}</div>}

                                <div className="form-group">
                                    <label htmlFor="title">Asset Title</label>
                                    <input
                                        type="text"
                                        id="title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="e.g. ISO 9001 Certificate"
                                        required
                                    />
                                    {formErrors.title && <span className="field-error">{formErrors.title}</span>}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="category">Category Type</label>
                                    <select
                                        id="category"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        required
                                    >
                                        <option value="license">License</option>
                                        <option value="certificate">Certificate</option>
                                        <option value="insurance">Insurance Policy</option>
                                        <option value="contract">Contract</option>
                                        <option value="permit">Permit</option>
                                        <option value="tax_document">Tax Document</option>
                                    </select>
                                    {formErrors.category && <span className="field-error">{formErrors.category}</span>}
                                </div>

                                <div className="form-row">
                                    <div className="form-group col">
                                        <label htmlFor="issueDate">Issue Date</label>
                                        <input
                                            type="date"
                                            id="issueDate"
                                            value={issueDate}
                                            onChange={(e) => setIssueDate(e.target.value)}
                                            required
                                        />
                                        {formErrors.issueDate && <span className="field-error">{formErrors.issueDate}</span>}
                                    </div>

                                    <div className="form-group col">
                                        <label htmlFor="expiryDate">Expiry Date</label>
                                        <input
                                            type="date"
                                            id="expiryDate"
                                            value={expiryDate}
                                            onChange={(e) => setExpiryDate(e.target.value)}
                                            required
                                        />
                                        {formErrors.expiryDate && <span className="field-error">{formErrors.expiryDate}</span>}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="notifyEmail">Custodian Contact Email</label>
                                    <input
                                        type="email"
                                        id="notifyEmail"
                                        value={notifyEmail}
                                        onChange={(e) => setNotifyEmail(e.target.value)}
                                        placeholder="compliance officer email address"
                                        required
                                    />
                                    {formErrors.notifyEmail && <span className="field-error">{formErrors.notifyEmail}</span>}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="description">Audit Notes / Descriptions</label>
                                    <textarea
                                        id="description"
                                        rows="3"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Outline renewal procedures, contracts mapping reference..."
                                    />
                                    {formErrors.description && <span className="field-error">{formErrors.description}</span>}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="file-upload">PDF Attachment</label>
                                    <input
                                        type="file"
                                        id="file-upload"
                                        accept="application/pdf"
                                        onChange={(e) => handleFileChange(e, false)}
                                        required
                                    />
                                    <span className="file-help">Strictly accepts PDF files up to 5MB</span>
                                    {formErrors.file && <span className="field-error">{formErrors.file}</span>}
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                                <button type="submit" className="btn-primary" disabled={submitting}>
                                    {submitting ? 'Registering...' : 'Upload Asset'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Edit Form Drawer */}
            {activeModal === 'edit' && selectedDoc && (
                <div className="modal-backdrop">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Modify Asset metadata</h3>
                            <button className="btn-close" onClick={() => setActiveModal(null)}>✕</button>
                        </div>
                        <form onSubmit={handleEditSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label htmlFor="edit-title">Asset Title</label>
                                    <input
                                        type="text"
                                        id="edit-title"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        required
                                    />
                                    {editErrors.title && <span className="field-error">{editErrors.title}</span>}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit-category">Category Type</label>
                                    <select
                                        id="edit-category"
                                        value={editCategory}
                                        onChange={(e) => setEditCategory(e.target.value)}
                                        required
                                    >
                                        <option value="license">License</option>
                                        <option value="certificate">Certificate</option>
                                        <option value="insurance">Insurance Policy</option>
                                        <option value="contract">Contract</option>
                                        <option value="permit">Permit</option>
                                        <option value="tax_document">Tax Document</option>
                                    </select>
                                    {editErrors.category && <span className="field-error">{editErrors.category}</span>}
                                </div>

                                <div className="form-row">
                                    <div className="form-group col">
                                        <label htmlFor="edit-issueDate">Issue Date</label>
                                        <input
                                            type="date"
                                            id="edit-issueDate"
                                            value={editIssueDate}
                                            onChange={(e) => setEditIssueDate(e.target.value)}
                                            required
                                        />
                                        {editErrors.issueDate && <span className="field-error">{editErrors.issueDate}</span>}
                                    </div>

                                    <div className="form-group col">
                                        <label htmlFor="edit-expiryDate">Expiry Date</label>
                                        <input
                                            type="date"
                                            id="edit-expiryDate"
                                            value={editExpiryDate}
                                            onChange={(e) => setEditExpiryDate(e.target.value)}
                                            required
                                        />
                                        {editErrors.expiryDate && <span className="field-error">{editErrors.expiryDate}</span>}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit-notifyEmail">Custodian Email</label>
                                    <input
                                        type="email"
                                        id="edit-notifyEmail"
                                        value={editNotifyEmail}
                                        onChange={(e) => setEditNotifyEmail(e.target.value)}
                                        required
                                    />
                                    {editErrors.notifyEmail && <span className="field-error">{editErrors.notifyEmail}</span>}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit-description">Audit Notes / Descriptions</label>
                                    <textarea
                                        id="edit-description"
                                        rows="3"
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                    />
                                    {editErrors.description && <span className="field-error">{editErrors.description}</span>}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit-file-upload">Replace PDF Attachment (Optional)</label>
                                    <input
                                        type="file"
                                        id="edit-file-upload"
                                        accept="application/pdf"
                                        onChange={(e) => handleFileChange(e, true)}
                                    />
                                    <span className="file-help">Leave empty to keep existing binary file attachment on server</span>
                                    {editErrors.file && <span className="field-error">{editErrors.file}</span>}
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setActiveModal('details')}>Cancel</button>
                                <button type="submit" className="btn-primary" disabled={editSubmitting}>
                                    {editSubmitting ? 'Updating...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Delete confirm */}
            {activeModal === 'delete' && selectedDoc && (
                <div className="modal-backdrop">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Expunge Record Node?</h3>
                            <button className="btn-close" onClick={() => setActiveModal(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '0.85rem' }}>Are you sure you want to permanently delete the document <strong>"{selectedDoc.title}"</strong>?</p>
                            <p className="delete-warning">⚠️ This action is irreversible. Associated files and scheduled warning alerts will be deleted permanently.</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                            <button className="btn-primary btn-confirm-delete" onClick={handleDeleteSubmit}>Confirm Expunge</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Documents;
