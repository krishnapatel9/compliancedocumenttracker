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
    const itemsPerPage = 5; // 5 per page makes verifying pages easy!

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
    const [activeModal, setActiveModal] = useState(null); // 'details' | 'edit' | 'delete'

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

    // Use a separate search trigger so users can type without lag
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

            setSuccessMsg('Document successfully created!');
            setTitle('');
            setCategory('license');
            setIssueDate('');
            setExpiryDate('');
            setNotifyEmail('');
            setDescription('');
            setFile(null);
            document.getElementById('file-upload').value = '';

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

    const getStatusClass = (status) => {
        switch (status) {
            case 'expired': return 'badge-expired';
            case 'expiring_soon': return 'badge-expiring';
            default: return 'badge-active';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'expired': return 'Expired';
            case 'expiring_soon': return 'Expiring Soon';
            default: return 'Active';
        }
    };

    return (
        <div className="documents-page">
            <div className="page-header">
                <h2>Document Management</h2>
                <p className="page-desc">Track regulatory lifecycles, configure warning thresholds, and observe computed status indicators.</p>
            </div>

            <div className="layout-content">
                {/* Left Side: Create Form */}
                <section className="form-section card">
                    <h3>Create Compliance Document</h3>

                    {successMsg && <div className="alert-success">{successMsg}</div>}
                    {submitError && <div className="alert-error">❌ {submitError}</div>}

                    <form onSubmit={handleCreateSubmit} className="document-form">
                        <div className="form-group">
                            <label htmlFor="title">Document Title</label>
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
                            <label htmlFor="category">Category</label>
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
                            <label htmlFor="notifyEmail">Reminder Notification Email</label>
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
                            <label htmlFor="description">Notes / Description (Optional)</label>
                            <textarea
                                id="description"
                                rows="3"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Details about renewal process, contract numbers..."
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
                            <span className="file-help">Accepts PDF files only, up to 5MB</span>
                            {formErrors.file && <span className="field-error">{formErrors.file}</span>}
                        </div>

                        <button type="submit" className="btn-primary" disabled={submitting}>
                            {submitting ? 'Creating...' : 'Create Document'}
                        </button>
                    </form>
                </section>

                {/* Right Side: List Table */}
                <section className="table-section card">
                    <div className="table-header">
                        <h3>Registered Documents ({totalItems})</h3>
                        <button className="btn-icon" onClick={fetchDocuments} title="Refresh documents">🔄</button>
                    </div>

                    {/* Search and Filters Bar */}
                    <form onSubmit={handleSearchSubmit} className="search-filter-bar">
                        <div className="search-field">
                            <input
                                type="text"
                                placeholder="Search by title/desc..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <button type="submit" className="btn-search-go">🔍</button>
                        </div>
                        <div className="filter-selects">
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
                                <option value="active">Active</option>
                                <option value="expiring_soon">Expiring Soon</option>
                                <option value="expired">Expired</option>
                            </select>
                            {(searchQuery || filterCategory || filterStatus) && (
                                <button type="button" className="btn-clear-filters" onClick={handleClearFilters}>
                                    Clear
                                </button>
                            )}
                        </div>
                    </form>

                    {fetchError && (
                        <div className="alert-error">
                            Failed to load documents: {fetchError}
                        </div>
                    )}

                    {loading ? (
                        <p className="state-loading">Syncing active database records...</p>
                    ) : documents.length === 0 ? (
                        <div className="state-empty">
                            <span className="empty-icon">📁</span>
                            <p>No matching compliance documents found.</p>
                            {searchQuery || filterCategory || filterStatus ? (
                                <p className="empty-sub">Try modifying search tags or clearing active status filter overrides.</p>
                            ) : (
                                <p className="empty-sub">Fill out the left form to upload and monitor your first document.</p>
                            )}
                        </div>
                    ) : (
                        <React.Fragment>
                            <div className="table-wrapper">
                                <table className="custom-table">
                                    <thead>
                                        <tr>
                                            <th>Title</th>
                                            <th>Category</th>
                                            <th>Expiry Date</th>
                                            <th>Days Left</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {documents.map((doc) => (
                                            <tr key={doc.id}>
                                                <td
                                                    className="td-title click-title"
                                                    onClick={() => { setSelectedDoc(doc); setActiveModal('details'); }}
                                                    title="Click to view details"
                                                >
                                                    {doc.title}
                                                </td>
                                                <td className="td-category">{doc.category.replace('_', ' ')}</td>
                                                <td>{new Date(doc.expiryDate).toLocaleDateString()}</td>
                                                <td className="td-days">
                                                    {doc.daysRemaining < 0 ? (
                                                        <span className="text-expired">{doc.daysRemaining} days</span>
                                                    ) : (
                                                        <span>{doc.daysRemaining} days</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`badge ${getStatusClass(doc.status)}`}>
                                                        {getStatusLabel(doc.status)}
                                                    </span>
                                                </td>
                                                <td className="td-actions">
                                                    <button className="btn-table-action" onClick={() => handleDownload(doc.id, doc.title)} title="Download PDF">📥</button>
                                                    <button className="btn-table-action" onClick={() => handleEditOpen(doc)} title="Edit metadata">✏️</button>
                                                    <button className="btn-table-action btn-delete" onClick={() => { setSelectedDoc(doc); setActiveModal('delete'); }} title="Delete document">🗑️</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="pagination-wrapper">
                                    <button
                                        className="btn-page"
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                    >
                                        ◀ Prev
                                    </button>
                                    <span className="page-indicator">
                                        Page <strong>{currentPage}</strong> of {totalPages}
                                    </span>
                                    <button
                                        className="btn-page"
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                    >
                                        Next ▶
                                    </button>
                                </div>
                            )}
                        </React.Fragment>
                    )}
                </section>
            </div>

            {/* Modal 1: Details View */}
            {activeModal === 'details' && selectedDoc && (
                <div className="modal-backdrop">
                    <div className="modal-content card">
                        <div className="modal-header">
                            <h3>Document Details</h3>
                            <button className="btn-close" onClick={() => setActiveModal(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="detail-row">
                                <span className="detail-label">Title:</span>
                                <span className="detail-value">{selectedDoc.title}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Category:</span>
                                <span className="detail-value capitalized">{selectedDoc.category.replace('_', ' ')}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Status:</span>
                                <span className="detail-value">
                                    <span className={`badge ${getStatusClass(selectedDoc.status)}`}>
                                        {getStatusLabel(selectedDoc.status)} ({selectedDoc.daysRemaining} days remaining)
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
                                <span className="detail-label">Reminder Email:</span>
                                <span className="detail-value">{selectedDoc.notifyEmail}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Notes / Description:</span>
                                <p className="detail-desc">{selectedDoc.description || 'No notes descriptive text provided for this document.'}</p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => handleDownload(selectedDoc.id, selectedDoc.title)}>📥 Download PDF File</button>
                            <button className="btn-primary" onClick={() => handleEditOpen(selectedDoc)}>✏️ Edit Document</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal 2: Edit Form */}
            {activeModal === 'edit' && selectedDoc && (
                <div className="modal-backdrop">
                    <div className="modal-content edit-modal-content card">
                        <div className="modal-header">
                            <h3>Edit Document Metadata</h3>
                            <button className="btn-close" onClick={() => setActiveModal(null)}>✕</button>
                        </div>
                        <form onSubmit={handleEditSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label htmlFor="edit-title">Document Title</label>
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
                                    <label htmlFor="edit-category">Category</label>
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
                                    <label htmlFor="edit-notifyEmail">Reminder Email</label>
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
                                    <label htmlFor="edit-description">Description / Notes</label>
                                    <textarea
                                        id="edit-description"
                                        rows="3"
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                    />
                                    {editErrors.description && <span className="field-error">{editErrors.description}</span>}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="edit-file-upload">Replace Attachment (Optional)</label>
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

            {/* Modal 3: Delete Confirm */}
            {activeModal === 'delete' && selectedDoc && (
                <div className="modal-backdrop">
                    <div className="modal-content delete-modal card">
                        <div className="modal-header">
                            <h3>Delete Document?</h3>
                            <button className="btn-close" onClick={() => setActiveModal(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p>Are you sure you want to delete the document <strong>"{selectedDoc.title}"</strong>?</p>
                            <p className="delete-warning">⚠️ This action is irreversible. Associated files and scheduled warning alerts will be deleted permanently.</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                            <button className="btn-primary btn-confirm-delete" onClick={handleDeleteSubmit}>Confirm Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Documents;
