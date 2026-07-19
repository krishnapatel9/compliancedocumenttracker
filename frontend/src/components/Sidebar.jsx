import React from 'react';
import { useAuth } from '../context/AuthContext';

function Sidebar({ currentPage, setCurrentPage }) {
    const { admin, logout } = useAuth();

    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <span className="logo-symbol">🛡️</span>
                <h3>DocShield</h3>
            </div>
            <div className="sidebar-profile">
                <span className="profile-avatar">👤</span>
                <div className="profile-details">
                    <span className="profile-role">System Admin</span>
                    <span className="profile-email" title={admin?.email}>{admin?.email || 'admin@compliance.com'}</span>
                </div>
            </div>
            <nav className="sidebar-menu">
                <button
                    className={`menu-item ${currentPage === 'dashboard' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('dashboard')}
                >
                    <span className="menu-icon">📊</span>
                    <span className="menu-label">Dashboard</span>
                </button>
                <button
                    className={`menu-item ${currentPage === 'documents' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('documents')}
                >
                    <span className="menu-icon">📄</span>
                    <span className="menu-label">Documents</span>
                </button>
            </nav>
            <div className="sidebar-footer">
                <button className="btn-logout" onClick={logout}>
                    <span className="logout-icon">🚪</span>
                    Sign Out
                </button>
            </div>
        </aside>
    );
}

export default Sidebar;
