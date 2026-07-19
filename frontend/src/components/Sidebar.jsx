import React from 'react';
import { useAuth } from '../context/AuthContext';

function Sidebar({ currentPage, setCurrentPage }) {
    const { logout } = useAuth();

    return (
        <aside className="sidebar">
            <div className="sidebar-top-icons">
                <div className="sidebar-brand-icon">
                    {/* Minimal Hexagon/Shield Logo 'C' */}
                    <div className="sidebar-brand-circle" style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '4px',
                        backgroundColor: '#101726',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'center',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        color: '#4c6ef5',
                        fontSize: '16px'
                    }}>
                        C
                    </div>
                </div>

                <nav className="sidebar-menu">
                    <button
                        className={`sidebar-menu-btn ${currentPage === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setCurrentPage('dashboard')}
                        title="Overview Dashboard"
                    >
                        <span>⛃</span>
                    </button>
                    <button
                        className={`sidebar-menu-btn ${currentPage === 'documents' ? 'active' : ''}`}
                        onClick={() => setCurrentPage('documents')}
                        title="Document Repository"
                    >
                        <span>📄</span>
                    </button>
                    {/* Static placeholders matching screenshot items */}
                    <button className="sidebar-menu-btn" title="Shield Frameworks (Locked)">
                        <span>🛡️</span>
                    </button>
                    <button className="sidebar-menu-btn" title="System Warnings (Locked)">
                        <span>⚠</span>
                    </button>
                    <button className="sidebar-menu-btn" title="Activity Analytics (Locked)">
                        <span>📊</span>
                    </button>
                </nav>
            </div>

            <div className="sidebar-bottom-icons" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                alignItems: 'center',
                width: '100%'
            }}>
                {/* Secondary icons matching screenshot help & logout settings */}
                <button className="sidebar-menu-btn" title="General Help Resources">
                    <span>❓</span>
                </button>
                <button
                    className="sidebar-menu-btn"
                    onClick={logout}
                    title="Sign Out"
                    style={{ color: '#fa5252' }}
                >
                    <span>⚙</span>
                </button>
            </div>
        </aside>
    );
}

export default Sidebar;
